// Polite HTTP fetching: identifies itself, obeys robots.txt, caps time and size per request.
import { BOT_TOKEN, BOT_UA } from '../config.mjs';
import { pickHeaders, extractPage } from './extract.mjs';

const MAX_BODY = 3 * 1024 * 1024;

async function get(url, { method = 'GET', timeout = 15000, accept = 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5' } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  const started = Date.now();
  try {
    const res = await fetch(url, {
      method,
      redirect: 'follow',
      signal: ctrl.signal,
      headers: { 'User-Agent': BOT_UA, Accept: accept, 'Accept-Language': 'en-US,en;q=0.8' },
    });
    const ttfb = Date.now() - started;
    let bytes = null;
    if (method !== 'HEAD') {
      const chunks = [];
      let size = 0;
      for await (const chunk of res.body ?? []) {
        size += chunk.length;
        if (size > MAX_BODY) { ctrl.abort(); break; }
        chunks.push(chunk);
      }
      bytes = Buffer.concat(chunks);
    } else {
      res.body?.cancel().catch(() => {});
    }
    return { res, bytes, ttfb, total: Date.now() - started };
  } finally {
    clearTimeout(timer);
  }
}

function decode(bytes, contentType) {
  let charset = (contentType.match(/charset=["']?([\w-]+)/i) || [])[1];
  if (!charset) {
    const head = bytes.subarray(0, 4096).toString('latin1');
    charset = (head.match(/<meta[^>]+charset=["']?([\w-]+)/i) || [])[1];
  }
  try {
    return new TextDecoder((charset || 'utf-8').toLowerCase(), { fatal: false }).decode(bytes);
  } catch {
    return new TextDecoder('utf-8').decode(bytes);
  }
}

/**
 * Parses robots.txt. Returns
 *   allowed:     may this bot fetch "/"? (group for our token, else "*")
 *   disallowAll: does the "*" group disallow "/"? (reported in the SEO checks)
 *   sitemaps:    Sitemap: lines
 */
export function parseRobots(body) {
  const groups = [];
  let cur = null;
  let lastWasAgent = false;
  const sitemaps = [];
  for (const raw of body.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim();
    const m = line.match(/^([a-z-]+)\s*:\s*(.*)$/i);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const value = m[2].trim();
    if (key === 'user-agent') {
      if (!lastWasAgent) { cur = { agents: [], rules: [] }; groups.push(cur); }
      cur.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (key === 'sitemap') sitemaps.push(value);
    else if ((key === 'allow' || key === 'disallow') && cur) cur.rules.push({ allow: key === 'allow', path: value });
  }
  // Does this group block the root path "/"? Longest matching rule wins; Allow wins ties.
  const blocksRoot = (group) => {
    let best = null;
    for (const r of group.rules) {
      if (r.path === '') continue; // "Disallow:" with no path allows everything
      const pattern = r.path.replace(/\*+$/, '');
      if (!(pattern === '/' || pattern === '/$' || pattern === '' || pattern === '*')) continue;
      const len = r.path.length;
      if (!best || len > best.len || (len === best.len && r.allow)) best = { len, allow: r.allow };
    }
    return best ? !best.allow : false;
  };
  const token = BOT_TOKEN.toLowerCase();
  const ours = groups.filter((g) => g.agents.some((a) => a.replace(/\/.*$/, '') === token));
  const star = groups.filter((g) => g.agents.includes('*'));
  const applicable = ours.length ? ours : star;
  return {
    allowed: !applicable.some(blocksRoot),
    disallowAll: star.some(blocksRoot),
    sitemaps,
  };
}

async function fetchRobots(origin) {
  try {
    const { res, bytes } = await get(`${origin}/robots.txt`, { timeout: 10000, accept: 'text/plain,*/*;q=0.5' });
    const type = res.headers.get('content-type') || 'text/plain';
    if (res.ok && /text\/plain/i.test(type)) {
      return { status: res.status, ...parseRobots(bytes.toString('utf8').slice(0, 500000)) };
    }
    // 4xx means "no rules"; a served HTML page (soft 404) is the same.
    return { status: res.ok ? 0 : res.status, allowed: res.status < 500, disallowAll: false, sitemaps: [] };
  } catch {
    return { status: null, allowed: true, disallowAll: false, sitemaps: [] };
  }
}

/**
 * Scans one registrable domain's homepage. Tries https://domain/ then https://www.domain/.
 * Returns { ok, status, finalUrl, ttfb, total, bytes, page?, extraTech?, robots, error? }.
 */
export async function scanHomepage(domain) {
  let lastError = null;
  for (const host of [domain, `www.${domain}`]) {
    const origin = `https://${host}`;
    const robots = await fetchRobots(origin);
    if (robots.status === null && host === domain) {
      // Host unreachable (no DNS, TLS failure…): try www.
      lastError = 'unreachable';
      continue;
    }
    if (!robots.allowed) return { ok: false, error: 'robots', robots: { status: robots.status, disallowAll: robots.disallowAll, sitemaps: robots.sitemaps } };
    try {
      const { res, bytes, ttfb, total } = await get(`${origin}/`);
      const type = res.headers.get('content-type') || '';
      const base = { status: res.status, finalUrl: res.url, ttfb, total, bytes: bytes.length, robots: { status: robots.status, disallowAll: robots.disallowAll, sitemaps: robots.sitemaps.slice(0, 5) } };
      const headers = pickHeaders(res.headers);
      if (!res.ok) return { ok: false, error: `http_${res.status}`, headers, ...base };
      if (!/html/i.test(type)) return { ok: false, error: 'not_html', headers, ...base };
      const html = decode(bytes, type);
      const { page, extraTech } = extractPage(html, res.url, headers);
      page.robots = base.robots;
      if (!robots.sitemaps.length) {
        try {
          const sm = await get(`${new URL(res.url).origin}/sitemap.xml`, { method: 'HEAD', timeout: 8000, accept: 'application/xml,text/xml,*/*;q=0.5' });
          page.sitemapStatus = sm.res.status;
        } catch {
          page.sitemapStatus = null;
        }
      }
      return { ok: true, page, extraTech, headers, ...base };
    } catch (e) {
      lastError = e.name === 'AbortError' ? 'timeout' : (e.cause?.code || e.message || 'error').toString().slice(0, 60);
    }
  }
  return { ok: false, error: lastError || 'unreachable' };
}

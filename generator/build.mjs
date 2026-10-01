// Builds the static site into dist/ from data/*.json.
//   node generator/build.mjs
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { absUrl, TOP_N, AMO_SLUG, links } from '../config.mjs';
import { SIGNATURES } from '../lib/tech.js';
import { evaluateSeo } from '../lib/seo.js';
import { displayHost, publicSuffix } from '../lib/domain.js';
import { TECH_INFO, slugify } from './tech-info.mjs';
import { page } from './html.mjs';
import * as P from './pages.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.join(ROOT, 'data');
const DIST = path.join(ROOT, 'dist');
const ASSETS = path.join(ROOT, 'generator', 'assets');
const PER_PAGE = 500;
const TLD_MIN_SITES = 10;

const readJson = (f, fallback) => {
  try { return JSON.parse(fs.readFileSync(path.join(DATA, f), 'utf8')); } catch { return fallback; }
};

const SIG = new Map(SIGNATURES.map((s) => [s.name, s]));
const HEADLINE_ORDER = ['cms', 'ecommerce', 'framework', 'hosting', 'cdn', 'server', 'library', 'analytics', 'ui', 'backend', 'ads', 'marketing', 'chat', 'payments', 'security'];

function load() {
  const meta = readJson('meta.json', null);
  if (!meta) throw new Error('data/meta.json missing: run the scanner first');
  const raw = readJson('sites.json', []).filter((s) => s.rank && s.rank <= TOP_N);
  const rdap = readJson('rdap.json', {});
  const history = readJson('history.json', {});
  const today = meta.tranco.date;

  const sites = raw.map((s) => {
    const tech = (s.tech || []).filter(([name]) => SIG.has(name)).map(([name, version]) => ({
      name, version: version || null, cat: SIG.get(name).cat, slug: slugify(name),
    }));
    const hist = (history[s.d] || []).filter(([d]) => d <= today);
    const pointBefore = (days) => {
      const cutoff = new Date(Date.parse(today) - days * 864e5).toISOString().slice(0, 10);
      for (let i = hist.length - 1; i >= 0; i--) if (hist[i][0] <= cutoff) return hist[i];
      return null;
    };
    const p7 = pointBefore(6), p28 = pointBefore(27);
    return {
      d: s.d,
      display: displayHost(s.d),
      rank: s.rank,
      scan: s.scan,
      headers: s.headers,
      facts: s.facts,
      seo: s.facts ? evaluateSeo(s.facts) : null,
      tech,
      headline: [...tech].sort((a, b) => HEADLINE_ORDER.indexOf(a.cat) - HEADLINE_ORDER.indexOf(b.cat)).slice(0, 3).map((t) => t.name),
      rdap: rdap[s.d] || null,
      history: hist,
      best: hist.length > 1 ? Math.min(...hist.map((h) => h[1])) : null,
      change7: p7 ? p7[1] - s.rank : null,
      change28: p28 ? p28[1] - s.rank : null,
      tld: publicSuffix(s.d),
    };
  }).sort((a, b) => a.rank - b.rank);
  return { meta, sites };
}

function aggregate({ meta, sites }) {
  const analyzedSites = sites.filter((s) => s.facts);
  const analyzed = analyzedSites.length;
  const byDomain = new Map(sites.map((s) => [s.d, s]));

  // Technology usage among homepages we could scan.
  const techs = SIGNATURES.map((sig) => ({
    name: sig.name, cat: sig.cat, slug: slugify(sig.name), info: TECH_INFO[sig.name] || null,
    count: 0, sites: [], versionCounts: new Map(), co: new Map(),
  }));
  const techByName = new Map(techs.map((t) => [t.name, t]));
  for (const s of analyzedSites) {
    for (const t of s.tech) {
      const agg = techByName.get(t.name);
      agg.count++;
      agg.sites.push(s);
      if (t.version) {
        const major = t.version.split('.').slice(0, 2).join('.');
        agg.versionCounts.set(major, (agg.versionCounts.get(major) || 0) + 1);
      }
      for (const o of s.tech) if (o.name !== t.name) agg.co.set(o.name, (agg.co.get(o.name) || 0) + 1);
    }
  }
  for (const t of techs) {
    t.versions = [...t.versionCounts].sort((a, b) => b[1] - a[1]);
    t.together = t.count >= 3
      ? [...t.co].map(([name, c]) => ({ ...techByName.get(name), share: c / t.count })).sort((a, b) => b.share - a.share).slice(0, 8)
      : [];
  }

  // Sites with a similar stack: Jaccard similarity, candidates from each site's two rarest technologies.
  for (const s of sites) {
    s.similarStack = [];
    if (!s.facts || s.tech.length < 3) continue;
    const mine = new Set(s.tech.map((t) => t.name));
    const rare = [...s.tech].sort((a, b) => techByName.get(a.name).count - techByName.get(b.name).count).slice(0, 2);
    const candidates = new Set(rare.flatMap((t) => techByName.get(t.name).sites));
    candidates.delete(s);
    const scored = [];
    for (const c of candidates) {
      let shared = 0;
      for (const t of c.tech) if (mine.has(t.name)) shared++;
      const sim = shared / (mine.size + c.tech.length - shared);
      if (shared >= 3 && sim >= 0.5) scored.push([sim, c]);
    }
    s.similarStack = scored.sort((a, b) => b[0] - a[0] || a[1].rank - b[1].rank).slice(0, 6).map((x) => x[1]);
  }

  // Neighbours by rank.
  sites.forEach((s, i) => {
    s.neighbours = sites.slice(Math.max(0, i - 5), i + 6).filter((x) => x !== s);
  });

  // Domain extensions.
  const tldMap = new Map();
  for (const s of sites) {
    if (!tldMap.has(s.tld)) tldMap.set(s.tld, []);
    tldMap.get(s.tld).push(s);
  }
  const tlds = [...tldMap].map(([tld, list]) => {
    const scanned = list.filter((s) => s.facts);
    const counts = new Map();
    for (const s of scanned) for (const t of s.tech) counts.set(t.name, (counts.get(t.name) || 0) + 1);
    return {
      tld,
      sites: list,
      pages: list.length >= TLD_MIN_SITES,
      topTech: scanned.length >= 5
        ? [...counts].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([name, c]) => ({ name, share: c / scanned.length }))
        : [],
    };
  }).sort((a, b) => b.sites.length - a.sites.length);

  const hasWeekly = (meta.historyDates || []).length >= 2;
  const movers = hasWeekly
    ? sites.filter((s) => s.change7 > 0 && s.rank <= 5000)
      .map((s) => [Math.log((s.rank + s.change7) / s.rank), s]).sort((a, b) => b[0] - a[0]).slice(0, 15).map((x) => x[1])
    : [];
  const newest = sites.filter((s) => s.rdap?.registered && !s.rdap.error)
    .sort((a, b) => b.rdap.registered.localeCompare(a.rdap.registered)).slice(0, 15);

  return { meta, sites, analyzed, byDomain, techs, tlds, hasWeekly, movers, newest, perPage: PER_PAGE };
}

function write(rel, content) {
  const file = path.join(DIST, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

function writePage(p, common) {
  const rel = p.path.endsWith('/') ? `${p.path}index.html` : p.path;
  write(rel, page({ ...p, ...common, active: p.active }));
  return p.noindex ? null : p.path;
}

// Point "Get the extension" at Firefox Add-ons once the listing is public.
async function resolveExtensionLink() {
  try {
    const res = await fetch(`https://addons.mozilla.org/api/v5/addons/addon/${AMO_SLUG}/`, { signal: AbortSignal.timeout(10000) });
    const data = res.ok ? await res.json() : null;
    if (data?.status === 'public' && data.url) links.extension = data.url;
  } catch { /* keep the GitHub link */ }
}

async function main() {
  const started = Date.now();
  await resolveExtensionLink();
  const ctx = aggregate(load());
  fs.rmSync(DIST, { recursive: true, force: true });
  fs.mkdirSync(DIST, { recursive: true });

  // Assets, cache-busted by content hash.
  const hash = crypto.createHash('sha256');
  for (const f of fs.readdirSync(ASSETS).sort()) {
    const buf = fs.readFileSync(path.join(ASSETS, f));
    hash.update(buf);
    write(`assets/${f}`, buf);
  }
  for (const f of ['domain.js', 'psl-data.js']) {
    const buf = fs.readFileSync(path.join(ROOT, 'lib', f));
    hash.update(buf);
    write(`assets/lib/${f}`, buf);
  }
  const assetsVersion = hash.digest('hex').slice(0, 10);
  write('assets/domains.json', JSON.stringify(ctx.sites.map((s) => s.d)));
  write('.nojekyll', '');

  const common = { assetsVersion, updated: ctx.meta.scannedAt };
  const urls = [];
  const add = (p) => { const u = writePage(p, common); if (u) urls.push(u); };

  add(P.homePage(ctx));
  const pages = Math.ceil(ctx.sites.length / PER_PAGE);
  for (let n = 1; n <= pages; n++) add({ ...P.topPage(n, pages, ctx.sites.slice((n - 1) * PER_PAGE, n * PER_PAGE), ctx), active: '/top/' });
  add({ ...P.techIndexPage(ctx), active: '/tech/' });
  for (const t of ctx.techs) if (t.count > 0) add({ ...P.techPage(t, ctx), active: '/tech/' });
  add({ ...P.tldIndexPage(ctx.tlds, ctx), active: '/top/' });
  for (const t of ctx.tlds) if (t.pages) add({ ...P.tldPage(t, ctx), active: '/top/' });
  add(P.lookupPage(ctx));
  add(P.aboutPage(ctx));
  add(P.privacyPage());
  writePage(P.notFoundPage(), common);
  for (const s of ctx.sites) add(P.sitePage(s, ctx));

  const lastmod = ctx.meta.scannedAt.slice(0, 10);
  write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `<url><loc>${absUrl(u)}</loc><lastmod>${lastmod}</lastmod></url>`).join('\n')}
</urlset>
`);
  write('robots.txt', `User-agent: *\nAllow: /\n\nSitemap: ${absUrl('/sitemap.xml')}\n`);

  console.log(`Built ${urls.length + 1} pages in ${Math.round((Date.now() - started) / 100) / 10} s ` +
    `(extension link: ${links.extension}; ${ctx.sites.length} sites, ${ctx.analyzed} scanned, ${ctx.techs.filter((t) => t.count).length} technologies, ${ctx.tlds.filter((t) => t.pages).length} extensions)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

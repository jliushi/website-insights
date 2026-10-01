// RDAP (registration data) lookups with a per-registry rate limit.
import { BOT_UA } from '../config.mjs';
import { tldOf } from '../lib/domain.js';

// TLDs whose registries run RDAP but are missing from the IANA bootstrap file.
const RDAP_FALLBACK = {
  io: 'https://rdap.identitydigital.services/rdap/',
};

let bootstrap = null;

export async function loadBootstrap() {
  if (bootstrap) return bootstrap;
  const res = await fetch('https://data.iana.org/rdap/dns.json', { headers: { 'User-Agent': BOT_UA } });
  if (!res.ok) throw new Error(`IANA bootstrap HTTP ${res.status}`);
  const data = await res.json();
  bootstrap = { ...Object.fromEntries(Object.entries(RDAP_FALLBACK)) };
  for (const [tlds, urls] of data.services) {
    const https = urls.find((u) => u.startsWith('https://')) || urls[0];
    for (const t of tlds) bootstrap[t.toLowerCase()] = https.endsWith('/') ? https : `${https}/`;
  }
  return bootstrap;
}

export function parseRdap(data) {
  const events = {};
  for (const ev of data.events || []) {
    if (ev.eventAction && ev.eventDate && !events[ev.eventAction]) events[ev.eventAction] = ev.eventDate;
  }
  let registrar = null;
  const walk = (entities) => {
    for (const ent of entities || []) {
      if (!registrar && (ent.roles || []).includes('registrar')) {
        const fn = (ent.vcardArray?.[1] || []).find((f) => f[0] === 'fn');
        registrar = fn?.[3] || ent.publicIds?.[0]?.identifier || ent.handle || null;
      }
      walk(ent.entities);
    }
  };
  walk(data.entities);
  return {
    registered: events.registration || null,
    expires: events.expiration || null,
    registrar: registrar ? String(registrar).slice(0, 120) : null,
    nameservers: (data.nameservers || []).map((n) => (n.ldhName || '').toLowerCase()).filter(Boolean).slice(0, 8),
    dnssec: data.secureDNS?.delegationSigned ?? null,
  };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Looks up many domains. Requests to the same registry server run one at a time with
 * `gapMs` between them; different servers run in parallel.
 * Returns Map(domain -> record | { error }).
 */
export async function rdapMany(domains, { gapMs = 400, onProgress } = {}) {
  const map = await loadBootstrap();
  const byServer = new Map();
  const out = new Map();
  for (const d of domains) {
    const server = map[tldOf(d)];
    if (!server) { out.set(d, { error: 'unsupported' }); continue; }
    if (!byServer.has(server)) byServer.set(server, []);
    byServer.get(server).push(d);
  }
  let done = 0;
  await Promise.all([...byServer].map(async ([server, list]) => {
    let gap = gapMs;
    for (const d of list) {
      let record;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const ctrl = new AbortController();
          const timer = setTimeout(() => ctrl.abort(), 15000);
          const res = await fetch(`${server}domain/${encodeURIComponent(d)}`, {
            headers: { Accept: 'application/rdap+json, application/json', 'User-Agent': BOT_UA },
            signal: ctrl.signal,
          }).finally(() => clearTimeout(timer));
          if (res.status === 429) { gap = Math.min(gap * 2, 10000); await sleep(gap * 3); continue; }
          if (res.status === 404) { record = { error: 'not_found' }; break; }
          if (!res.ok) { record = { error: `http_${res.status}` }; break; }
          record = parseRdap(await res.json());
          break;
        } catch (e) {
          record = { error: e.name === 'AbortError' ? 'timeout' : 'network' };
        }
      }
      out.set(d, record || { error: 'rate_limited' });
      onProgress?.(++done);
      await sleep(gap);
    }
  }));
  return out;
}

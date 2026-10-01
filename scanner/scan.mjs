// Weekly data refresh.
//   node scanner/scan.mjs                 full run: Tranco top N, homepages, RDAP
//   node scanner/scan.mjs --limit=200     only the first 200 domains (testing)
//   node scanner/scan.mjs --only=a.com,b.org
//   node scanner/scan.mjs --no-rdap       skip registration lookups
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TOP_N } from '../config.mjs';
import { SIGNATURES, detectTech } from '../lib/tech.js';
import { latestTranco, trancoForDate } from './tranco.mjs';
import { scanHomepage } from './fetch.mjs';
import { rdapMany } from './rdap.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.join(ROOT, 'data');
const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const [k, v] = a.replace(/^--/, '').split('=');
  return [k, v ?? true];
}));

const readJson = (file, fallback) => {
  try { return JSON.parse(fs.readFileSync(path.join(DATA, file), 'utf8')); } catch { return fallback; }
};
const writeJson = (file, value) => {
  fs.mkdirSync(DATA, { recursive: true });
  fs.writeFileSync(path.join(DATA, file), JSON.stringify(value) + '\n');
};

const RDAP_MAX_AGE_DAYS = 60;
const RDAP_ERROR_RETRY_DAYS = 7;
const RDAP_PER_RUN = Number(args['rdap-max'] ?? 6000);
const HISTORY_POINTS = 104;
const HISTORY_BACKFILL_WEEKS = Number(args.backfill ?? 26);
const CONCURRENCY = Number(args.concurrency ?? 32);

// Global path for each signature, used to feed HTML-detected signals into detectTech().
const GLOBAL_FOR = Object.fromEntries(SIGNATURES.filter((s) => s.globals?.length).map((s) => [s.name, s.globals[0]]));

// The subset of page facts that lib/seo.js needs; stored so the SEO report can be rebuilt.
function seoFacts(page) {
  const keep = ['url', 'https', 'title', 'lang', 'charset', 'description', 'robotsMeta', 'viewport', 'generators', 'og',
    'twitterCard', 'canonical', 'hreflangCount', 'favicon', 'headings', 'images', 'links', 'wordCount', 'jsonLdTypes',
    'microdata', 'headersFetched', 'headers', 'robots', 'sitemapStatus'];
  const out = {};
  for (const k of keep) if (page[k] !== undefined) out[k] = page[k];
  if (out.title) out.title = out.title.slice(0, 300);
  if (out.description) out.description = out.description.slice(0, 500);
  for (const k of ['title', 'description', 'image']) if (out.og?.[k]) out.og[k] = out.og[k].slice(0, 300);
  if (out.canonical) out.canonical = out.canonical.slice(0, 300);
  return out;
}

async function pool(items, size, fn) {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      await fn(items[i], i);
    }
  }));
}

async function main() {
  const started = Date.now();
  const tranco = await latestTranco(TOP_N);
  let rows = tranco.rows;
  if (args.only) {
    const only = new Set(String(args.only).split(','));
    rows = rows.filter((r) => only.has(r.domain));
    for (const d of only) if (!rows.some((r) => r.domain === d)) rows.push({ rank: null, domain: d });
  }
  if (args.limit) rows = rows.slice(0, Number(args.limit));
  console.log(`Tranco ${tranco.id} (${tranco.date}): scanning ${rows.length} domains`);

  const previous = new Map(readJson('sites.json', []).map((s) => [s.d, s]));
  const sites = [];
  let done = 0, ok = 0;
  await pool(rows, CONCURRENCY, async ({ rank, domain }) => {
    const at = new Date().toISOString().slice(0, 10);
    let result;
    try {
      result = await scanHomepage(domain);
    } catch (e) {
      result = { ok: false, error: String(e.message || e).slice(0, 60) };
    }
    const site = {
      d: domain,
      rank,
      scan: { at, ok: result.ok, error: result.error ?? null, status: result.status ?? null, finalUrl: result.finalUrl ?? null, ttfb: result.ttfb ?? null, total: result.total ?? null, bytes: result.bytes ?? null },
      tech: [],
      facts: null,
      headers: result.headers ?? null,
    };
    if (result.ok) {
      const globals = {};
      for (const name of result.extraTech) if (GLOBAL_FOR[name]) globals[GLOBAL_FOR[name]] = true;
      site.tech = detectTech(result.page, globals).map((t) => (t.version ? [t.name, t.version] : [t.name]));
      site.facts = seoFacts(result.page);
      ok++;
    } else if (result.headers) {
      site.tech = detectTech({ headers: result.headers }, {}).map((t) => (t.version ? [t.name, t.version] : [t.name]));
    } else {
      // Keep last week's findings for sites that were unreachable this time, marked as such.
      const prev = previous.get(domain);
      if (prev?.scan?.ok) {
        site.tech = prev.tech;
        site.facts = prev.facts;
        site.headers = prev.headers;
        site.scan.lastOk = prev.scan.lastOk || prev.scan.at;
      }
    }
    if (result.ok) site.scan.lastOk = at;
    sites.push(site);
    if (++done % 250 === 0) console.log(`  ${done}/${rows.length} homepages (${ok} ok, ${Math.round((Date.now() - started) / 1000)} s)`);
  });
  sites.sort((a, b) => (a.rank ?? 1e9) - (b.rank ?? 1e9));
  console.log(`Homepages: ${ok}/${rows.length} ok`);

  // Registration data changes rarely: refresh entries older than RDAP_MAX_AGE_DAYS.
  const rdap = readJson('rdap.json', {});
  if (!args['no-rdap']) {
    const today = Date.now();
    const age = (r) => (today - Date.parse(r.at)) / 864e5;
    const due = sites.map((s) => s.d).filter((d) => {
      const r = rdap[d];
      if (!r) return true;
      return r.error ? r.error !== 'unsupported' && age(r) > RDAP_ERROR_RETRY_DAYS : age(r) > RDAP_MAX_AGE_DAYS;
    }).slice(0, RDAP_PER_RUN);
    console.log(`RDAP: ${due.length} lookups`);
    const results = await rdapMany(due, {
      onProgress: (n) => { if (n % 500 === 0) console.log(`  ${n}/${due.length} RDAP (${Math.round((Date.now() - started) / 1000)} s)`); },
    });
    const at = new Date().toISOString().slice(0, 10);
    for (const [d, r] of results) {
      // Don't overwrite good data with a transient error.
      if (r.error && rdap[d] && !rdap[d].error && r.error !== 'not_found') continue;
      rdap[d] = { at, ...r };
    }
  }

  // Weekly rank history (one point per Tranco list date). Missing weeks within the last
  // HISTORY_BACKFILL_WEEKS are filled from Tranco's archived daily lists.
  const history = readJson('history.json', {});
  const oldMeta = readJson('meta.json', {});
  const historyDates = new Set(oldMeta.historyDates || []);
  const addList = (list, onlyDomains) => {
    for (const r of list.rows) {
      if (onlyDomains && !onlyDomains.has(r.domain)) continue;
      const h = history[r.domain] || (history[r.domain] = []);
      if (!h.some(([date]) => date === list.date)) h.push([list.date, r.rank]);
      h.sort((a, b) => a[0].localeCompare(b[0]));
      if (h.length > HISTORY_POINTS) h.splice(0, h.length - HISTORY_POINTS);
    }
    historyDates.add(list.date);
  };
  const scope = args.only || args.limit ? new Set(sites.map((s) => s.d)) : null;
  addList({ date: tranco.date, rows: sites.filter((s) => s.rank).map((s) => ({ rank: s.rank, domain: s.d })) }, null);
  if (!args['no-backfill']) {
    for (let week = 1; week <= HISTORY_BACKFILL_WEEKS; week++) {
      const date = new Date(Date.parse(tranco.date) - week * 7 * 864e5).toISOString().slice(0, 10);
      if (historyDates.has(date) && !scope) continue;
      try {
        const list = await trancoForDate(date, TOP_N);
        if (list) { addList(list, scope); console.log(`History: added Tranco list of ${list.date}`); }
      } catch (e) {
        console.log(`History: ${date} skipped (${e.message})`);
      }
    }
  }
  if (scope) historyDates.clear(); // partial runs don't count as complete backfills

  if (args.only || args.limit) {
    // Partial runs merge into the existing dataset instead of replacing it.
    for (const s of sites) previous.set(s.d, s);
    writeJson('sites.json', [...previous.values()].sort((a, b) => (a.rank ?? 1e9) - (b.rank ?? 1e9)));
  } else {
    writeJson('sites.json', sites);
  }
  writeJson('rdap.json', rdap);
  writeJson('history.json', history);
  writeJson('meta.json', {
    tranco: { id: tranco.id, date: tranco.date },
    scannedAt: new Date().toISOString(),
    topN: TOP_N,
    scanned: sites.length,
    ok,
    historyDates: [...historyDates].sort(),
  });
  console.log(`Done in ${Math.round((Date.now() - started) / 1000)} s`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

// Search suggestions on every page, and the live lookup on /lookup/.
// Network requests go only to this site (domain list), the Tranco API and RDAP registries.
import { registrableDomain, displayHost, tldOf } from './lib/domain.js';

const BASE = document.body.dataset.base || '';
const siteUrl = (d) => `${BASE}/site/${d}/`;

let domainsPromise = null;
const loadDomains = () => {
  domainsPromise ||= fetch(`${BASE}/assets/domains.json`).then((r) => (r.ok ? r.json() : [])).catch(() => []);
  return domainsPromise;
};

function el(tag, attrs = {}, ...children) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'text') e.textContent = v;
    else if (k === 'class') e.className = v;
    else e.setAttribute(k, v);
  }
  for (const c of children.flat(Infinity)) if (c != null && c !== false) e.append(c instanceof Node ? c : String(c));
  return e;
}

/** Turns user input ("https://www.Example.co.uk/path") into a registrable domain ("example.co.uk"). */
export function normalize(input) {
  let s = String(input || '').trim();
  if (!s) return null;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) s = `http://${s}`;
  let host;
  try { host = new URL(s).hostname; } catch { return null; }
  if (!host.includes('.')) return null;
  return registrableDomain(host);
}

// ---------------------------------------------------------------- suggestions

function attachSuggest(input) {
  const form = input.form;
  const box = el('ul', { class: 'ac', role: 'listbox', hidden: '' });
  form.style.position = 'relative';
  form.append(box);
  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('aria-expanded', 'false');
  let items = [];
  let active = -1;

  const close = () => { box.hidden = true; input.setAttribute('aria-expanded', 'false'); active = -1; };
  const render = () => {
    box.replaceChildren(...items.map(([d, rank], i) => {
      const li = el('li', { role: 'option', 'aria-selected': i === active ? 'true' : 'false' }, el('span', { text: displayHost(d) }), el('small', { text: `#${rank.toLocaleString('en-US')}` }));
      li.addEventListener('mousedown', (e) => { e.preventDefault(); location.href = siteUrl(d); });
      return li;
    }));
    box.hidden = !items.length;
    input.setAttribute('aria-expanded', String(!!items.length));
  };
  const update = async () => {
    const q = input.value.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '');
    if (!q) { items = []; render(); return; }
    const list = await loadDomains();
    const starts = [], contains = [];
    for (let i = 0; i < list.length && starts.length < 8; i++) {
      const d = list[i];
      if (d.startsWith(q)) starts.push([d, i + 1]);
      else if (contains.length < 8 && d.includes(q)) contains.push([d, i + 1]);
    }
    items = [...starts, ...contains].slice(0, 8);
    active = -1;
    render();
  };

  input.addEventListener('focus', loadDomains, { once: true });
  input.addEventListener('input', update);
  input.addEventListener('blur', () => setTimeout(close, 100));
  input.addEventListener('keydown', (e) => {
    if (box.hidden) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      active = (active + (e.key === 'ArrowDown' ? 1 : -1) + items.length + 1) % (items.length + 1);
      if (active === items.length) active = -1;
      render();
    } else if (e.key === 'Enter' && active >= 0) {
      e.preventDefault();
      location.href = siteUrl(items[active][0]);
    } else if (e.key === 'Escape') {
      close();
    }
  });
  // Exact match of a domain we have a report for: go straight to the report.
  form.addEventListener('submit', async (e) => {
    const d = normalize(input.value);
    if (!d || form.id === 'lookup-form') return;
    e.preventDefault();
    const list = await loadDomains();
    location.href = list.includes(d) ? siteUrl(d) : `${BASE}/lookup/?d=${encodeURIComponent(d)}`;
  });
}

for (const input of document.querySelectorAll('form[role="search"] input[name="d"]')) attachSuggest(input);

// ---------------------------------------------------------------- live lookup

const fmtNum = (n) => n.toLocaleString('en-US');
const fmtDate = (iso) => new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
function fmtAge(iso) {
  const days = Math.floor((Date.now() - Date.parse(iso)) / 864e5);
  if (days < 0) return null;
  const years = Math.floor(days / 365.25);
  if (years >= 1) return `${years} year${years > 1 ? 's' : ''}`;
  const months = Math.floor(days / 30.44);
  if (months >= 1) return `${months} month${months > 1 ? 's' : ''}`;
  return `${days} day${days === 1 ? '' : 's'}`;
}

async function getJson(url, init) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal, credentials: 'omit', referrerPolicy: 'no-referrer' });
    if (!res.ok) { const err = new Error(`HTTP ${res.status}`); err.status = res.status; throw err; }
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function trancoRank(domain) {
  const data = await getJson(`https://tranco-list.eu/api/ranks/domain/${encodeURIComponent(domain)}`);
  const history = (data.ranks || []).filter((r) => Number.isFinite(r.rank) && r.date).sort((a, b) => a.date.localeCompare(b.date));
  return history.length ? { rank: history[history.length - 1].rank, date: history[history.length - 1].date, history } : { rank: null, history: [] };
}

const RDAP_FALLBACK = { io: 'https://rdap.identitydigital.services/rdap/' };
let bootstrap = null;
async function rdap(domain) {
  bootstrap ||= getJson('https://data.iana.org/rdap/dns.json').then((data) => {
    const map = { ...RDAP_FALLBACK };
    for (const [tlds, urls] of data.services) {
      const u = urls.find((x) => x.startsWith('https://')) || urls[0];
      for (const t of tlds) map[t.toLowerCase()] = u.endsWith('/') ? u : `${u}/`;
    }
    return map;
  });
  const server = (await bootstrap)[tldOf(domain)];
  if (!server) return { error: 'unsupported' };
  let data;
  try {
    data = await getJson(`${server}domain/${encodeURIComponent(domain)}`, { headers: { Accept: 'application/rdap+json, application/json' } });
  } catch (e) {
    return { error: e.status === 404 ? 'not_found' : 'failed' };
  }
  const events = {};
  for (const ev of data.events || []) if (ev.eventAction && ev.eventDate && !events[ev.eventAction]) events[ev.eventAction] = ev.eventDate;
  let registrar = null;
  const walk = (ents) => {
    for (const ent of ents || []) {
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
    registrar,
    nameservers: (data.nameservers || []).map((n) => (n.ldhName || '').toLowerCase()).filter(Boolean),
    dnssec: data.secureDNS?.delegationSigned ?? null,
  };
}

function chart(history) {
  if (history.length < 2) return null;
  const NS = 'http://www.w3.org/2000/svg';
  const W = 640, H = 130, L = 52, R = 12, T = 10, B = 24;
  const ranks = history.map((h) => h.rank);
  let lo = Math.min(...ranks), hi = Math.max(...ranks);
  if (lo === hi) { lo = Math.max(1, lo - 1); hi += 1; }
  const x = (i) => L + (i / (history.length - 1)) * (W - L - R);
  const y = (r) => T + ((r - lo) / (hi - lo)) * (H - T - B);
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'Daily rank, last 30 days');
  const add = (tag, attrs, text) => {
    const n = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    if (text) n.textContent = text;
    svg.append(n);
    return n;
  };
  for (const r of [lo, hi]) {
    add('line', { class: 'grid', x1: L, x2: W - R, y1: y(r), y2: y(r) });
    add('text', { class: 'axis', x: L - 6, y: y(r) + 4, 'text-anchor': 'end' }, `#${fmtNum(r)}`);
  }
  add('polyline', { class: 'line', points: history.map((h, i) => `${x(i).toFixed(1)},${y(h.rank).toFixed(1)}`).join(' ') });
  add('text', { class: 'axis', x: L, y: H - 5 }, fmtDate(history[0].date));
  add('text', { class: 'axis', x: W - R, y: H - 5, 'text-anchor': 'end' }, fmtDate(history[history.length - 1].date));
  return el('figure', { class: 'chart' }, svg, el('figcaption', { text: 'Daily Tranco rank over the last 30 days (lower is more popular).' }));
}

async function runLookup(raw) {
  const out = document.getElementById('lookup-result');
  const domain = normalize(raw);
  if (!domain) {
    out.replaceChildren(el('p', { class: 'notice error', text: 'Enter a domain name such as example.com.' }));
    return;
  }
  const shown = displayHost(domain);
  document.title = `${shown}: rank & domain age — Website Insights`;
  out.replaceChildren(el('p', { class: 'notice' }, el('span', { class: 'spinner' }), `Looking up ${shown}…`));

  const [list, rank, reg] = await Promise.all([
    loadDomains(),
    trancoRank(domain).catch(() => ({ error: true })),
    rdap(domain).catch(() => ({ error: 'failed' })),
  ]);

  const card = el('div', { class: 'result-card' });
  card.append(el('h2', { text: shown }));
  if (list.includes(domain)) {
    card.append(el('p', {}, el('a', { class: 'btn', href: siteUrl(domain), text: `Full report on ${shown} →` }), ' ',
      el('span', { class: 'muted small', text: 'Includes technology stack, SEO checks and weekly rank history.' })));
  }

  const age = reg.registered ? fmtAge(reg.registered) : null;
  card.append(el('div', { class: 'tiles' },
    el('div', { class: 'tile' }, el('div', { class: 'tile-label', text: 'Global rank' }),
      el('div', { class: 'tile-value', text: rank.error ? '—' : rank.rank ? `#${fmtNum(rank.rank)}` : 'Not ranked' }),
      el('div', { class: 'tile-sub', text: rank.error ? 'Tranco is unavailable right now' : rank.rank ? `Tranco, ${fmtDate(rank.date)}` : 'Not in the Tranco top 1 million' })),
    el('div', { class: 'tile' }, el('div', { class: 'tile-label', text: 'Domain age' }),
      el('div', { class: 'tile-value', text: age || '—' }),
      el('div', { class: 'tile-sub', text: reg.registered ? `since ${fmtDate(reg.registered)}` : 'Registration date unavailable' }))));

  if (rank.history?.length > 1) card.append(chart(rank.history));

  card.append(el('h3', { text: 'Domain registration' }));
  if (reg.error) {
    const msg = {
      unsupported: `The registry for .${tldOf(domain)} does not publish registration data over RDAP.`,
      not_found: 'The registry has no record of this domain. It may be unregistered.',
    }[reg.error] || 'The registry did not answer. Try again in a minute.';
    card.append(el('p', { class: 'muted', text: msg }));
  } else {
    const row = (k, v) => [el('dt', { text: k }), el('dd', {}, v)];
    card.append(el('dl', { class: 'facts' },
      row('Registered', reg.registered ? `${fmtDate(reg.registered)}${age ? ` (${age} ago)` : ''}` : '—'),
      row('Expires', reg.expires ? fmtDate(reg.expires) : '—'),
      row('Registrar', reg.registrar || '—'),
      row('Name servers', reg.nameservers.length ? reg.nameservers.join(', ') : '—'),
      row('DNSSEC', reg.dnssec == null ? '—' : reg.dnssec ? 'Signed' : 'Not signed')));
  }
  card.append(el('p', { class: 'small muted' }, 'Want the tech stack and SEO checks for this site? Open it in your browser with the ',
    el('a', { href: document.body.dataset.ext, text: 'Website Insights extension' }), '.'));
  out.replaceChildren(card);
}

const lookupForm = document.getElementById('lookup-form');
if (lookupForm) {
  const input = document.getElementById('lookup-input');
  const initial = new URLSearchParams(location.search).get('d');
  if (initial) { input.value = initial; runLookup(initial); }
  lookupForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const d = normalize(input.value);
    history.replaceState(null, '', `?d=${encodeURIComponent(d || input.value.trim())}`);
    runLookup(input.value);
  });
}

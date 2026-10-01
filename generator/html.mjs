// Minimal HTML templating: html`` escapes every interpolated value unless it is raw() or
// another html`` result. Arrays are joined.
import { SITE_NAME, REPO_URL, links, url, absUrl } from '../config.mjs';

class Raw {
  constructor(s) { this.s = s; }
  toString() { return this.s; }
}
export const raw = (s) => new Raw(String(s));

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (v) => String(v).replace(/[&<>"']/g, (c) => ESC[c]);

function render(v) {
  if (v == null || v === false || v === true) return '';
  if (v instanceof Raw) return v.s;
  if (Array.isArray(v)) return v.map(render).join('');
  return esc(v);
}

export function html(strings, ...values) {
  let out = strings[0];
  for (let i = 0; i < values.length; i++) out += render(values[i]) + strings[i + 1];
  return new Raw(out);
}

// ---------------------------------------------------------------- formatting

const nf = new Intl.NumberFormat('en-US');
export const num = (n) => (n == null ? '—' : nf.format(n));
export const pct = (x, digits = 1) => `${(x * 100).toFixed(x * 100 < 10 && digits ? digits : 0)}%`;
const df = new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
export const date = (iso) => (iso ? df.format(new Date(iso)) : '—');

export function age(iso, now = Date.now()) {
  if (!iso) return null;
  const days = Math.floor((now - Date.parse(iso)) / 864e5);
  if (days < 0) return null;
  const years = Math.floor(days / 365.25);
  if (years >= 1) {
    const months = Math.floor((days - years * 365.25) / 30.44);
    return `${years} year${years > 1 ? 's' : ''}${months ? `, ${months} month${months > 1 ? 's' : ''}` : ''}`;
  }
  const months = Math.floor(days / 30.44);
  if (months >= 1) return `${months} month${months > 1 ? 's' : ''}`;
  return `${days} day${days === 1 ? '' : 's'}`;
}

export const ms = (v) => (v == null ? '—' : v < 1000 ? `${Math.round(v)} ms` : `${(v / 1000).toFixed(2)} s`);
export function bytes(b) {
  if (b == null) return '—';
  const units = ['B', 'KB', 'MB'];
  let i = 0;
  while (b >= 999.5 && i < units.length - 1) { b /= 1024; i++; }
  return `${i ? b.toFixed(b < 10 ? 1 : 0) : b} ${units[i]}`;
}

/** "a, b and c" */
export function list(items) {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

// ---------------------------------------------------------------- page shell

const NAV = [
  ['/top/', 'Top sites'],
  ['/tech/', 'Technologies'],
  ['/lookup/', 'Lookup'],
  ['/about/', 'About'],
];

/**
 * opts: { path, title, description, h1?, body, jsonLd?, noindex?, assetsVersion, updated, active }
 * `title` is the full <title>; `path` is the page's path below BASE_PATH (e.g. "/site/github.com/").
 */
export function page(opts) {
  const v = opts.assetsVersion;
  const canonical = absUrl(opts.path);
  const ld = opts.jsonLd ? raw(JSON.stringify(opts.jsonLd).replace(/</g, '\\u003c')) : null;
  return `<!doctype html>
${html`<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${opts.title}</title>
<meta name="description" content="${opts.description}">
${opts.noindex ? raw('<meta name="robots" content="noindex">') : html`<link rel="canonical" href="${canonical}">`}
<meta name="color-scheme" content="light dark">
<meta name="theme-color" content="#2b3fb8">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${SITE_NAME}">
<meta property="og:title" content="${opts.ogTitle || opts.title}">
<meta property="og:description" content="${opts.description}">
<meta property="og:url" content="${canonical}">
<meta property="og:image" content="${absUrl('/assets/og.png')}">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="${url('/assets/icon.svg')}" type="image/svg+xml">
<link rel="icon" href="${url('/assets/icon-32.png')}" sizes="32x32" type="image/png">
<link rel="apple-touch-icon" href="${url('/assets/icon-180.png')}">
<link rel="stylesheet" href="${url(`/assets/style.css?v=${v}`)}">
<script type="module" src="${url(`/assets/app.js?v=${v}`)}"></script>
${ld ? html`<script type="application/ld+json">${ld}</script>` : ''}
</head>
<body data-base="${url('')}" data-ext="${links.extension}">
<a class="skip" href="#main">Skip to content</a>
<header class="top">
  <div class="wrap top-inner">
    <a class="brand" href="${url('/')}"><img src="${url('/assets/icon.svg')}" width="28" height="28" alt=""><span>${SITE_NAME}</span></a>
    <nav class="nav" aria-label="Main">
      ${NAV.map(([href, label]) => html`<a href="${url(href)}"${opts.active === href ? raw(' aria-current="page"') : ''}>${label}</a>`)}
    </nav>
    <form class="search" action="${url('/lookup/')}" method="get" role="search">
      <input type="search" name="d" placeholder="Search a website, e.g. github.com" aria-label="Website domain" autocomplete="off" spellcheck="false" autocapitalize="off">
    </form>
  </div>
</header>
<main id="main" class="wrap">
${opts.body}
</main>
<footer class="foot">
  <div class="wrap foot-inner">
    <div>
      <strong>${SITE_NAME}</strong> — free website rank, domain age and technology data, rebuilt every week.
      ${opts.updated ? html`<br>Data updated ${date(opts.updated)}.` : ''}
    </div>
    <div class="foot-links">
      <a href="${url('/about/')}">About &amp; methodology</a>
      <a href="${url('/privacy/')}">Privacy</a>
      <a href="${links.extension}">Browser extension</a>
      <a href="${REPO_URL}">Source &amp; data</a>
    </div>
    <div class="foot-note">Popularity ranks: <a href="https://tranco-list.eu/">Tranco</a> (Le Pochat et al., NDSS 2019). Registration data: public RDAP records. Not affiliated with any website listed.</div>
  </div>
</footer>
</body>
</html>`}
`;
}

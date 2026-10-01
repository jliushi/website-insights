// Page renderers. Each returns { path, title, description, body, ... } for page() in html.mjs.
import { SITE_NAME, REPO_URL, BOT_TOKEN, TOP_N, links, url, absUrl } from '../config.mjs';
import { html, raw, num, pct, date, age, ms, bytes, list } from './html.mjs';
import { CATEGORY_LABEL } from './tech-info.mjs';
import { CATEGORY_ORDER } from '../lib/tech.js';

const siteHref = (d) => url(`/site/${d}/`);
const techHref = (slug) => url(`/tech/${slug}/`);
const tldHref = (t) => url(`/tld/${t}/`);
const topHref = (n) => url(n > 1 ? `/top/${n}/` : '/top/');
const year = (iso) => (iso ? iso.slice(0, 4) : '—');

function crumbs(items) {
  return html`<nav class="crumbs" aria-label="Breadcrumb">${items.map(([href, label], i) =>
    i < items.length - 1 ? html`<a href="${href}">${label}</a><span aria-hidden="true">›</span>` : html`<span>${label}</span>`)}</nav>`;
}

function breadcrumbLd(items) {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: items.map(([href, label], i) => ({ '@type': 'ListItem', position: i + 1, name: label, item: absUrl(href.replace(url(''), '')) })),
  };
}

function delta(change) {
  if (change == null || change === 0) return html`<span class="delta flat" title="No change">–</span>`;
  return change > 0
    ? html`<span class="delta up" title="Up ${num(change)} place${change === 1 ? '' : 's'}">▲ ${num(change)}</span>`
    : html`<span class="delta down" title="Down ${num(-change)} place${change === -1 ? '' : 's'}">▼ ${num(-change)}</span>`;
}

function extensionCta(context) {
  return html`<aside class="cta">
  <div>
    <strong>Check any page while you browse.</strong>
    The free Website Insights browser extension shows ${context} for the site in your current tab, plus live speed metrics, in one click.
    It has no tracking and runs on Chrome, Edge and Firefox.
  </div>
  <a class="btn" href="${links.extension}">Get the extension</a>
</aside>`;
}

// ---------------------------------------------------------------- rank chart

function rankChart(points) {
  if (!points || points.length < 2) return '';
  const W = 640, H = 150, P = { l: 52, r: 12, t: 12, b: 26 };
  const ranks = points.map((p) => p[1]);
  let lo = Math.min(...ranks), hi = Math.max(...ranks);
  if (lo === hi) { lo = Math.max(1, lo - 1); hi += 1; }
  const pad = (hi - lo) * 0.1;
  lo = Math.max(1, lo - pad); hi += pad;
  const t0 = Date.parse(points[0][0]), t1 = Date.parse(points[points.length - 1][0]);
  const x = (d) => P.l + ((Date.parse(d) - t0) / Math.max(1, t1 - t0)) * (W - P.l - P.r);
  const y = (r) => P.t + ((r - lo) / (hi - lo)) * (H - P.t - P.b); // better rank = higher on the chart
  const line = points.map((p) => `${x(p[0]).toFixed(1)},${y(p[1]).toFixed(1)}`).join(' ');
  const ticks = [Math.round(lo), Math.round((lo + hi) / 2), Math.round(hi)];
  return html`<figure class="chart">
<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Rank history from ${date(points[0][0])} to ${date(points[points.length - 1][0])}">
  ${ticks.map((r) => html`<line class="grid" x1="${P.l}" x2="${W - P.r}" y1="${y(r).toFixed(1)}" y2="${y(r).toFixed(1)}"/><text class="axis" x="${P.l - 6}" y="${(y(r) + 4).toFixed(1)}" text-anchor="end">#${num(r)}</text>`)}
  <polyline class="line" points="${line}"/>
  ${points.map((p) => html`<circle class="dot" cx="${x(p[0]).toFixed(1)}" cy="${y(p[1]).toFixed(1)}" r="3"><title>${date(p[0])}: #${num(p[1])}</title></circle>`)}
  <text class="axis" x="${P.l}" y="${H - 6}">${date(points[0][0])}</text>
  <text class="axis" x="${W - P.r}" y="${H - 6}" text-anchor="end">${date(points[points.length - 1][0])}</text>
</svg>
<figcaption>Weekly Tranco rank (lower is more popular).</figcaption>
</figure>`;
}

// ---------------------------------------------------------------- SEO checks

const SEO_LABEL = {
  title: 'Title', description: 'Meta description', h1: 'H1 heading', subheadings: 'Subheadings', alt: 'Image alt text',
  words: 'Content length', indexable: 'Indexable', canonical: 'Canonical URL', robots: 'robots.txt', sitemap: 'XML sitemap',
  lang: 'Language attribute', hreflang: 'hreflang', structured: 'Structured data', og: 'Open Graph', twitter: 'Twitter / X card',
  https: 'HTTPS', viewport: 'Mobile viewport', favicon: 'Favicon', charset: 'Character encoding',
  hsts: 'Strict-Transport-Security', csp: 'Content-Security-Policy', frame: 'Clickjacking protection',
  nosniff: 'X-Content-Type-Options', referrer: 'Referrer-Policy', headers_unavailable: 'Response headers',
};
const SEO_GROUP = { content: 'Content', indexing: 'Indexing', social: 'Social sharing', technical: 'Technical', security: 'Security headers' };

function seoDetail({ id, status, args }) {
  const a = args;
  const D = {
    title: { pass: `${a[0]} characters`, warn: `${a[0]} characters — aim for 15–65`, fail: 'Missing' },
    description: { pass: `${a[0]} characters`, warn: `${a[0]} characters — aim for 50–170`, fail: 'Missing' },
    h1: { pass: 'Exactly one H1', warn: `${a[0]} H1 headings — use one`, fail: 'Missing in the served HTML' },
    subheadings: { pass: `${a[0]} H2 headings`, warn: 'No H2 headings in the served HTML' },
    alt: { pass: `All ${a[1]} images have alt text`, warn: `${a[0]} of ${a[1]} images have no alt text`, fail: `${a[0]} of ${a[1]} images have no alt text`, info: 'No images in the served HTML' },
    words: { pass: `About ${num(Number(a[0]))} words`, warn: `About ${num(Number(a[0]))} words in the served HTML`, fail: `About ${num(Number(a[0]))} words in the served HTML` },
    indexable: { pass: 'No noindex directive', fail: 'Blocked by a noindex robots meta tag' },
    canonical: { pass: a[0], info: `Points to another host: ${a[0]}`, warn: 'Missing' },
    robots: { pass: 'Found', fail: 'Blocks all crawlers (Disallow: /)', info: "Couldn't be checked", warn: 'Not found' },
    sitemap: { pass: 'Found', warn: 'Not found', info: "Couldn't be checked" },
    lang: { pass: a[0], warn: 'Missing' },
    hreflang: { info: `${a[0]} language alternates` },
    structured: { pass: a[0], warn: 'No JSON-LD or microdata' },
    og: { pass: 'Title, description and image set', warn: `${a[0]} of 3 key tags set`, fail: 'Missing' },
    twitter: { pass: a[0], warn: 'Missing' },
    https: { pass: 'Served over HTTPS', fail: 'Served over plain HTTP' },
    viewport: { pass: 'Found', fail: 'Missing' },
    favicon: { pass: 'Found', warn: 'Missing' },
    charset: { pass: a[0], warn: a[0] || 'Not declared' },
    hsts: { pass: 'Set', warn: 'Not set', info: 'Not applicable over HTTP' },
    csp: { pass: 'Set', warn: 'Not set' },
    frame: { pass: 'Set', warn: 'Not set' },
    nosniff: { pass: 'Set', warn: 'Not set' },
    referrer: { pass: 'Set', warn: 'Not set' },
    headers_unavailable: { info: 'Not available' },
  };
  return D[id]?.[status] ?? '';
}

const STATUS_ICON = { pass: '✓', warn: '!', fail: '✕', info: 'i' };
const STATUS_TEXT = { pass: 'Passed', warn: 'Warning', fail: 'Failed', info: 'Info' };

function seoSection(s) {
  if (!s.seo) return '';
  const { score, checks } = s.seo;
  const f = s.facts;
  const counts = { pass: 0, warn: 0, fail: 0 };
  for (const c of checks) if (c.status in counts) counts[c.status]++;
  const groups = Object.keys(SEO_GROUP).map((g) => [g, checks.filter((c) => c.group === g)]).filter(([, cs]) => cs.length);
  const grade = score >= 80 ? 'good' : score >= 50 ? 'ni' : 'poor';
  return html`<section id="seo">
  <h2>Homepage SEO check</h2>
  <p class="muted">Checked from the HTML our scanner received on ${date(s.scan.at)}. Content added later by JavaScript isn't counted.</p>
  <div class="seo-head">
    <div class="score ${grade}"><span>${score ?? '—'}</span><small>/100</small></div>
    <div>
      <div class="snippet">
        <div class="snippet-url">${f.url}</div>
        <div class="snippet-title">${f.title || '(no title)'}</div>
        <div class="snippet-desc">${f.description || '(no meta description)'}</div>
      </div>
      <p class="muted small">${counts.pass} passed · ${counts.warn} warnings · ${counts.fail} failed</p>
    </div>
  </div>
  <div class="checks">
    ${groups.map(([g, cs]) => html`<div class="check-group"><h3>${SEO_GROUP[g]}</h3><ul>
      ${cs.map((c) => html`<li class="check ${c.status}"><span class="ico" title="${STATUS_TEXT[c.status]}" aria-label="${STATUS_TEXT[c.status]}">${STATUS_ICON[c.status]}</span><span class="lbl">${SEO_LABEL[c.id] || c.id}</span><span class="det">${seoDetail(c)}</span></li>`)}
    </ul></div>`)}
  </div>
</section>`;
}

// ---------------------------------------------------------------- shared tables

function siteTable(rows, { showDelta = false, showTech = true, showYear = true } = {}) {
  return html`<div class="table-wrap"><table class="sites">
<thead><tr><th class="num">Rank</th><th>Website</th>${showDelta ? html`<th class="num">7-day</th>` : ''}${showYear ? html`<th class="num">Registered</th>` : ''}${showTech ? html`<th class="hide-sm">Built with</th>` : ''}</tr></thead>
<tbody>
${rows.map((s) => html`<tr>
<td class="num">${s.rank ? `#${num(s.rank)}` : '—'}</td>
<td><a href="${siteHref(s.d)}">${s.display}</a></td>
${showDelta ? html`<td class="num">${delta(s.change7)}</td>` : ''}
${showYear ? html`<td class="num">${year(s.rdap?.registered)}</td>` : ''}
${showTech ? html`<td class="hide-sm tech-mini">${s.headline.join(', ') || html`<span class="muted">—</span>`}</td>` : ''}
</tr>`)}
</tbody></table></div>`;
}

function shareBars(items, total) {
  const max = Math.max(1, ...items.map((t) => t.count));
  return html`<ul class="bars">${items.map((t) => html`<li>
  <a href="${techHref(t.slug)}">${t.name}</a>
  <span class="bar"><span style="width:${((t.count / max) * 100).toFixed(1)}%"></span></span>
  <span class="val" title="${num(t.count)} of ${num(total)} sites">${pct(t.count / total)}</span>
</li>`)}</ul>`;
}

// ---------------------------------------------------------------- site page

export function sitePage(s, ctx) {
  const d = s.display;
  const r = s.rdap && !s.rdap.error ? s.rdap : null;
  const techByCat = CATEGORY_ORDER.map((c) => [c, s.tech.filter((t) => t.cat === c)]).filter(([, ts]) => ts.length);
  const listDate = ctx.meta.tranco.date;
  const sentences = [];
  if (s.rank) {
    let rankText = `${d} is ranked #${num(s.rank)} in the Tranco list of the world's most popular websites (list of ${date(listDate)})`;
    if (s.change28 != null && s.change28 !== 0) rankText += `, ${s.change28 > 0 ? 'up' : 'down'} ${num(Math.abs(s.change28))} place${Math.abs(s.change28) === 1 ? '' : 's'} in four weeks`;
    sentences.push(`${rankText}.`);
  }
  if (r?.registered) {
    sentences.push(`The domain was registered on ${date(r.registered)}, ${age(r.registered)} ago${r.registrar ? `, through ${r.registrar}` : ''}${r.expires ? `, and is paid up until ${date(r.expires)}` : ''}.`);
  }
  if (s.tech.length) {
    const main = s.tech.filter((t) => !['cdn', 'server', 'hosting'].includes(t.cat)).map((t) => t.name);
    const infra = s.tech.filter((t) => ['cdn', 'hosting'].includes(t.cat)).map((t) => t.name);
    const servers = s.tech.filter((t) => t.cat === 'server').map((t) => t.name);
    if (main.length) sentences.push(`Its homepage uses ${list(main.slice(0, 6))}${main.length > 6 ? ` and ${main.length - 6} more technologies` : ''}.`);
    if (infra.length || servers.length) sentences.push(`It is served ${infra.length ? `through ${list(infra)}` : ''}${infra.length && servers.length ? ' ' : ''}${servers.length ? `by ${list(servers)}` : ''}.`);
  }
  if (!s.facts && s.scan.error === 'robots') sentences.push(`${d} asks automated tools not to fetch its homepage (robots.txt), so we did not scan its technology.`);

  const title = s.rank
    ? `${d}: Rank #${num(s.rank)}, Domain Age & Tech Stack`
    : `${d}: Domain Age & Tech Stack`;
  const descBits = [];
  if (s.rank) descBits.push(`${d} is #${num(s.rank)} worldwide (Tranco, ${date(listDate)}).`);
  if (r?.registered) descBits.push(`Registered ${date(r.registered)} (${age(r.registered)} ago).`);
  if (s.tech.length) descBits.push(`Built with ${list(s.tech.slice(0, 4).map((t) => t.name))}.`);
  descBits.push('Free weekly report.');

  const items = [[url('/'), 'Home'], [topHref(1), 'Top sites'], [siteHref(s.d), d]];
  const scanOk = !!s.facts;
  const scanDesc = {
    robots: 'Not scanned: the site\'s robots.txt asks bots not to fetch the homepage.',
    timeout: 'The homepage did not respond within 15 seconds.',
    unreachable: 'No website answered on this domain (it may only serve APIs, e-mail or other services).',
    not_html: 'The homepage did not return an HTML page.',
  };
  const scanNote = scanOk ? null
    : scanDesc[s.scan.error] || (s.scan.error?.startsWith('http_') ? `The homepage returned HTTP ${s.scan.error.slice(5)} to our scanner.` : 'The homepage could not be fetched by our scanner.');

  const body = html`
${crumbs(items)}
<article class="site">
<header class="site-head">
  <h1>${d}</h1>
  <div class="site-actions">
    <a class="btn ghost" href="${url(`/lookup/?d=${encodeURIComponent(s.d)}`)}">Live check</a>
    <a class="btn ghost" href="https://${s.d}/" rel="nofollow noopener" target="_blank">Visit ↗</a>
  </div>
</header>
<p class="lead">${sentences.join(' ') || `Public data about ${d}.`}</p>

<div class="tiles">
  <div class="tile"><div class="tile-label">Global rank</div><div class="tile-value">${s.rank ? `#${num(s.rank)}` : '—'}</div><div class="tile-sub">${s.rank ? html`${delta(s.change7)} this week` : 'Not in the top list'}</div></div>
  <div class="tile"><div class="tile-label">Domain age</div><div class="tile-value">${r?.registered ? age(r.registered).split(',')[0] : '—'}</div><div class="tile-sub">${r?.registered ? `since ${date(r.registered)}` : 'Registration date unavailable'}</div></div>
  <div class="tile"><div class="tile-label">Technologies</div><div class="tile-value">${scanOk || s.tech.length ? num(s.tech.length) : '—'}</div><div class="tile-sub">${scanOk ? 'detected on the homepage' : 'homepage not scanned'}</div></div>
  <div class="tile"><div class="tile-label">SEO score</div><div class="tile-value">${s.seo?.score != null ? html`${s.seo.score}<small>/100</small>` : '—'}</div><div class="tile-sub">${s.seo ? 'homepage checks' : 'homepage not scanned'}</div></div>
</div>

<section id="rank">
  <h2>Popularity rank</h2>
  ${s.rank ? html`<p>#${num(s.rank)} of the top 1 million sites in the <a href="https://tranco-list.eu/">Tranco</a> research ranking, which averages several traffic and DNS sources over 30 days.${s.best ? ` Best rank in the period shown: #${num(s.best)}.` : ''}</p>` : html`<p>${d} is not in the top ${num(TOP_N)} of the current Tranco list.</p>`}
  ${rankChart(s.history)}
  <p class="small"><a href="${topHref(Math.ceil((s.rank || 1) / ctx.perPage))}">See where ${d} sits in the top ${num(ctx.sites.length)}</a></p>
</section>

<section id="domain">
  <h2>Domain registration</h2>
  ${r ? html`<dl class="facts">
    <dt>Registered</dt><dd>${r.registered ? html`${date(r.registered)} <span class="muted">(${age(r.registered)} ago)</span>` : '—'}</dd>
    <dt>Expires</dt><dd>${date(r.expires)}</dd>
    <dt>Registrar</dt><dd>${r.registrar || '—'}</dd>
    <dt>Name servers</dt><dd>${r.nameservers?.length ? r.nameservers.map((n, i) => html`${i ? ', ' : ''}<code>${n}</code>`) : '—'}</dd>
    <dt>DNSSEC</dt><dd>${r.dnssec == null ? '—' : r.dnssec ? 'Signed' : 'Not signed'}</dd>
  </dl>
  <p class="muted small">From the registry's public RDAP record, checked ${date(s.rdap.at)}.</p>`
    : html`<p class="muted">${s.rdap?.error === 'unsupported'
      ? html`The registry for <a href="${tldHref(s.tld)}">.${s.tld}</a> does not publish registration data over RDAP.`
      : 'Registration data was not available from the registry.'}</p>`}
</section>

<section id="tech">
  <h2>Technology stack</h2>
  ${techByCat.length ? html`<div class="stack">${techByCat.map(([cat, ts]) => html`<div class="stack-row">
    <div class="stack-cat">${CATEGORY_LABEL[cat]}</div>
    <div class="chips">${ts.map((t) => html`<a class="chip" href="${techHref(t.slug)}">${t.name}${t.version ? html` <small>${t.version}</small>` : ''}</a>`)}</div>
  </div>`)}</div>
  <p class="muted small">Detected from the homepage HTML and response headers on ${date(s.scan.lastOk || s.scan.at)}. Tools loaded only after scripts run (or after consent banners) may be missing.</p>`
    : html`<p class="muted">${scanNote || 'No known technologies were found in the homepage HTML or headers.'}</p>`}
</section>

${seoSection(s)}

${scanOk ? html`<section id="server">
  <h2>Server response</h2>
  <dl class="facts">
    <dt>Final URL</dt><dd><code>${s.scan.finalUrl}</code></dd>
    <dt>HTTP status</dt><dd>${s.scan.status}</dd>
    <dt>Server</dt><dd>${s.headers?.server ? html`<code>${s.headers.server}</code>` : '—'}</dd>
    <dt>Response time</dt><dd>${ms(s.scan.total)} <span class="muted">(first byte ${ms(s.scan.ttfb)}, from our scanner in a US data centre)</span></dd>
    <dt>HTML size</dt><dd>${bytes(s.scan.bytes)}</dd>
    <dt>Compression</dt><dd>${s.headers?.['content-encoding'] || 'none reported'}</dd>
  </dl>
</section>` : ''}

${s.similarStack.length ? html`<section id="similar">
  <h2>Sites with a similar tech stack</h2>
  ${siteTable(s.similarStack, { showYear: false })}
</section>` : ''}

<section id="neighbours">
  <h2>Sites ranked near ${d}</h2>
  ${siteTable(s.neighbours, { showTech: true })}
</section>

<section id="faq" class="faq">
  <h2>Questions about ${d}</h2>
  ${s.rank ? html`<h3>How popular is ${d}?</h3><p>${d} is #${num(s.rank)} worldwide in the Tranco list published ${date(listDate)}.</p>` : ''}
  ${r?.registered ? html`<h3>How old is ${d}?</h3><p>${d} was registered on ${date(r.registered)}, which makes the domain ${age(r.registered)} old.</p>` : ''}
  ${s.tech.length ? html`<h3>What is ${d} built with?</h3><p>We detected ${list(s.tech.map((t) => t.name))} on its homepage.</p>` : ''}
  ${r?.registrar ? html`<h3>Who is the registrar of ${d}?</h3><p>${r.registrar}, according to the registry's RDAP record.</p>` : ''}
</section>

${extensionCta('rank, domain age, tech stack and SEO checks')}
</article>`;

  return {
    path: `/site/${s.d}/`,
    title: `${title} | ${SITE_NAME}`,
    ogTitle: title,
    description: descBits.join(' '),
    body,
    jsonLd: { '@context': 'https://schema.org', '@graph': [breadcrumbLd(items), { '@type': 'WebPage', name: title, url: absUrl(`/site/${s.d}/`), dateModified: ctx.meta.scannedAt }] },
  };
}

// ---------------------------------------------------------------- home

export function homePage(ctx) {
  const { sites, meta, techs, analyzed } = ctx;
  const leaders = ['framework', 'cms', 'analytics', 'cdn', 'server', 'ecommerce']
    .map((cat) => [cat, techs.filter((t) => t.cat === cat && t.count > 0).sort((a, b) => b.count - a.count).slice(0, 5)])
    .filter(([, ts]) => ts.length);
  const body = html`
<section class="hero">
  <h1>Rank, domain age and tech stack of the world's top websites</h1>
  <p>Free reports on the ${num(sites.length)} most popular websites, rebuilt every week from public data: popularity rank, registration date, technologies, and homepage SEO checks.</p>
  <form class="hero-search" action="${url('/lookup/')}" method="get" role="search">
    <input type="search" name="d" placeholder="Enter a domain, e.g. github.com" aria-label="Website domain" autocomplete="off" spellcheck="false" autocapitalize="off" required>
    <button class="btn" type="submit">Look up</button>
  </form>
  <p class="examples">Try: ${['github.com', 'wikipedia.org', 'shopify.com', 'nytimes.com', 'bbc.co.uk'].filter((d) => ctx.byDomain.has(d)).map((d, i) => html`${i ? ' · ' : ''}<a href="${siteHref(d)}">${d}</a>`)}</p>
  <ul class="stats">
    <li><strong>${num(sites.length)}</strong> websites tracked</li>
    <li><strong>${num(analyzed)}</strong> homepages scanned</li>
    <li><strong>${num(techs.filter((t) => t.count).length)}</strong> technologies seen</li>
    <li>Updated <strong>${date(meta.scannedAt)}</strong></li>
  </ul>
</section>

<div class="cols">
<section>
  <h2>Most popular websites</h2>
  ${siteTable(sites.slice(0, 25), { showDelta: ctx.hasWeekly })}
  <p><a href="${topHref(1)}">Full top ${num(sites.length)} →</a></p>
</section>
<section>
  <h2>Technology leaders</h2>
  <p class="muted small">Share of the ${num(analyzed)} scanned homepages.</p>
  ${leaders.map(([cat, ts]) => html`<h3>${CATEGORY_LABEL[cat]}</h3>${shareBars(ts, analyzed)}`)}
  <p><a href="${url('/tech/')}">All technologies →</a></p>
</section>
</div>

${ctx.movers.length ? html`<section>
  <h2>Biggest climbers this week</h2>
  ${siteTable(ctx.movers, { showDelta: true })}
</section>` : ''}

${ctx.newest.length ? html`<section>
  <h2>Youngest domains in the top ${num(sites.length)}</h2>
  <div class="table-wrap"><table class="sites"><thead><tr><th class="num">Rank</th><th>Website</th><th class="num">Registered</th><th class="num">Age</th></tr></thead><tbody>
  ${ctx.newest.map((s) => html`<tr><td class="num">#${num(s.rank)}</td><td><a href="${siteHref(s.d)}">${s.display}</a></td><td class="num">${date(s.rdap.registered)}</td><td class="num">${age(s.rdap.registered)}</td></tr>`)}
  </tbody></table></div>
</section>` : ''}

${extensionCta('the same report')}
`;
  return {
    path: '/',
    title: `${SITE_NAME} — Website Rank, Domain Age & Tech Stack Lookup`,
    ogTitle: 'Website rank, domain age & tech stack lookup',
    description: `Free weekly reports on the world's top ${num(sites.length)} websites: popularity rank, domain registration date, technology stack and homepage SEO checks. No sign-up.`,
    body,
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: SITE_NAME,
      url: absUrl('/'),
      potentialAction: { '@type': 'SearchAction', target: `${absUrl('/lookup/')}?d={domain}`, 'query-input': 'required name=domain' },
    },
  };
}

// ---------------------------------------------------------------- top lists

export function topPage(n, pages, rows, ctx) {
  const from = (n - 1) * ctx.perPage + 1;
  const to = from + rows.length - 1;
  const items = [[url('/'), 'Home'], [topHref(1), 'Top sites']];
  if (n > 1) items.push([topHref(n), `#${num(from)}–${num(to)}`]);
  const pager = html`<nav class="pager" aria-label="Pages">${Array.from({ length: pages }, (_, i) => i + 1).map((p) =>
    p === n ? html`<span aria-current="page">${num((p - 1) * ctx.perPage + 1)}–${num(Math.min(p * ctx.perPage, ctx.sites.length))}</span>`
      : html`<a href="${topHref(p)}">${num((p - 1) * ctx.perPage + 1)}–${num(Math.min(p * ctx.perPage, ctx.sites.length))}</a>`)}</nav>`;
  const title = n === 1 ? `Top ${num(ctx.sites.length)} Most Popular Websites in the World` : `Most Popular Websites #${num(from)}–${num(to)}`;
  return {
    path: n > 1 ? `/top/${n}/` : '/top/',
    title: `${title} (${date(ctx.meta.tranco.date)}) | ${SITE_NAME}`,
    ogTitle: title,
    description: `The world's most popular websites ranked #${num(from)} to #${num(to)} by the Tranco research list of ${date(ctx.meta.tranco.date)}, with registration year, weekly rank change and technology stack.`,
    body: html`${crumbs(items)}
<h1>${title}</h1>
<p class="lead">Ranked by the <a href="https://tranco-list.eu/">Tranco</a> list of ${date(ctx.meta.tranco.date)}, a research ranking that combines several traffic and DNS sources and averages them over 30 days, so it is hard to manipulate. Infrastructure domains (CDNs, APIs, ad servers) are included because they receive real traffic.</p>
<p class="small">Browse by country or extension: <a href="${url('/tld/')}">top sites per domain extension</a>.</p>
${pager}
${siteTable(rows, { showDelta: ctx.hasWeekly })}
${pager}`,
    jsonLd: { '@context': 'https://schema.org', ...breadcrumbLd(items) },
  };
}

export function tldIndexPage(tlds, ctx) {
  const items = [[url('/'), 'Home'], [url('/tld/'), 'Domain extensions']];
  return {
    path: '/tld/',
    title: `Most Popular Websites by Domain Extension | ${SITE_NAME}`,
    ogTitle: 'Most popular websites by domain extension',
    description: `How the world's top ${num(ctx.sites.length)} websites split across .com, .org, country domains and new extensions, with the leading sites for each.`,
    body: html`${crumbs(items)}
<h1>Most popular websites by domain extension</h1>
<p class="lead">How the top ${num(ctx.sites.length)} sites in the Tranco list of ${date(ctx.meta.tranco.date)} split across domain extensions.</p>
<div class="table-wrap"><table class="sites"><thead><tr><th>Extension</th><th class="num">Sites</th><th class="num">Share</th><th class="hide-sm">Most popular</th></tr></thead><tbody>
${tlds.map((t) => html`<tr><td>${t.pages ? html`<a href="${tldHref(t.tld)}">.${t.tld}</a>` : `.${t.tld}`}</td><td class="num">${num(t.sites.length)}</td><td class="num">${pct(t.sites.length / ctx.sites.length)}</td><td class="hide-sm">${t.sites.slice(0, 3).map((s, i) => html`${i ? ', ' : ''}<a href="${siteHref(s.d)}">${s.display}</a>`)}</td></tr>`)}
</tbody></table></div>`,
    jsonLd: { '@context': 'https://schema.org', ...breadcrumbLd(items) },
  };
}

export function tldPage(t, ctx) {
  const items = [[url('/'), 'Home'], [url('/tld/'), 'Domain extensions'], [tldHref(t.tld), `.${t.tld}`]];
  const title = `Most Popular .${t.tld} Websites`;
  const shown = t.sites.slice(0, 1000);
  return {
    path: `/tld/${t.tld}/`,
    title: `${title} (${date(ctx.meta.tranco.date)}) | ${SITE_NAME}`,
    ogTitle: title,
    description: `The ${num(t.sites.length)} most popular .${t.tld} websites in the world's top ${num(ctx.sites.length)}, led by ${list(t.sites.slice(0, 3).map((s) => s.display))}. Rank, registration year and technology for each.`,
    body: html`${crumbs(items)}
<h1>${title}</h1>
<p class="lead">${num(t.sites.length)} of the top ${num(ctx.sites.length)} websites (${pct(t.sites.length / ctx.sites.length)}) use the .${t.tld} extension. ${t.topTech.length ? `The most common technologies among them are ${list(t.topTech.map((x) => `${x.name} (${pct(x.share, 0)})`))}.` : ''}</p>
${siteTable(shown, { showDelta: ctx.hasWeekly })}
${shown.length < t.sites.length ? html`<p class="muted">Showing the top 1,000 of ${num(t.sites.length)}.</p>` : ''}`,
    jsonLd: { '@context': 'https://schema.org', ...breadcrumbLd(items) },
  };
}

// ---------------------------------------------------------------- technologies

export function techIndexPage(ctx) {
  const items = [[url('/'), 'Home'], [url('/tech/'), 'Technologies']];
  const cats = CATEGORY_ORDER.map((c) => [c, ctx.techs.filter((t) => t.cat === c && t.count > 0).sort((a, b) => b.count - a.count)]).filter(([, ts]) => ts.length);
  return {
    path: '/tech/',
    title: `Web Technology Usage Among the Top ${num(ctx.sites.length)} Websites | ${SITE_NAME}`,
    ogTitle: `Web technology usage among the top ${num(ctx.sites.length)} websites`,
    description: `Which frameworks, CMSs, analytics tools, CDNs and web servers the world's most popular websites use, measured weekly on ${num(ctx.analyzed)} homepages.`,
    body: html`${crumbs(items)}
<h1>Web technology usage among the top websites</h1>
<p class="lead">Measured on the homepages of ${num(ctx.analyzed)} of the world's ${num(ctx.sites.length)} most popular websites, scanned ${date(ctx.meta.scannedAt)}. Shares are of scanned homepages.</p>
<nav class="toc">${cats.map(([c]) => html`<a href="#${c}">${CATEGORY_LABEL[c]}</a>`)}</nav>
<div class="cat-grid">
${cats.map(([c, ts]) => html`<section id="${c}" class="card"><h2>${CATEGORY_LABEL[c]}</h2>${shareBars(ts, ctx.analyzed)}</section>`)}
</div>`,
    jsonLd: { '@context': 'https://schema.org', ...breadcrumbLd(items) },
  };
}

export function techPage(t, ctx) {
  const items = [[url('/'), 'Home'], [url('/tech/'), 'Technologies'], [techHref(t.slug), t.name]];
  const share = t.count / ctx.analyzed;
  const peers = ctx.techs.filter((x) => x.cat === t.cat && x.count > 0).sort((a, b) => b.count - a.count);
  const position = peers.indexOf(t) + 1;
  const shown = t.sites.slice(0, 1000);
  const top3 = t.sites.slice(0, 3).map((s) => s.display);
  const title = `Websites Using ${t.name}`;
  return {
    path: `/tech/${t.slug}/`,
    title: `${title}: ${num(t.count)} Top Sites (${pct(share)}) | ${SITE_NAME}`,
    ogTitle: title,
    description: `${num(t.count)} of the world's top ${num(ctx.analyzed)} scanned websites use ${t.name}, including ${list(top3)}. Full list, versions and the tools most often used with it.`,
    body: html`${crumbs(items)}
<h1>${title}</h1>
<p class="lead">${t.info?.[0] || ''} We found ${t.name} on <strong>${num(t.count)}</strong> of ${num(ctx.analyzed)} scanned top-website homepages (${pct(share)}), making it #${position} among ${CATEGORY_LABEL[t.cat].toLowerCase()}${top3.length ? `. The most popular sites using it are ${list(top3)}` : ''}.</p>
${t.info?.[1] ? html`<p class="small">Official site: <a href="${t.info[1]}" rel="noopener">${t.info[1].replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')}</a></p>` : ''}

<div class="cols">
<section>
  <h2>${CATEGORY_LABEL[t.cat]} compared</h2>
  ${shareBars(peers.slice(0, 10), ctx.analyzed)}
</section>
<section>
  ${t.together.length ? html`<h2>Often used with ${t.name}</h2>
  <ul class="bars">${t.together.map((x) => html`<li><a href="${techHref(x.slug)}">${x.name}</a><span class="bar"><span style="width:${(x.share * 100).toFixed(1)}%"></span></span><span class="val">${pct(x.share, 0)}</span></li>`)}</ul>
  <p class="muted small">Share of ${t.name} sites that also use each technology.</p>` : ''}
  ${t.versions.length ? html`<h2>Versions seen</h2>
  <div class="table-wrap"><table><thead><tr><th>Version</th><th class="num">Sites</th></tr></thead><tbody>
  ${t.versions.slice(0, 12).map(([v, c]) => html`<tr><td>${v}</td><td class="num">${num(c)}</td></tr>`)}
  </tbody></table></div>` : ''}
</section>
</div>

<section>
  <h2>Top websites using ${t.name}</h2>
  ${siteTable(shown, { showTech: false })}
  ${shown.length < t.sites.length ? html`<p class="muted">Showing the top 1,000 of ${num(t.sites.length)}.</p>` : ''}
</section>
<p class="muted small">Detected from homepage HTML and response headers. Sites that load ${t.name} only after JavaScript runs, after a consent banner, or on inner pages may not be counted.</p>
${extensionCta(`whether the site in front of you uses ${t.name} (and about 120 other technologies)`)}`,
    jsonLd: { '@context': 'https://schema.org', ...breadcrumbLd(items) },
  };
}

// ---------------------------------------------------------------- static pages

export function lookupPage(ctx) {
  return {
    path: '/lookup/',
    title: `Website Lookup: Rank & Domain Age of Any Site | ${SITE_NAME}`,
    ogTitle: 'Website lookup: rank & domain age of any site',
    description: 'Look up any domain: its Tranco popularity rank with 30-day history and its registration date, registrar and expiry from public RDAP records. Free, no sign-up.',
    active: '/lookup/',
    body: html`
<h1>Website lookup</h1>
<p class="lead">Popularity rank and registration details for any domain, fetched live from public sources by your browser.</p>
<form class="hero-search" id="lookup-form" action="${url('/lookup/')}" method="get" role="search">
  <input type="search" name="d" id="lookup-input" placeholder="example.com" aria-label="Website domain" autocomplete="off" spellcheck="false" autocapitalize="off" required>
  <button class="btn" type="submit">Look up</button>
</form>
<div id="lookup-result" aria-live="polite"></div>
<noscript><p class="muted">The live lookup needs JavaScript. You can still browse the <a href="${topHref(1)}">top sites</a>.</p></noscript>
<section class="muted small">
  <h2>Where the data comes from</h2>
  <p>Your browser queries the <a href="https://tranco-list.eu/">Tranco</a> API for the rank and the registry's public <a href="https://about.rdap.org/">RDAP</a> service for registration data. Nothing passes through our servers. For technology and SEO details of a site that is not in our weekly report, use the <a href="${links.extension}">browser extension</a>.</p>
</section>`,
  };
}

export function aboutPage(ctx) {
  return {
    path: '/about/',
    title: `About & Methodology | ${SITE_NAME}`,
    ogTitle: `About ${SITE_NAME}`,
    description: `How ${SITE_NAME} measures website popularity, domain age and technology stacks, which public data it uses, and how its scanner behaves.`,
    active: '/about/',
    body: html`
<h1>About &amp; methodology</h1>
<p class="lead">${SITE_NAME} publishes free, weekly reports on the world's most popular websites. Everything is built from public data, and the code and data are <a href="${REPO_URL}">open source</a>.</p>

<h2>Popularity rank</h2>
<p>Ranks come from the <a href="https://tranco-list.eu/">Tranco list</a>, a research ranking designed to be hard to manipulate. It combines several sources (Chrome UX Report, Cloudflare Radar, Cisco Umbrella, Majestic and Farsight) and averages them over 30 days. We take the top ${num(TOP_N)} domains of the latest daily list each week and keep a weekly history. Tranco ranks registrable domains, so <code>mail.google.com</code> counts as <code>google.com</code>.</p>
<p class="small">Citation: Victor Le Pochat, Tom Van Goethem, Samaneh Tajalizadehkhoob, Maciej Korczyński and Wouter Joosen. "Tranco: A Research-Oriented Top Sites Ranking Hardened Against Manipulation." NDSS 2019.</p>

<h2>Domain registration</h2>
<p>Registration, expiry, registrar, name server and DNSSEC data come from each registry's public <a href="https://about.rdap.org/">RDAP</a> service, found through the <a href="https://data.iana.org/rdap/">IANA bootstrap file</a>. Some country registries (for example .de, .cn and .jp) don't offer RDAP, so those sites show no registration date. Records are refreshed every two months.</p>

<h2>Technology detection</h2>
<p>Our scanner downloads each homepage once a week and matches about 120 technology signatures against the HTML, script and stylesheet URLs, meta tags and HTTP response headers. It doesn't run JavaScript, so tools that are injected later, loaded after a cookie-consent click, or used only on inner pages can be missed, and client-rendered pages may look thin to the SEO checks. The same signatures power the <a href="${links.extension}">browser extension</a>, which sees the fully rendered page.</p>

<h2 id="bot">Our scanner (${BOT_TOKEN})</h2>
<p>The scanner identifies itself with this user agent:</p>
<pre><code>Mozilla/5.0 (compatible; ${BOT_TOKEN}/1.0; +${absUrl('/about/#bot')})</code></pre>
<p>Each week it requests <code>/robots.txt</code>, the homepage, and, when robots.txt lists no sitemap, a <code>HEAD</code> request for <code>/sitemap.xml</code>. That is at most four requests per site per week. It obeys robots.txt: if the rules for <code>${BOT_TOKEN}</code> (or for <code>*</code>, when there is no group for us) disallow <code>/</code>, the homepage is not fetched. To opt out, add:</p>
<pre><code>User-agent: ${BOT_TOKEN}
Disallow: /</code></pre>

<h2>Limitations</h2>
<ul>
  <li>Rank reflects popularity relative to other sites, not an exact visitor count.</li>
  <li>The scanner runs from a US data centre; sites that vary by country, block data-centre traffic or show a challenge page may report less.</li>
  <li>Response times are measured once, from one location, and are indicative only.</li>
</ul>

<h2>Contact</h2>
<p>Corrections, removal requests and suggestions: <a href="${REPO_URL}/issues">open an issue on GitHub</a>.</p>`,
  };
}

export function privacyPage() {
  return {
    path: '/privacy/',
    title: `Privacy | ${SITE_NAME}`,
    ogTitle: 'Privacy',
    description: `${SITE_NAME} uses no cookies, no analytics and no accounts.`,
    body: html`
<h1>Privacy</h1>
<p class="lead">This site has no cookies, no analytics, no ads, no accounts and no forms that send data to us.</p>
<ul>
  <li><strong>Hosting:</strong> the site is static and hosted on GitHub Pages. GitHub receives your IP address when you load a page, as any web host does; see the <a href="https://docs.github.com/site-policy/privacy-policies/github-general-privacy-statement">GitHub Privacy Statement</a>.</li>
  <li><strong>Live lookup:</strong> when you use the lookup page, your browser sends the domain you typed directly to the <a href="https://tranco-list.eu/">Tranco</a> API and to the domain's registry RDAP service. Their privacy policies apply. We never see what you look up.</li>
  <li><strong>Search suggestions</strong> use a list of domains downloaded to your browser; what you type stays in your browser.</li>
  <li><strong>Local storage:</strong> none.</li>
</ul>
<p>Questions: <a href="${REPO_URL}/issues">open an issue on GitHub</a>.</p>`,
  };
}

export function notFoundPage() {
  return {
    path: '/404.html',
    title: `Page not found | ${SITE_NAME}`,
    description: 'This page does not exist.',
    noindex: true,
    body: html`
<h1>Page not found</h1>
<p class="lead">We don't have a page at this address. If you were looking for a website's report, try the live lookup:</p>
<form class="hero-search" action="${url('/lookup/')}" method="get" role="search">
  <input type="search" name="d" id="nf-input" placeholder="example.com" aria-label="Website domain" autocomplete="off" spellcheck="false" autocapitalize="off" required>
  <button class="btn" type="submit">Look up</button>
</form>
<p><a href="${url('/')}">Home</a> · <a href="${topHref(1)}">Top sites</a> · <a href="${url('/tech/')}">Technologies</a></p>`,
  };
}

// Turns collectPage() facts into a scored list of SEO and technical checks.
// Each check: { id, group, status: 'pass' | 'warn' | 'fail' | 'info', args: [...] }
// The popup renders the label from the message "seo_<id>" and details from "seod_<id>_<status>".

const WEIGHT = { pass: 1, warn: 0.5, fail: 0 };

export function evaluateSeo(page) {
  const checks = [];
  const add = (group, id, status, ...args) => checks.push({ group, id, status, args: args.map(String) });

  // Content
  const titleLen = [...(page.title || '').trim()].length;
  if (!titleLen) add('content', 'title', 'fail');
  else if (titleLen < 15 || titleLen > 65) add('content', 'title', 'warn', titleLen);
  else add('content', 'title', 'pass', titleLen);

  const descLen = [...(page.description || '').trim()].length;
  if (!descLen) add('content', 'description', 'fail');
  else if (descLen < 50 || descLen > 170) add('content', 'description', 'warn', descLen);
  else add('content', 'description', 'pass', descLen);

  const h1 = page.headings?.h1Count ?? 0;
  add('content', 'h1', h1 === 1 ? 'pass' : h1 === 0 ? 'fail' : 'warn', h1);
  add('content', 'subheadings', page.headings?.h2Count > 0 ? 'pass' : 'warn', page.headings?.h2Count ?? 0);

  const imgs = page.images || { total: 0, missingAlt: 0 };
  if (!imgs.total) add('content', 'alt', 'info', 0, 0);
  else add('content', 'alt', imgs.missingAlt === 0 ? 'pass' : imgs.missingAlt / imgs.total > 0.2 ? 'fail' : 'warn', imgs.missingAlt, imgs.total);

  add('content', 'words', page.wordCount >= 300 ? 'pass' : page.wordCount >= 100 ? 'warn' : 'fail', page.wordCount ?? 0);

  // Indexing
  const robotsMeta = (page.robotsMeta || '').toLowerCase();
  add('indexing', 'indexable', /noindex|none/.test(robotsMeta) ? 'fail' : 'pass');

  if (!page.canonical) add('indexing', 'canonical', 'warn');
  else {
    let sameHost = true;
    try { sameHost = new URL(page.canonical, page.url).hostname === new URL(page.url).hostname; } catch { /* keep */ }
    add('indexing', 'canonical', sameHost ? 'pass' : 'info', page.canonical);
  }

  const r = page.robots || {};
  if (r.status === 200 && r.disallowAll) add('indexing', 'robots', 'fail');
  else if (r.status === 200) add('indexing', 'robots', 'pass');
  else if (r.status == null) add('indexing', 'robots', 'info');
  else add('indexing', 'robots', 'warn');

  const hasSitemap = (r.sitemaps || []).length > 0 || (page.sitemapStatus >= 200 && page.sitemapStatus < 300);
  add('indexing', 'sitemap', hasSitemap ? 'pass' : page.sitemapStatus == null && r.status == null ? 'info' : 'warn');

  add('indexing', 'lang', page.lang ? 'pass' : 'warn', page.lang || '');
  if (page.hreflangCount) add('indexing', 'hreflang', 'info', page.hreflangCount);
  const structured = (page.jsonLdTypes || []).length || page.microdata;
  add('indexing', 'structured', structured ? 'pass' : 'warn', (page.jsonLdTypes || []).join(', ') || (page.microdata ? 'Microdata' : ''));

  // Social
  const og = page.og || {};
  const ogCount = ['title', 'description', 'image'].filter((k) => og[k]).length;
  add('social', 'og', ogCount === 3 ? 'pass' : ogCount ? 'warn' : 'fail', ogCount);
  add('social', 'twitter', page.twitterCard ? 'pass' : 'warn', page.twitterCard || '');

  // Technical
  add('technical', 'https', page.https ? 'pass' : 'fail');
  add('technical', 'viewport', page.viewport ? 'pass' : 'fail');
  add('technical', 'favicon', page.favicon ? 'pass' : 'warn');
  add('technical', 'charset', /utf-?8/i.test(page.charset || '') ? 'pass' : 'warn', page.charset || '');

  // Security headers (only when the header request succeeded)
  if (page.headersFetched) {
    const h = page.headers || {};
    add('security', 'hsts', h['strict-transport-security'] ? 'pass' : page.https ? 'warn' : 'info');
    add('security', 'csp', h['content-security-policy'] ? 'pass' : 'warn');
    const frameProtected = h['x-frame-options'] || /frame-ancestors/i.test(h['content-security-policy'] || '');
    add('security', 'frame', frameProtected ? 'pass' : 'warn');
    add('security', 'nosniff', /nosniff/i.test(h['x-content-type-options'] || '') ? 'pass' : 'warn');
    add('security', 'referrer', h['referrer-policy'] ? 'pass' : 'warn');
  } else {
    add('security', 'headers_unavailable', 'info');
  }

  const scored = checks.filter((c) => c.status in WEIGHT);
  const score = scored.length ? Math.round((scored.reduce((s, c) => s + WEIGHT[c.status], 0) / scored.length) * 100) : null;
  return { score, checks };
}

// Core Web Vitals thresholds (web.dev): [good upper bound, poor lower bound].
export const THRESHOLDS = {
  lcp: [2500, 4000],
  inp: [200, 500],
  cls: [0.1, 0.25],
  fcp: [1800, 3000],
  ttfb: [800, 1800],
  tbt: [200, 600],
  si: [3400, 5800],
};

export function rate(metric, value) {
  const t = THRESHOLDS[metric];
  if (!t || value == null || Number.isNaN(value)) return 'none';
  return value <= t[0] ? 'good' : value <= t[1] ? 'ni' : 'poor';
}

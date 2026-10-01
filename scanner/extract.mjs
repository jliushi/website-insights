// Turns a fetched homepage (HTML + response headers) into the same "page facts" shape the
// browser extension collects in the tab, so lib/tech.js and lib/seo.js work unchanged.
import * as cheerio from 'cheerio';
import { techInputs } from '../lib/tech.js';

// Response headers kept for detection and the security checks (same list as the extension).
export const HEADER_NAMES = [
  'server', 'x-powered-by', 'via', 'x-generator', 'x-drupal-cache', 'x-drupal-dynamic-cache', 'x-shopify-stage',
  'x-shopid', 'x-wix-request-id', 'cf-ray', 'cf-cache-status', 'x-vercel-id', 'x-vercel-cache', 'x-nf-request-id',
  'x-served-by', 'x-fastly-request-id', 'x-amz-cf-id', 'x-amz-cf-pop', 'x-cache', 'x-github-request-id',
  'x-akamai-transformed', 'akamai-grn', 'x-azure-ref', 'x-litespeed-cache', 'x-varnish', 'x-pingback',
  'x-aspnet-version', 'x-aspnetmvc-version', 'x-turbo-charged-by', 'x-kinsta-cache', 'x-hw', 'x-render-origin-server',
  'fly-request-id', 'x-railway-request-id', 'x-cdn', 'x-sucuri-id', 'x-ah-environment', 'x-pantheon-styx-hostname',
  'x-envoy-upstream-service-time', 'x-goog-generation', 'x-guploader-uploadid', 'x-deno-ray', 'eagleid', 'x-swift-cachetime',
  'strict-transport-security', 'content-security-policy', 'x-frame-options', 'x-content-type-options',
  'referrer-policy', 'permissions-policy', 'alt-svc', 'content-encoding',
];

// Signals that the extension reads from JavaScript globals, found here in the served HTML instead.
// Each regex runs on the raw HTML (attributes) or on inline <script> text.
const HTML_SIGNALS = [
  { name: 'Next.js', html: /<script[^>]+id=["']__NEXT_DATA__["']|self\.__next_f\b/ },
  { name: 'Nuxt', html: /window\.__NUXT__|id=["']__NUXT_DATA__["']/ },
  { name: 'Remix', html: /window\.__remixContext|window\.__reactRouterContext/ },
  { name: 'Vue.js', html: /\sdata-v-[0-9a-f]{8}\b/ },
  { name: 'Angular', html: /\s_ngcontent-[a-z0-9-]+=/ },
  { name: 'Drupal', html: /data-drupal-selector=["']drupal-settings-json|drupalSettings/ },
  { name: 'Squarespace', html: /Static\.SQUARESPACE_CONTEXT/ },
  { name: 'Shopify', html: /\bShopify\.shop\s*=/ },
  { name: 'Wix', html: /static\.parastorage\.com|wixstatic\.com/ },
  { name: 'Google Analytics', inline: /gtag\(\s*['"]config['"]\s*,\s*['"](?:G|UA)-|\bga\(\s*['"]create['"]/ },
  { name: 'Google Tag Manager', inline: /\bGTM-[A-Z0-9]{4,}\b/ },
  { name: 'Meta Pixel', inline: /\bfbq\(\s*['"]init['"]/ },
  { name: 'Matomo', inline: /\b_paq\.push\(/ },
  { name: 'Segment', inline: /\banalytics\.load\(\s*['"]/ },
  { name: 'Intercom', inline: /\bintercomSettings\b/ },
  { name: 'Microsoft Clarity', inline: /clarity\.ms\/tag/ },
];

const SELECTORS = techInputs().selectors;

// Absolute or protocol-relative URLs written in inline script code.
function inlineUrls(inline) {
  const found = new Set();
  for (const code of inline) {
    for (const m of code.matchAll(/(?:https?:)?\/\/[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:\/[^\s"'`<>()\\]*)?/gi)) {
      found.add(m[0].startsWith('//') ? `https:${m[0]}` : m[0]);
      if (found.size >= 200) return [...found];
    }
  }
  return [...found];
}

function resolve(href, base) {
  try {
    const u = new URL(href, base);
    return /^https?:$/.test(u.protocol) ? u.href : null;
  } catch {
    return null;
  }
}

export function pickHeaders(headers) {
  const out = {};
  for (const name of HEADER_NAMES) {
    const v = headers.get(name);
    if (v != null) out[name] = v.slice(0, 300);
  }
  return out;
}

/**
 * html: decoded document text   finalUrl: URL after redirects   headers: picked header object
 * Returns { page, extraTech } where page matches collectPage()'s shape and extraTech lists
 * technology names found by HTML_SIGNALS.
 */
export function extractPage(html, finalUrl, headers) {
  const $ = cheerio.load(html, { baseURI: finalUrl });
  const text = (el) => $(el).text().replace(/\s+/g, ' ').trim();
  const meta = (key) => {
    const lower = key.toLowerCase();
    const el = $('meta').filter((_, m) => {
      const n = ($(m).attr('name') || $(m).attr('property') || '').toLowerCase();
      return n === lower;
    }).first();
    return el.length ? el.attr('content') ?? null : null;
  };
  const linkRel = (rel) => $('link').filter((_, l) => ($(l).attr('rel') || '').toLowerCase().split(/\s+/).includes(rel));

  const scripts = [];
  const inline = [];
  $('script').each((_, s) => {
    const src = $(s).attr('src');
    if (src) {
      const u = resolve(src, finalUrl);
      if (u) scripts.push(u);
      return;
    }
    const type = ($(s).attr('type') || '').toLowerCase();
    if (type && !/javascript|module/.test(type)) return;
    const body = $(s).text();
    if (body) inline.push(body.slice(0, 60000));
  });
  const stylesheets = linkRel('stylesheet').map((_, l) => resolve($(l).attr('href') || '', finalUrl)).get().filter(Boolean);

  const resourceUrls = new Set([...scripts, ...stylesheets]);
  $('img[src], iframe[src], source[src], video[src], audio[src], link[href], img[data-src]').each((_, el) => {
    const u = resolve($(el).attr('src') || $(el).attr('data-src') || $(el).attr('href') || '', finalUrl);
    if (u) resourceUrls.add(u);
  });

  const selectorHits = {};
  for (const sel of SELECTORS) {
    try { selectorHits[sel] = $(sel).length > 0; } catch { selectorHits[sel] = false; }
  }

  const jsonLdTypes = new Set();
  $('script[type="application/ld+json"]').each((_, s) => {
    try {
      const walk = (o) => {
        if (!o || typeof o !== 'object') return;
        if (Array.isArray(o)) return o.forEach(walk);
        const t = o['@type'];
        if (t) (Array.isArray(t) ? t : [t]).forEach((x) => jsonLdTypes.add(String(x)));
        if (o['@graph']) walk(o['@graph']);
      };
      walk(JSON.parse($(s).text()));
    } catch { /* invalid JSON-LD counts as absent */ }
  });

  let internal = 0, external = 0, nofollow = 0;
  const host = new URL(finalUrl).hostname;
  $('a[href]').each((_, a) => {
    const u = resolve($(a).attr('href'), finalUrl);
    if (!u) return;
    if (new URL(u).hostname === host) internal++; else external++;
    if (/\bnofollow\b/i.test($(a).attr('rel') || '')) nofollow++;
  });

  $('script, style, noscript, template').remove();
  const bodyText = $('body').text().replace(/\s+/g, ' ');
  const words = bodyText.match(/[\p{L}\p{N}]+/gu) || [];
  const cjk = (bodyText.match(/[぀-ヿ㐀-鿿가-힯]/g) || []).length;

  const charsetMeta = $('meta[charset]').attr('charset') ||
    (($('meta[http-equiv]').filter((_, m) => /content-type/i.test($(m).attr('http-equiv'))).attr('content') || '').match(/charset=([\w-]+)/i) || [])[1];

  const h1s = $('h1');
  const images = $('img');
  const page = {
    url: finalUrl,
    https: finalUrl.startsWith('https:'),
    title: text($('title').first()),
    lang: $('html').attr('lang') || '',
    charset: charsetMeta || '',
    description: meta('description'),
    robotsMeta: meta('robots'),
    viewport: meta('viewport'),
    generators: $('meta').filter((_, m) => ($(m).attr('name') || '').toLowerCase() === 'generator').map((_, m) => $(m).attr('content')).get().filter(Boolean),
    og: { title: meta('og:title'), description: meta('og:description'), image: meta('og:image'), type: meta('og:type') },
    twitterCard: meta('twitter:card'),
    canonical: linkRel('canonical').first().attr('href') ?? null,
    hreflangCount: linkRel('alternate').filter((_, l) => $(l).attr('hreflang') != null).length,
    favicon: linkRel('icon').length > 0,
    headings: {
      h1: h1s.slice(0, 5).map((_, h) => text(h).slice(0, 160)).get(),
      h1Count: h1s.length,
      h2Count: $('h2').length,
      h3Count: $('h3').length,
    },
    images: { total: images.length, missingAlt: images.filter((_, i) => $(i).attr('alt') == null).length },
    links: { internal, external, nofollow },
    wordCount: words.length + cjk,
    jsonLdTypes: [...jsonLdTypes].slice(0, 20),
    microdata: html.includes('itemscope'),
    // Inline loaders (GTM, Hotjar, Clarity…) contain the URLs they inject; those URLs are matched as scripts too.
    scripts: [...scripts.slice(0, 300), ...inlineUrls(inline).slice(0, 200)],
    stylesheets: stylesheets.slice(0, 100),
    resourceUrls: [...resourceUrls].slice(0, 500),
    selectorHits,
    cssVarHits: {},
    headersFetched: true,
    headers,
  };

  const inlineText = inline.join('\n');
  const extraTech = HTML_SIGNALS
    .filter((s) => (s.html && s.html.test(html)) || (s.inline && s.inline.test(inlineText)))
    .map((s) => s.name);
  return { page, extraTech };
}

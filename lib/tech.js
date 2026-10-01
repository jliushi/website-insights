// Technology signatures. Each entry is matched against facts collected from the page.
//   globals:  window paths that exist when the technology is loaded (main world)
//   version:  window path holding a version string
//   meta:     regex on <meta name="generator"> (first capture group = version)
//   script:   regex on <script src> URLs        css: regex on stylesheet URLs
//   resource: regex on any loaded resource URL  dom: CSS selector that exists in the page
//   header:   { headerName: regex }             special: marker from collectGlobals ('@react' …)
//   headerAll: like header, but every listed header must match (caseSensitive: exact case)
//   cssVar:   custom properties (|-separated) defined on the root element
export const SIGNATURES = [
  // JavaScript frameworks
  { name: 'React', cat: 'framework', special: '@react', globals: ['React'], version: 'React.version', dom: '[data-reactroot]' },
  { name: 'Next.js', cat: 'framework', globals: ['__NEXT_DATA__', 'next'], version: 'next.version', script: '/_next/static/', dom: '#__next' },
  { name: 'Vue.js', cat: 'framework', special: '@vue3|@vue2', globals: ['Vue', '__VUE__'], version: 'Vue.version', dom: '[data-v-app]' },
  { name: 'Nuxt', cat: 'framework', globals: ['__NUXT__', '$nuxt', 'useNuxtApp'], script: '/_nuxt/', dom: '#__nuxt' },
  { name: 'Angular', cat: 'framework', globals: ['ng', 'getAllAngularRootElements'], dom: '[ng-version]' },
  { name: 'AngularJS', cat: 'framework', globals: ['angular'], version: 'angular.version.full', dom: '[ng-app], .ng-scope' },
  { name: 'Svelte', cat: 'framework', globals: ['__svelte'], dom: '[class*="svelte-"]' },
  { name: 'SvelteKit', cat: 'framework', globals: ['__sveltekit_dev'], script: '/_app/immutable/', dom: '[data-sveltekit-preload-data]' },
  { name: 'Gatsby', cat: 'framework', globals: ['___gatsby', '___loader'], dom: '#___gatsby' },
  { name: 'Remix', cat: 'framework', globals: ['__remixContext', '__reactRouterContext'] },
  { name: 'Astro', cat: 'framework', dom: 'astro-island, [data-astro-cid], [class*="astro-"]', meta: 'Astro v?([\\d.]+)?' },
  { name: 'Preact', cat: 'framework', globals: ['preact'], },
  { name: 'SolidJS', cat: 'framework', globals: ['_$HY'] },
  { name: 'Qwik', cat: 'framework', dom: '[q\\:container]' },
  { name: 'Ember.js', cat: 'framework', globals: ['Ember'], version: 'Ember.VERSION' },
  { name: 'Backbone.js', cat: 'framework', globals: ['Backbone'], version: 'Backbone.VERSION' },
  { name: 'Alpine.js', cat: 'framework', globals: ['Alpine'], version: 'Alpine.version', dom: '[x-data]' },
  { name: 'htmx', cat: 'framework', globals: ['htmx'], version: 'htmx.version', dom: '[hx-get], [hx-post]' },
  { name: 'jQuery', cat: 'library', globals: ['jQuery'], version: 'jQuery.fn.jquery', script: 'jquery[.-]?(\\d[\\d.]*)?(\\.min)?\\.js' },
  { name: 'Lodash / Underscore', cat: 'library', globals: ['_.VERSION'], version: '_.VERSION' },
  { name: 'Three.js', cat: 'library', globals: ['THREE'], version: 'THREE.REVISION' },
  { name: 'GSAP', cat: 'library', globals: ['gsap'], version: 'gsap.version' },
  { name: 'core-js', cat: 'library', globals: ['__core-js_shared__'] },

  // CMS & site builders
  { name: 'WordPress', cat: 'cms', meta: 'WordPress ?([\\d.]+)?', script: '/wp-(content|includes)/', css: '/wp-(content|includes)/', header: { 'x-pingback': 'xmlrpc\\.php' } },
  { name: 'Drupal', cat: 'cms', globals: ['Drupal'], meta: 'Drupal ?(\\d+)?', header: { 'x-drupal-cache': '.', 'x-generator': 'Drupal' } },
  { name: 'Joomla', cat: 'cms', globals: ['Joomla'], meta: 'Joomla!? ?([\\d.]+)?' },
  { name: 'Ghost', cat: 'cms', meta: 'Ghost ?([\\d.]+)?', script: '/ghost/' },
  { name: 'Wix', cat: 'cms', globals: ['wixBiSession'], meta: 'Wix\\.com', header: { 'x-wix-request-id': '.' } },
  { name: 'Squarespace', cat: 'cms', globals: ['Static.SQUARESPACE_CONTEXT', 'Squarespace'], script: 'squarespace' },
  { name: 'Webflow', cat: 'cms', globals: ['Webflow'], dom: 'html[data-wf-site]', meta: 'Webflow' },
  { name: 'Framer', cat: 'cms', meta: 'Framer ?([\\w.]+)?', script: 'framerusercontent\\.com|framer\\.com/m/' },
  { name: 'HubSpot CMS', cat: 'cms', meta: 'HubSpot', header: { 'x-hs-hub-id': '.' } },
  { name: 'Hugo', cat: 'cms', meta: 'Hugo ?([\\d.]+)?' },
  { name: 'Jekyll', cat: 'cms', meta: 'Jekyll v?([\\d.]+)?' },
  { name: 'Hexo', cat: 'cms', meta: 'Hexo ?([\\d.]+)?' },
  { name: 'Docusaurus', cat: 'cms', meta: 'Docusaurus v?([\\d.]+)?' },
  { name: 'VitePress', cat: 'cms', meta: 'VitePress v?([\\d.]+)?', globals: ['__VP_HASH_MAP__'] },
  { name: 'MkDocs', cat: 'cms', meta: 'mkdocs-?([\\d.]+)?' },
  { name: 'Blogger', cat: 'cms', meta: 'Blogger' },
  { name: 'Medium', cat: 'cms', resource: 'cdn-client\\.medium\\.com' },
  { name: 'Notion', cat: 'cms', resource: 'notion\\.so/|notion-static\\.com' },

  // E-commerce
  { name: 'Shopify', cat: 'ecommerce', globals: ['Shopify'], script: 'cdn\\.shopify\\.com', header: { 'x-shopid': '.', 'x-shopify-stage': '.' } },
  { name: 'WooCommerce', cat: 'ecommerce', globals: ['woocommerce_params', 'wc_add_to_cart_params'], dom: '.woocommerce, body.woocommerce-page' },
  { name: 'Magento', cat: 'ecommerce', globals: ['Mage'], script: '/static/version\\d+/frontend/|/mage/' },
  { name: 'BigCommerce', cat: 'ecommerce', globals: ['BCData'], script: 'bigcommerce\\.com' },
  { name: 'PrestaShop', cat: 'ecommerce', globals: ['prestashop'], meta: 'PrestaShop' },
  { name: 'Shopline', cat: 'ecommerce', globals: ['Shopline'] },

  // Analytics
  { name: 'Google Analytics', cat: 'analytics', globals: ['gtag', 'ga', 'GoogleAnalyticsObject'], script: 'google-analytics\\.com/(analytics|ga)\\.js|googletagmanager\\.com/gtag/js' },
  { name: 'Google Tag Manager', cat: 'analytics', globals: ['google_tag_manager'], script: 'googletagmanager\\.com/gtm\\.js' },
  { name: 'Meta Pixel', cat: 'analytics', globals: ['fbq'], script: 'connect\\.facebook\\.net/.+/fbevents\\.js' },
  { name: 'Hotjar', cat: 'analytics', globals: ['hj'], script: 'static\\.hotjar\\.com' },
  { name: 'Microsoft Clarity', cat: 'analytics', globals: ['clarity'], script: 'clarity\\.ms/tag' },
  { name: 'Plausible', cat: 'analytics', globals: ['plausible'], script: 'plausible\\.io/js' },
  { name: 'Fathom', cat: 'analytics', script: 'cdn\\.usefathom\\.com' },
  { name: 'Umami', cat: 'analytics', globals: ['umami'], dom: 'script[data-website-id]' },
  { name: 'Matomo', cat: 'analytics', globals: ['_paq', 'Matomo', 'Piwik'], script: 'matomo\\.js|piwik\\.js' },
  { name: 'Mixpanel', cat: 'analytics', globals: ['mixpanel'], script: 'cdn\\.mxpnl\\.com|mixpanel' },
  { name: 'Segment', cat: 'analytics', globals: ['analytics.SNIPPET_VERSION'], script: 'cdn\\.segment\\.com' },
  { name: 'Amplitude', cat: 'analytics', globals: ['amplitude'], script: 'cdn\\.amplitude\\.com' },
  { name: 'PostHog', cat: 'analytics', globals: ['posthog'], script: 'posthog' },
  { name: 'Heap', cat: 'analytics', globals: ['heap'], script: 'cdn\\.heapanalytics\\.com' },
  { name: 'Baidu Tongji', cat: 'analytics', globals: ['_hmt'], script: 'hm\\.baidu\\.com/hm\\.js' },
  { name: 'Yandex Metrica', cat: 'analytics', globals: ['ym'], script: 'mc\\.yandex\\.ru/metrika' },
  { name: 'Vercel Analytics', cat: 'analytics', globals: ['va'], resource: '/_vercel/insights/' },
  { name: 'Cloudflare Web Analytics', cat: 'analytics', script: 'static\\.cloudflareinsights\\.com/beacon' },

  // Advertising & marketing
  { name: 'Google AdSense', cat: 'ads', globals: ['adsbygoogle'], script: 'pagead2\\.googlesyndication\\.com' },
  { name: 'Google Ad Manager', cat: 'ads', globals: ['googletag.pubads'], script: 'securepubads\\.g\\.doubleclick\\.net' },
  { name: 'Amazon Ads', cat: 'ads', globals: ['apstag'], script: 'amazon-adsystem\\.com' },
  { name: 'Taboola', cat: 'ads', globals: ['_taboola'], script: 'cdn\\.taboola\\.com' },
  { name: 'HubSpot', cat: 'marketing', globals: ['_hsq'], script: 'js\\.hs-scripts\\.com|js\\.hsforms\\.net' },
  { name: 'Mailchimp', cat: 'marketing', script: 'chimpstatic\\.com|list-manage\\.com' },
  { name: 'Klaviyo', cat: 'marketing', globals: ['klaviyo'], script: 'static\\.klaviyo\\.com' },

  // Customer support / chat
  { name: 'Intercom', cat: 'chat', globals: ['Intercom'], script: 'widget\\.intercom\\.io' },
  { name: 'Crisp', cat: 'chat', globals: ['$crisp'], script: 'client\\.crisp\\.chat' },
  { name: 'Zendesk', cat: 'chat', globals: ['zE'], script: 'static\\.zdassets\\.com' },
  { name: 'Drift', cat: 'chat', globals: ['drift'], script: 'js\\.driftt\\.com' },
  { name: 'tawk.to', cat: 'chat', globals: ['Tawk_API'], script: 'embed\\.tawk\\.to' },

  // Payments
  { name: 'Stripe', cat: 'payments', globals: ['Stripe'], script: 'js\\.stripe\\.com' },
  { name: 'PayPal', cat: 'payments', globals: ['paypal'], script: 'paypal\\.com/sdk/js|paypalobjects\\.com' },
  { name: 'Paddle', cat: 'payments', globals: ['Paddle'], script: 'cdn\\.paddle\\.com' },
  { name: 'Lemon Squeezy', cat: 'payments', globals: ['LemonSqueezy'], script: 'lemonsqueezy\\.com' },

  // Security / bot protection
  { name: 'reCAPTCHA', cat: 'security', globals: ['grecaptcha'], script: 'google\\.com/recaptcha|recaptcha\\.net' },
  { name: 'hCaptcha', cat: 'security', globals: ['hcaptcha'], script: 'hcaptcha\\.com' },
  { name: 'Cloudflare Turnstile', cat: 'security', globals: ['turnstile'], script: 'challenges\\.cloudflare\\.com/turnstile' },
  { name: 'Sucuri', cat: 'security', header: { 'x-sucuri-id': '.' } },

  // UI & fonts
  { name: 'Bootstrap', cat: 'ui', globals: ['bootstrap'], version: 'bootstrap.Tooltip.VERSION', css: 'bootstrap(\\.min)?\\.css', script: 'bootstrap(\\.bundle)?(\\.min)?\\.js', cssVar: '--bs-body-font-family' },
  { name: 'Tailwind CSS', cat: 'ui', globals: ['tailwind'], cssVar: '--tw-ring-offset-width|--tw-translate-x|--tw-border-spacing-x' },
  { name: 'Font Awesome', cat: 'ui', css: 'font-?awesome', script: 'kit\\.fontawesome\\.com', dom: '.fa-solid, .fas, .fa-brands' },
  { name: 'Google Fonts', cat: 'ui', css: 'fonts\\.googleapis\\.com', resource: 'fonts\\.gstatic\\.com' },
  { name: 'Adobe Fonts', cat: 'ui', css: 'use\\.typekit\\.net', resource: 'use\\.typekit\\.net' },
  { name: 'Material UI', cat: 'ui', dom: '[class*="MuiBox-"], [class*="MuiButton-"]' },
  { name: 'Ant Design', cat: 'ui', dom: '[class^="ant-"], [class*=" ant-btn"]' },
  { name: 'Element Plus', cat: 'ui', dom: '.el-button, .el-input__wrapper', cssVar: '--el-color-primary' },

  // CDN & hosting (mostly from response headers)
  { name: 'Cloudflare', cat: 'cdn', header: { 'cf-ray': '.', server: '^cloudflare' }, resource: '/cdn-cgi/' },
  { name: 'Fastly', cat: 'cdn', header: { 'x-fastly-request-id': '.', 'x-served-by': '^cache-' } },
  { name: 'Amazon CloudFront', cat: 'cdn', header: { 'x-amz-cf-id': '.', via: 'cloudfront' } },
  { name: 'Akamai', cat: 'cdn', header: { 'x-akamai-transformed': '.', 'akamai-grn': '.', server: 'AkamaiGHost' } },
  { name: 'Azure Front Door', cat: 'cdn', header: { 'x-azure-ref': '.' } },
  { name: 'Alibaba Cloud CDN', cat: 'cdn', header: { eagleid: '.', 'x-swift-cachetime': '.', server: 'Tengine' } },
  { name: 'jsDelivr', cat: 'cdn', resource: 'cdn\\.jsdelivr\\.net' },
  { name: 'cdnjs', cat: 'cdn', resource: 'cdnjs\\.cloudflare\\.com' },
  { name: 'unpkg', cat: 'cdn', resource: 'unpkg\\.com' },
  { name: 'Vercel', cat: 'hosting', header: { 'x-vercel-id': '.', server: '^Vercel' } },
  { name: 'Netlify', cat: 'hosting', header: { 'x-nf-request-id': '.', server: '^Netlify' } },
  { name: 'GitHub Pages', cat: 'hosting', headerAll: { server: '^GitHub\\.com$', 'x-fastly-request-id': '.' }, caseSensitive: true },
  { name: 'Render', cat: 'hosting', header: { 'x-render-origin-server': '.' } },
  { name: 'Fly.io', cat: 'hosting', header: { 'fly-request-id': '.', server: '^Fly/' } },
  { name: 'Railway', cat: 'hosting', header: { 'x-railway-request-id': '.' } },
  { name: 'Deno Deploy', cat: 'hosting', header: { 'x-deno-ray': '.', server: '^deno' } },
  { name: 'Kinsta', cat: 'hosting', header: { 'x-kinsta-cache': '.' } },
  { name: 'WP Engine', cat: 'hosting', header: { 'x-powered-by': 'WP Engine' } },
  { name: 'Pantheon', cat: 'hosting', header: { 'x-pantheon-styx-hostname': '.' } },
  { name: 'Google Cloud Storage', cat: 'hosting', header: { 'x-goog-generation': '.', 'x-guploader-uploadid': '.' } },

  // Web servers & back-end
  { name: 'Nginx', cat: 'server', header: { server: '^nginx(?:/([\\d.]+))?' } },
  { name: 'Apache', cat: 'server', header: { server: '^Apache(?:/([\\d.]+))?' } },
  { name: 'LiteSpeed', cat: 'server', header: { server: '^LiteSpeed', 'x-litespeed-cache': '.' } },
  { name: 'Microsoft IIS', cat: 'server', header: { server: '^Microsoft-IIS(?:/([\\d.]+))?' } },
  { name: 'OpenResty', cat: 'server', header: { server: '^openresty(?:/([\\d.]+))?' } },
  { name: 'Caddy', cat: 'server', header: { server: '^Caddy' } },
  { name: 'Envoy', cat: 'server', header: { server: '^envoy', 'x-envoy-upstream-service-time': '.' } },
  { name: 'Varnish', cat: 'server', header: { 'x-varnish': '.' } },
  { name: 'PHP', cat: 'backend', header: { 'x-powered-by': 'PHP(?:/([\\d.]+))?' } },
  { name: 'ASP.NET', cat: 'backend', header: { 'x-aspnet-version': '(.+)', 'x-powered-by': 'ASP\\.NET' } },
  { name: 'Express', cat: 'backend', header: { 'x-powered-by': '^Express' } },
  { name: 'Next.js server', cat: 'backend', header: { 'x-powered-by': '^Next\\.js' } },
];

export const CATEGORY_ORDER = ['framework', 'library', 'cms', 'ecommerce', 'ui', 'analytics', 'ads', 'marketing', 'chat', 'payments', 'security', 'cdn', 'hosting', 'server', 'backend'];

/** Everything the page probes need to look for. */
export function techInputs() {
  const globals = new Set();
  const selectors = new Set();
  const cssVars = new Set();
  for (const s of SIGNATURES) {
    for (const g of s.globals || []) globals.add(g);
    if (s.version) globals.add(s.version);
    if (s.dom) selectors.add(s.dom);
    for (const v of s.cssVar ? s.cssVar.split('|') : []) cssVars.add(v);
  }
  return { globals: [...globals], selectors: [...selectors], cssVars: [...cssVars] };
}

const cleanVersion = (v) => {
  if (v == null || v === true) return null;
  const m = String(v).match(/\d+(?:\.\d+){0,3}/);
  return m ? m[0] : null;
};

/**
 * Matches signatures against page facts.
 * page:    result of collectPage()   globals: result of collectGlobals() (may be {})
 * Returns [{ name, cat, version }] sorted by category.
 */
export function detectTech(page, globals = {}) {
  const found = [];
  const test = (re, value) => {
    const m = new RegExp(re, 'i').exec(value);
    return m ? { version: m[1] || null } : null;
  };
  for (const s of SIGNATURES) {
    let hit = false;
    let version = null;

    if (s.special) {
      for (const marker of s.special.split('|')) {
        if (globals[marker]) { hit = true; version = version || cleanVersion(globals[marker]); }
      }
    }
    for (const g of s.globals || []) if (globals[g]) hit = true;
    if (s.version && globals[s.version]) { hit = true; version = cleanVersion(globals[s.version]) || version; }
    if (s.meta) {
      for (const gen of page.generators || []) {
        const m = test(s.meta, gen);
        if (m) { hit = true; version = version || cleanVersion(m.version); }
      }
    }
    if (s.script) {
      for (const src of page.scripts || []) {
        const m = test(s.script, src);
        if (m) { hit = true; version = version || cleanVersion(m.version); break; }
      }
    }
    if (s.css && (page.stylesheets || []).some((href) => test(s.css, href))) hit = true;
    if (s.resource && (page.resourceUrls || []).some((u) => test(s.resource, u))) hit = true;
    if (s.dom && page.selectorHits?.[s.dom]) hit = true;
    if (s.cssVar && s.cssVar.split('|').some((v) => page.cssVarHits?.[v])) hit = true;
    if (s.headerAll) {
      const all = Object.entries(s.headerAll).every(([name, re]) => {
        const value = page.headers?.[name];
        return value != null && new RegExp(re, s.caseSensitive ? '' : 'i').test(value);
      });
      if (all) hit = true;
    }
    if (s.header) {
      for (const [name, re] of Object.entries(s.header)) {
        const value = page.headers?.[name];
        if (value == null) continue;
        const m = test(re, value);
        if (m) { hit = true; version = version || cleanVersion(m.version); }
      }
    }
    if (hit) found.push({ name: s.name, cat: s.cat, version });
  }
  // Drop "Next.js server" when Next.js itself was found; drop Preact false positives under React.
  const names = new Set(found.map((f) => f.name));
  const result = found.filter((f) => !(f.name === 'Next.js server' && names.has('Next.js')));
  if (names.has('Next.js') && !names.has('React')) result.push({ name: 'React', cat: 'framework', version: null });
  if (names.has('Nuxt') && !names.has('Vue.js')) result.push({ name: 'Vue.js', cat: 'framework', version: null });
  if (names.has('Gatsby') && !names.has('React')) result.push({ name: 'React', cat: 'framework', version: null });
  if (names.has('SvelteKit') && !names.has('Svelte')) result.push({ name: 'Svelte', cat: 'framework', version: null });
  return result.sort((a, b) => CATEGORY_ORDER.indexOf(a.cat) - CATEGORY_ORDER.indexOf(b.cat) || a.name.localeCompare(b.name));
}

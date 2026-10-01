// Unit checks for the parts that are easy to get subtly wrong.  node test/test.mjs
import assert from 'node:assert/strict';
import { parseRobots } from '../scanner/fetch.mjs';
import { extractPage } from '../scanner/extract.mjs';
import { detectTech } from '../lib/tech.js';

// robots.txt
assert.equal(parseRobots('User-agent: *\nDisallow: /').allowed, false);
assert.equal(parseRobots('User-agent: *\nDisallow: /\n\nUser-agent: WebsiteInsightsBot\nAllow: /').allowed, true);
assert.equal(parseRobots('User-agent: *\nDisallow:').allowed, true);
assert.equal(parseRobots('User-agent: *\nDisallow: /private/').allowed, true);
assert.equal(parseRobots('User-agent: Googlebot\nAllow: /\n\nUser-agent: *\nDisallow: /').allowed, false);
assert.equal(parseRobots('User-agent: WebsiteInsightsBot\nDisallow: /\n\nUser-agent: *\nAllow: /').allowed, false);
assert.equal(parseRobots('User-agent: *\nDisallow: /\nAllow: /$').allowed, true);
assert.deepEqual(parseRobots('Sitemap: https://a.com/s.xml\nUser-agent: *\nDisallow:').sitemaps, ['https://a.com/s.xml']);
assert.equal(parseRobots('User-agent: a\nUser-agent: *\nDisallow: /').disallowAll, true);

// extraction + detection
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Example store</title>
<meta name="description" content="A test page"><meta name="generator" content="WordPress 6.5.2">
<link rel="stylesheet" href="/wp-content/themes/x/style.css"><link rel="canonical" href="https://ex.com/">
<script>(function(w,d,s,l,i){j.src='https://www.googletagmanager.com/gtm.js?id='+i;})(window,document,'script','dataLayer','GTM-ABC123');</script>
<script>var image='/img/image/x.png';</script>
</head><body><h1>Hi</h1><div data-v-1a2b3c4d>vue</div><img src="a.png"></body></html>`;
const { page, extraTech } = extractPage(html, 'https://ex.com/', { server: 'nginx/1.25.3', 'cf-ray': 'abc' });
assert.equal(page.title, 'Example store');
assert.equal(page.headings.h1Count, 1);
assert.equal(page.images.missingAlt, 1);
assert.ok(extraTech.includes('Vue.js'));
assert.ok(extraTech.includes('Google Tag Manager'));
const names = detectTech(page, {}).map((t) => t.name);
for (const n of ['WordPress', 'Google Tag Manager', 'Cloudflare', 'Nginx']) assert.ok(names.includes(n), n);
assert.ok(!names.includes('Magento'), 'image/ paths must not look like Magento');
assert.equal(detectTech(page, {}).find((t) => t.name === 'Nginx').version, '1.25.3');
console.log('all tests passed');

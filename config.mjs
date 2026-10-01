// Site-wide settings. SITE_ORIGIN + BASE_PATH form every absolute URL on the site.
// Override with environment variables when serving from another host (e.g. a custom domain: BASE_PATH="").
export const SITE_NAME = 'Website Insights';
export const SITE_ORIGIN = process.env.SITE_ORIGIN ?? 'https://jliushi.github.io';
export const BASE_PATH = process.env.BASE_PATH ?? '/website-insights';
export const REPO_URL = 'https://github.com/jliushi/website-insights';
export const EXTENSION_REPO_URL = 'https://github.com/jliushi/website-insights-tool';
export const AMO_SLUG = 'website-insights-tool';

// Where "Get the extension" points. The build switches it to the Firefox Add-ons page once the
// listing is public (see generator/build.mjs).
export const links = { extension: EXTENSION_REPO_URL };

// How many sites from the top of the Tranco list are scanned each week.
export const TOP_N = Number(process.env.TOP_N ?? 10000);

// The scanner identifies itself honestly and obeys robots.txt rules for this token or "*".
export const BOT_TOKEN = 'WebsiteInsightsBot';
export const BOT_UA = `Mozilla/5.0 (compatible; ${BOT_TOKEN}/1.0; +${SITE_ORIGIN}${BASE_PATH}/about/#bot)`;

export const url = (path = '/') => `${BASE_PATH}${path}`;
export const absUrl = (path = '/') => `${SITE_ORIGIN}${BASE_PATH}${path}`;

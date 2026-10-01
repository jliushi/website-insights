# Website Insights — site

A static website with free weekly reports on the world's most popular websites: popularity rank (with history), domain registration, technology stack and homepage SEO checks.

**Live:** https://jliushi.github.io/website-insights/

Companion to the [Website Insights browser extension](https://github.com/jliushi/website-insights-tool), which shares the technology signatures (`lib/tech.js`), SEO checks (`lib/seo.js`) and domain parsing (`lib/domain.js`).

## How it works

A GitHub Actions workflow (`.github/workflows/update.yml`) runs every Wednesday:

1. **Scan** (`scanner/scan.mjs`):
   - Takes the top 10,000 domains of the latest [Tranco](https://tranco-list.eu/) list and backfills 26 weeks of rank history.
   - Fetches each homepage once. The scanner identifies itself as `WebsiteInsightsBot` and obeys robots.txt.
   - Looks up registration data over RDAP; each record is refreshed every 60 days.
   - Results go to `data/*.json` and are committed back to the repo.
2. **Build** (`generator/build.mjs`): renders about 10,000 site pages, technology pages, top lists, domain-extension pages, a sitemap and a client-side lookup page into `dist/`.
3. **Deploy** to GitHub Pages.

No servers, databases, accounts, cookies or analytics.

## Development

```sh
npm install
node scanner/scan.mjs --limit=300 --backfill=4   # small sample into data/
node generator/build.mjs                          # writes dist/
node generator/serve.mjs                          # http://localhost:8080/website-insights/
node test/test.mjs                                # unit tests
node test/shots.mjs test/out                      # screenshots (needs the preview server running)
node scripts/make-images.mjs                      # re-render icons and og.png
```

Scanner options: `--limit=N`, `--only=a.com,b.org`, `--no-rdap`, `--backfill=WEEKS`, `--concurrency=N`.
To serve from a custom domain, set `SITE_ORIGIN` and `BASE_PATH=""` in the workflow.

## Data sources

- Rank: Tranco list. Le Pochat et al., "Tranco: A Research-Oriented Top Sites Ranking Hardened Against Manipulation," NDSS 2019.
- Registration: registry RDAP services via the IANA bootstrap file.
- Public suffixes: Public Suffix List (MPL-2.0), bundled in `lib/psl-data.js`.

## License

MIT

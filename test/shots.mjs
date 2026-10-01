import puppeteer from 'puppeteer';
const base = 'http://localhost:8080/website-insights';
const out = process.argv[2];
const pages = (process.argv[3] || '/,/site/github.com/,/tech/,/lookup/?d=github.com').split(',');
const browser = await puppeteer.launch();
const errors = [];
for (const [w, h, tag, dark] of [[1280, 900, 'd', false], [390, 844, 'm', false], [1280, 900, 'dark', true]]) {
  const page = await browser.newPage();
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`${m.text()} @ ${page.url()}`); });
  page.on('pageerror', (e) => errors.push(`${e.message} @ ${page.url()}`));
  await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
  if (dark) await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
  for (const p of pages) {
    if (dark && p !== pages[1]) continue;
    await page.goto(base + p, { waitUntil: 'networkidle0', timeout: 60000 });
    const name = p.replace(/[^a-z0-9]+/gi, '_') || 'home';
    await page.screenshot({ path: `${out}/${tag}${name}.png`, fullPage: true });
    const sw = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (sw > 0) errors.push(`horizontal overflow ${sw}px on ${p} (${w})`);
  }
  await page.close();
}
await browser.close();
console.log(errors.length ? errors.join('\n') : 'no console errors / overflow');

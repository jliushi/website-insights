// Renders the PNG icons and the social preview image (generator/assets/og.png) from icon.svg.
// Dev-only: needs the puppeteer devDependency.  node scripts/make-images.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ASSETS = path.join(ROOT, 'generator', 'assets');
const svg = fs.readFileSync(path.join(ASSETS, 'icon.svg'), 'utf8');
const svgData = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;

const browser = await puppeteer.launch();
const page = await browser.newPage();

for (const size of [32, 180]) {
  await page.setViewport({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:transparent"><img src="${svgData}" width="${size}" height="${size}"></body></html>`);
  await page.screenshot({ path: path.join(ASSETS, `icon-${size}.png`), omitBackground: true });
}

await page.setViewport({ width: 1200, height: 630 });
await page.setContent(`<html><body style="margin:0;width:1200px;height:630px;display:flex;flex-direction:column;justify-content:center;padding:0 90px;box-sizing:border-box;
  background:linear-gradient(135deg,#4f73f0,#2b3fb8);color:#fff;font-family:'Segoe UI',system-ui,sans-serif">
  <div style="display:flex;align-items:center;gap:24px;margin-bottom:40px">
    <img src="${svgData}" width="96" height="96" style="filter:drop-shadow(0 4px 12px rgba(0,0,0,.25))">
    <span style="font-size:44px;font-weight:700">Website Insights</span>
  </div>
  <div style="font-size:64px;font-weight:800;line-height:1.12;letter-spacing:-1px">Rank, domain age &amp; tech stack<br>of the world's top websites</div>
  <div style="font-size:30px;margin-top:34px;opacity:.85">Free · updated every week · public data</div>
</body></html>`);
await page.screenshot({ path: path.join(ASSETS, 'og.png') });
await browser.close();
console.log('icons and og.png written');

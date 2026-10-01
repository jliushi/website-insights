// Tranco research ranking (https://tranco-list.eu): latest and historical daily lists, top N entries.
import { BOT_UA } from '../config.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getTranco(url) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch(url, { headers: { 'User-Agent': BOT_UA } });
    if (res.status === 429) { await sleep(3000 * (attempt + 1)); continue; }
    return res;
  }
  throw new Error(`Tranco rate limit: ${url}`);
}

async function listInfo(date) {
  const res = await getTranco(`https://tranco-list.eu/api/lists/date/${date}`);
  if (!res.ok) return null;
  const info = await res.json();
  return info.available && info.list_id ? info : null;
}

async function download(info, n) {
  await sleep(1200);
  const res = await getTranco(`https://tranco-list.eu/download/${info.list_id}/${n}`);
  if (!res.ok) throw new Error(`Tranco download HTTP ${res.status}`);
  const rows = (await res.text()).trim().split(/\r?\n/).map((line) => {
    const [rank, domain] = line.split(',');
    return { rank: Number(rank), domain: (domain || '').trim().toLowerCase() };
  }).filter((r) => r.rank > 0 && r.domain);
  return { id: info.list_id, date: info.created_on.slice(0, 10), rows };
}

export async function latestTranco(n) {
  const info = await listInfo('latest');
  if (!info) throw new Error('Tranco: no list available');
  return download(info, n);
}

/** The daily list published on `date` (YYYY-MM-DD), or null if there is none. */
export async function trancoForDate(date, n) {
  await sleep(1200);
  const info = await listInfo(date);
  return info ? download(info, n) : null;
}

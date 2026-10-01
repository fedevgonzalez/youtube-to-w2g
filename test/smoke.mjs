// Smoke test: loads the REAL unpacked extension in Chromium and checks that the
// Y2W buttons still attach to live YouTube markup. Purpose: catch YouTube markup
// changes (renamed classes/tags) before users do. Never clicks a button (no API calls).
// Run: npm run smoke   (needs network; first run: npx playwright install chromium)
// Exit codes: 0 all pass, 1 real failure, 2 inconclusive (consent / bot wall / no results).
import { chromium } from 'playwright';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const repo = resolve(import.meta.dirname, '..');
// Same selectors as js/content.js, read from its source so they cannot drift
const src = readFileSync(join(repo, 'js/content.js'), 'utf8');
const pick = (name) => src.match(new RegExp(`const ${name} = '([^']+)'`))?.[1];
const EXCLUDE = pick('THUMB_EXCLUDE'), MEDIA = pick('THUMB_MEDIA');
if (!EXCLUDE || !MEDIA) throw new Error('THUMB_EXCLUDE / THUMB_MEDIA not found in js/content.js');

const measure = ([EXCLUDE, MEDIA]) => {
  const isVideo = (a) => {
    const u = new URL(a.href, location.origin);
    return (u.pathname === '/watch' && u.searchParams.get('v')) || u.pathname.startsWith('/shorts/');
  };
  const hosts = [...document.querySelectorAll('a[href*="/watch"], a[href*="/shorts/"]')].filter(a =>
    isVideo(a) && a.querySelector(MEDIA) && !a.querySelector('a[href]') &&
    !a.closest(EXCLUDE) && a.getBoundingClientRect().width > 0);
  const vol = document.querySelector('.ytp-left-controls .ytp-volume-area, .ytp-left-controls .ytp-volume-panel');
  const shorts = [...document.querySelectorAll('ytm-shorts-lockup-view-model')];
  return {
    buttons: document.querySelectorAll('.w2g-thumbnail-button').length,
    hosts: hosts.length,
    covered: hosts.filter(a => a.querySelector('.w2g-thumbnail-button')).length,
    shorts: shorts.length,
    shortsCovered: shorts.filter(s => s.querySelector('.w2g-thumbnail-button')).length,
    inPlayer: document.querySelectorAll('#movie_player .w2g-thumbnail-button, .html5-video-player .w2g-thumbnail-button').length,
    playerBtnAfterVolume: !!vol && vol.nextElementSibling?.classList.contains('w2g-button'),
    blocked: /consent\.|\/sorry\//.test(location.href) || /not a bot|unusual traffic/i.test(document.body?.innerText || ''),
    anyVideoLink: !!document.querySelector('a[href*="/watch?v="]'),
    firstWatchHref: document.querySelector('a[href^="/watch?v="]')?.getAttribute('href'),
  };
};

const rows = [];
let inconclusive = '';
const check = (page, name, ok, detail) => rows.push({ page, check: name, result: ok ? 'PASS' : 'FAIL', detail });

const dir = mkdtempSync(join(tmpdir(), 'y2w-smoke-'));
let ctx;
try {
  ctx = await chromium.launchPersistentContext(dir, {
    channel: 'chromium',
    headless: true,
    args: [`--disable-extensions-except=${repo}`, `--load-extension=${repo}`],
  });

  let url = 'https://www.youtube.com/results?search_query=lofi+music';
  for (const p of ['search', 'watch']) {
    const page = await ctx.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    try {
      await page.waitForSelector('.w2g-thumbnail-button', { timeout: 15000 });
      if (p === 'watch') await page.waitForSelector('.ytp-left-controls .w2g-button', { timeout: 15000 });
    } catch { /* reported by the checks below */ }
    await page.waitForTimeout(3000); // let the debounced observer settle
    const m = await page.evaluate(measure, [EXCLUDE, MEDIA]);
    await page.close();

    if (m.blocked || !m.anyVideoLink) {
      inconclusive = `${p}: consent page, bot wall or no results`;
      break;
    }
    check(p, '>=1 .w2g-thumbnail-button', m.buttons >= 1, `buttons=${m.buttons}`);
    check(p, 'coverage >=95%', m.hosts > 0 && m.covered / m.hosts >= 0.95, `${m.covered}/${m.hosts} hosts have a button`);
    if (p === 'search') {
      if (m.shorts) check(p, 'shorts shelf covered', m.shortsCovered === m.shorts, `${m.shortsCovered}/${m.shorts} ytm-shorts-lockup-view-model`);
      else rows.push({ page: p, check: 'shorts shelf covered', result: 'SKIP', detail: 'SKIP (no shorts shelf)' });
      if (!m.firstWatchHref) { inconclusive = 'search: no /watch?v= thumbnail to open'; break; }
      url = new URL(m.firstWatchHref, 'https://www.youtube.com').searchParams.get('v');
      url = `https://www.youtube.com/watch?v=${url}`;
    }
    check(p, 'no button inside player', m.inPlayer === 0, `inPlayer=${m.inPlayer}`);
    if (p === 'watch') check(p, '.w2g-button right after volume control', m.playerBtnAfterVolume, `playerBtnAfterVolume=${m.playerBtnAfterVolume}`);
  }
} finally {
  await ctx?.close();
  rmSync(dir, { recursive: true, force: true });
}

console.table(rows);
const failed = rows.filter(r => r.result === 'FAIL');
if (failed.length) {
  console.error(`FAIL: ${failed.length} check(s): ` + failed.map(f => `${f.page}/${f.check} (${f.detail})`).join('; '));
  process.exit(1);
}
if (inconclusive) {
  console.error(`INCONCLUSIVE (${inconclusive})`);
  process.exit(2);
}
console.log('All smoke checks passed.');

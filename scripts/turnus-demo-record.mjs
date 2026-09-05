/**
 * Records a Tidum Turnus demo: /turnus → Oppsett → Planlegging → Generer → XAI,
 * with a visible cursor overlay (teal dot, red on click). Requires a dev server
 * on PLAYWRIGHT_BASE_URL (default http://127.0.0.1:5173) with dev-auth + seeded
 * turnus demo (scripts/seed-turnus-demo.ts). Outputs webm, converts to mp4.
 */
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const BASE = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:5173';
const OUT = process.env.TURNUS_VIDEO_DIR || '/tmp/turnus-demo';
fs.mkdirSync(OUT, { recursive: true });

const CURSOR = `
(() => {
  const d = document.createElement('div');
  d.style.cssText = 'position:fixed;z-index:2147483647;width:20px;height:20px;border-radius:50%;background:rgba(20,184,166,.85);border:2px solid #fff;box-shadow:0 0 8px rgba(0,0,0,.4);pointer-events:none;transform:translate(-50%,-50%);transition:background .1s,width .1s,height .1s;left:-100px;top:-100px';
  const add = () => document.body && document.body.appendChild(d);
  if (document.body) add(); else addEventListener('DOMContentLoaded', add);
  addEventListener('mousemove', e => { d.style.left = e.clientX+'px'; d.style.top = e.clientY+'px'; }, true);
  addEventListener('mousedown', () => { d.style.background='rgba(239,68,68,.9)'; d.style.width='26px'; d.style.height='26px'; }, true);
  addEventListener('mouseup', () => { d.style.background='rgba(20,184,166,.85)'; d.style.width='20px'; d.style.height='20px'; }, true);
  // keep toast overlays from eating clicks during the recording
  const s = document.createElement('style');
  s.textContent = '[data-radix-toast-viewport]{pointer-events:none!important}';
  (document.head||document.documentElement).appendChild(s);
})();`;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function moveTo(page, sel) {
  const el = page.locator(sel).first();
  await el.waitFor({ state: 'visible', timeout: 15000 });
  const b = await el.boundingBox();
  if (b) await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 25 });
  return el;
}
async function clickAt(page, sel) {
  const el = await moveTo(page, sel);
  await sleep(400);
  await el.click();
  await sleep(700);
}

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 800 },
  recordVideo: { dir: OUT, size: { width: 1280, height: 800 } },
});
await ctx.addInitScript(CURSOR);
const page = await ctx.newPage();

await page.goto(`${BASE}/turnus`, { waitUntil: 'networkidle' });
await page.locator('[data-testid="turnus-page"]').waitFor({ timeout: 20000 });
// dismiss the site cookie/consent banner up front so it stays out of the shot
try {
  const consent = page.getByRole('button', { name: /kun nødvendige/i }).first();
  await consent.waitFor({ state: 'visible', timeout: 4000 });
  await consent.click();
  await sleep(500);
} catch { /* banner not shown */ }
await sleep(1000);

await clickAt(page, '[data-testid="tab-oppsett"]');
await sleep(1500); // let the reviewer see avdeling/ansatte/vaktkoder

await clickAt(page, '[data-testid="tab-planlegging"]');
await sleep(800);
await clickAt(page, '[data-testid^="plan-"]');   // select the seeded plan
await page.locator('[data-testid="readiness"]').waitFor({ timeout: 10000 });
await sleep(1200);

await clickAt(page, '[data-testid="btn-generer"]');
// wait for the XAI panel (generation + forklaring round-trip through the solver)
await page.locator('[data-testid="xai"]').waitFor({ timeout: 30000 });
await sleep(2500); // hold on the explanation

// ── A5: override grid (drag a shift → live AML consequence-preview) ──────────
const grid = page.locator('[data-testid="overstyring"]');
try {
  await grid.waitFor({ state: 'visible', timeout: 15000 });
  await grid.scrollIntoViewIfNeeded();
  await sleep(2200); // show the grid + per-employee OK/brudd badges (konsekvens ran)

  // Pick a source shift and an empty cell in the same day-column of another row.
  const picked = await page.evaluate(() => {
    const span = document.querySelector('[data-testid="overstyring"] span[data-testid^="vakt-"]');
    if (!span) return null;
    const td = span.closest('td');
    const col = td.cellIndex;
    const srcRow = td.closest('tr');
    for (const r of document.querySelectorAll('[data-testid="overstyring"] tbody tr')) {
      if (r === srcRow) continue;
      const cell = r.cells[col];
      if (cell && !cell.querySelector('span[data-testid^="vakt-"]')) {
        cell.setAttribute('data-testid', 'dnd-target');
        return { src: span.getAttribute('data-testid') };
      }
    }
    return null;
  });

  if (picked) {
    await moveTo(page, `[data-testid="${picked.src}"]`);
    await sleep(500);
    await page.locator(`[data-testid="${picked.src}"]`)
      .dragTo(page.locator('[data-testid="dnd-target"]'));
    await sleep(2800); // show the reassigned shift + updated consequence badges
  }
} catch (e) {
  console.log('override-grid demo hoppet over:', e.message);
}
await sleep(1200);

await ctx.close();  // finalizes the webm
await browser.close();

const webm = fs.readdirSync(OUT).find(f => f.endsWith('.webm'));
if (!webm) { console.error('no webm produced'); process.exit(1); }
const src = `${OUT}/${webm}`;
const mp4 = `${OUT}/turnus-demo.mp4`;
try {
  execFileSync('ffmpeg', ['-y', '-i', src, '-vf', 'scale=1280:-2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', mp4], { stdio: 'ignore' });
  console.log('MP4:', mp4);
} catch (e) {
  console.log('WEBM (ffmpeg unavailable):', src);
}

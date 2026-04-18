/**
 * scripts/capture-guide-screenshots.ts
 *
 * Captures key UI screens against a running dev server and writes them to
 * client/public/guide-screenshots/<name>.png. The /guide page picks them
 * up automatically; if a file is missing, it falls back to an illustrated
 * placeholder so the guide always renders cleanly.
 *
 * Usage:
 *   1) Start dev server in another terminal: npm run dev
 *      (NODE_ENV=development auto-injects super_admin via dev bypass)
 *   2) Run: npx tsx scripts/capture-guide-screenshots.ts
 *      Optional flags:
 *        --base   Base URL (default http://localhost:5173)
 *        --only   Comma-separated screen names to capture
 *
 * Note: requires `playwright` to be installed:
 *   npm install --save-dev playwright
 *   npx playwright install chromium
 */
import { chromium, type Page } from "playwright";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

interface ScreenSpec {
  name: string;       // saved as <name>.png
  path: string;       // app route to visit
  waitForSelector?: string; // wait for this before snapping
  setup?: (page: Page) => Promise<void>; // extra interactions before snap
  clip?: { x: number; y: number; width: number; height: number };
}

const SCREENS: ScreenSpec[] = [
  { name: "dashboard",            path: "/dashboard",          waitForSelector: "[data-testid='text-page-title'], h1" },
  { name: "tiltaksleder-dashboard", path: "/tiltaksleder",     waitForSelector: "h1" },
  { name: "ny-sak",               path: "/cases?new=1",        waitForSelector: "h1" },
  { name: "rapport-skrive",       path: "/rapporter/ny",       waitForSelector: "h1" },
  { name: "godkjenning",          path: "/rapporter/godkjenning", waitForSelector: "h1" },
  { name: "institusjoner",        path: "/institusjoner",      waitForSelector: "h1" },
  { name: "invitasjoner",         path: "/invites",            waitForSelector: "h1" },
  { name: "timeforing",           path: "/time",               waitForSelector: "h1" },
  { name: "timelister",           path: "/timesheets",         waitForSelector: "h1" },
  { name: "overtid",              path: "/overtime",           waitForSelector: "h1" },
  { name: "avvik",                path: "/avvik",              waitForSelector: "h1" },
  { name: "vendors",              path: "/vendors",            waitForSelector: "[data-testid='text-page-title']" },
];

function parseArgs() {
  const args = process.argv.slice(2);
  const out: { base: string; only?: string[] } = { base: "http://localhost:5173" };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--base" && args[i + 1]) out.base = args[++i];
    else if (args[i] === "--only" && args[i + 1]) out.only = args[++i].split(",").map((s) => s.trim());
  }
  return out;
}

async function main() {
  const { base, only } = parseArgs();
  const outDir = resolve(process.cwd(), "client/public/guide-screenshots");
  await mkdir(outDir, { recursive: true });

  const targets = only ? SCREENS.filter((s) => only.includes(s.name)) : SCREENS;
  if (targets.length === 0) {
    console.error("No matching screens. Available:", SCREENS.map((s) => s.name).join(", "));
    process.exit(2);
  }

  console.log(`Capturing ${targets.length} screens against ${base} → ${outDir}`);

  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    colorScheme: "light",
  });
  const page = await ctx.newPage();

  // Hide scroll bars + mask volatile UI (notification badges, live counters)
  await page.addInitScript(() => {
    const style = document.createElement("style");
    style.textContent = `
      ::-webkit-scrollbar { display: none; }
      [data-testid='header-activity-bell'] [class*='badge'] { visibility: hidden !important; }
    `;
    document.head.appendChild(style);
  });

  let failed = 0;
  for (const screen of targets) {
    const url = base.replace(/\/+$/, "") + screen.path;
    try {
      await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 });
      if (screen.waitForSelector) {
        await page.waitForSelector(screen.waitForSelector, { timeout: 10_000 });
      }
      // Settle: give animations a beat
      await page.waitForTimeout(600);
      if (screen.setup) await screen.setup(page);

      const out = resolve(outDir, `${screen.name}.png`);
      await page.screenshot({
        path: out,
        fullPage: false,
        clip: screen.clip,
        animations: "disabled",
      });
      console.log(`  ✓ ${screen.name}.png`);
    } catch (err) {
      failed += 1;
      console.error(`  ✗ ${screen.name} — ${(err as Error).message.split("\n")[0]}`);
    }
  }

  await browser.close();
  if (failed > 0) {
    console.error(`\n${failed}/${targets.length} screens failed. Guide page will fall back to illustrations for missing ones.`);
    process.exit(1);
  }
  console.log(`\nDone. ${targets.length} screens captured.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

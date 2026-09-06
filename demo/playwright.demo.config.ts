/**
 * demo/playwright.demo.config.ts
 *
 * Capture configuration for the Tidum Turnus demo footage
 * (docs/anbud/2026-113925-demo-manus.md).
 *
 * Deliberately a separate config, not a project inside playwright.config.ts:
 * these specs are camera operators, not tests. They record whatever the app
 * does. Mixing them into the suite would mean a slow, video-writing capture run
 * on every `npm run test:e2e`, and a red build whenever the footage needs
 * reshooting for a reason that has nothing to do with correctness.
 *
 * Run:
 *   npm run seed:turnus-demo            # deterministic fixture, TURNUS_DEMO_USER=1
 *   npm run demo:capture                # main version, 1920x1080
 *   npm run demo:reels                  # three reels, 1080x1920
 *
 * Output lands in demo/opptak/ as .webm. Transcode before editing.
 */
import { defineConfig, devices } from "@playwright/test";

const port = process.env.PLAYWRIGHT_PORT || "5173";
const baseURL = process.env.PLAYWRIGHT_BASE_URL || `http://127.0.0.1:${port}`;

/** 9:16 when the reels spec runs, 16:9 otherwise. One config, two framings. */
const reels = process.env.DEMO_REELS === "1";
const size = reels
  ? { width: 1080, height: 1920 }
  : { width: 1920, height: 1080 };

export default defineConfig({
  testDir: ".",
  testMatch: reels ? "turnus-reels.spec.ts" : "turnus-demo.spec.ts",
  // A capture is one continuous take. Retrying would silently record a second,
  // different run over the first.
  retries: 0,
  workers: 1,
  // Generation deliberately runs a full solver budget; see the K-08 beat.
  timeout: 300_000,
  expect: { timeout: 30_000 },
  // Separate directories per mode. Playwright wipes outputDir at the start of
  // every run, so a shared folder means the reels delete the main capture —
  // which is exactly what happened the first time both were shot.
  outputDir: reels ? "opptak/reels" : "opptak/hovedversjon",
  use: {
    baseURL,
    viewport: size,
    video: { mode: "on", size },
    // Motion the eye can follow. Playwright's default speed is unreadable on
    // video — the pointer teleports and fields fill instantly.
    launchOptions: { slowMo: 140 },
    trace: "off",
    screenshot: "off",
  },
  webServer: {
    command: `PORT=${port} npm run dev`,
    url: baseURL,
    reuseExistingServer: true,
    timeout: 180_000,
  },
  projects: [{ name: "opptak", use: { ...devices["Desktop Chrome"], viewport: size } }],
  reporter: [["list"]],
});

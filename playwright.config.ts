import { defineConfig, devices } from "@playwright/test";

const port = process.env.PLAYWRIGHT_PORT || "5173";
const baseURL = process.env.PLAYWRIGHT_BASE_URL || `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "tests",
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    // Settle the analytics consent banner before any test runs.
    //
    // The banner is a fixed overlay that sits over the middle of the viewport
    // until a choice is stored, and it silently breaks tests by intercepting
    // clicks — tideman-import-feedback failed on a 60 s click timeout for
    // exactly this reason, with the banner present in the DOM snapshot.
    //
    // Set here rather than per test so future specs inherit it. "denied" is the
    // right value: a test run should not be emitting analytics either.
    storageState: {
      cookies: [],
      origins: [{
        origin: baseURL,
        localStorage: [{ name: "tidum-analytics-consent", value: "denied" }],
      }],
    },
  },
  webServer: {
    command: `PORT=${port} npm run dev`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    {
      name: "desktop-chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 720 },
      },
    },
    {
      name: "mobile-iphone-13",
      use: {
        ...devices["iPhone 13"],
      },
    },
  ],
  reporter: [["list"], ["html", { open: "never" }]],
});

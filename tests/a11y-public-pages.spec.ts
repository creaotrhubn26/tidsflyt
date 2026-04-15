/**
 * Accessibility smoke-test for public pages.
 *
 * Runs axe-core against the pages that are public-facing (no login needed).
 * Fails on any "critical" or "serious" violations — warnings are logged.
 *
 * Run: npx playwright test tests/a11y-public-pages.spec.ts
 *
 * Requires: @axe-core/playwright (dev dep)
 *   npm i -D @axe-core/playwright
 */

import { test, expect, type Page } from "@playwright/test";
// @ts-expect-error — optional dev dep; script skips if not installed
import AxeBuilder from "@axe-core/playwright";

const PUBLIC_PAGES = [
  { name: "Landing", url: "/" },
  { name: "Blog list", url: "/blog" },
  { name: "Personvern", url: "/personvern" },
  { name: "Tilgjengelighet", url: "/tilgjengelighet" },
  { name: "Vilkår", url: "/vilkar" },
  { name: "Kontakt", url: "/kontakt" },
];

async function runAxe(page: Page) {
  return await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"])
    .analyze();
}

for (const { name, url } of PUBLIC_PAGES) {
  test(`${name} (${url}) — WCAG 2.1 AA`, async ({ page }) => {
    await page.goto(url);
    await page.waitForLoadState("networkidle");

    const results = await runAxe(page);

    const critical = results.violations.filter((v: any) => v.impact === "critical");
    const serious = results.violations.filter((v: any) => v.impact === "serious");
    const moderate = results.violations.filter((v: any) => v.impact === "moderate");

    // Summarise in logs
    console.log(`\n[a11y] ${name}: ${results.violations.length} violations`);
    for (const v of results.violations) {
      console.log(`  [${v.impact}] ${v.id}: ${v.help} (${v.nodes.length} nodes)`);
    }

    expect.soft(moderate, `${moderate.length} moderate issue(s) — review`).toHaveLength(0);
    expect(critical, `${critical.length} critical issue(s)`).toHaveLength(0);
    expect(serious, `${serious.length} serious issue(s)`).toHaveLength(0);
  });
}

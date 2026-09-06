/**
 * demo/turnus-reels.spec.ts
 *
 * Camera operator for the three vertical reels, 1080 × 1920.
 *
 * A reel is not the main video cropped. The frame is different, the pacing is
 * different, and it has to land without sound in the first three seconds — so
 * each of these is one claim, shot on its own. The captions named in the
 * manuscript are burned in during editing, not here; this produces the footage
 * they sit on.
 *
 * Run: DEMO_REELS=1 npx playwright test --config demo/playwright.demo.config.ts
 *
 * Same prerequisites as turnus-demo.spec.ts: seeded fixture, dev server with
 * auth bypass, CP-SAT sidecar available.
 */
import { test, expect, type Page } from "@playwright/test";

const hold = (page: Page, ms: number) => page.waitForTimeout(ms);

/**
 * The grid holds 25 lines across 42 days. Scaled into a 9:16 frame that is
 * unreadable mush, so zoom until three or four lines fill the width. Without
 * this every reel is a grey blur.
 */
async function zoomForVertical(page: Page, factor: number) {
  await page.evaluate((f) => {
    const el = document.querySelector<HTMLElement>('[data-testid="overstyring"]');
    if (!el) return;
    el.style.transformOrigin = "top left";
    el.style.transform = `scale(${f})`;
  }, factor);
}

/**
 * Settle the analytics consent prompt before anything is recorded.
 *
 * Without this the banner sits over the middle of every single frame — it
 * covered the XAI panel in the first complete take. "denied" is the right value
 * to store: the capture should not be emitting analytics either.
 */
async function ryddSkjerm(page: Page) {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem("tidum-analytics-consent", "denied");
    } catch {
      /* private mode — the banner will show, and the take needs redoing */
    }
  });
}

test.describe.configure({ mode: "serial" });

test.beforeEach(async ({ page }) => {
  await ryddSkjerm(page);
  await page.goto("/turnus");
  await expect(page.getByTestId("turnus-page")).toBeVisible();
  await page.getByTestId("tab-planlegging").click();
  // The generate button and the grid only exist once a plan is selected.
  const plan = page.locator("[data-testid^='plan-']").filter({ hasText: "Grunnturnus vår 2026" }).first();
  if (await plan.isVisible().catch(() => false)) await plan.click();
});

test("reel 1 — tjuefem linjer", async ({ page }) => {
  const generer = page.getByTestId("btn-generer");
  await generer.scrollIntoViewIfNeeded();
  // Open on the empty grid: the first frame has to carry the whole clip, so it
  // starts on the problem, not on a logo.
  await hold(page, 2500);

  await generer.click();
  await expect(page.getByTestId("xai")).toBeVisible({ timeout: 240_000 });

  // The filled grid is the payoff. Zoom in so the shift codes are legible.
  const grid = page.getByTestId("overstyring");
  await grid.scrollIntoViewIfNeeded();
  await zoomForVertical(page, 1.8);
  await hold(page, 4000);
});

test("reel 2 — regelen som gjelder én", async ({ page }) => {
  await page.getByTestId("tab-regler").click();
  await hold(page, 2000);

  // Three levels in sequence: statute, local agreement, then the exemption that
  // applies to exactly one person. The escalation is the story.
  // Walk the rule list itself. Page-level text matches would hit the hidden
  // <option>s in the form's selects instead of the rendered rules.
  const regler = page.locator("li").filter({ hasText: /aml_|max_/ });
  const antall = await regler.count();
  for (let i = 0; i < Math.min(antall, 3); i++) {
    await regler.nth(i).scrollIntoViewIfNeeded();
    await hold(page, 2500);
  }

  // Scope to the list item, not the page: the name is also a hidden <option>
  // in the rule form's employee picker.
  const person = page.locator("li").filter({ hasText: "Kun Live Osland" }).first();
  await expect(person).toBeVisible();
  await person.scrollIntoViewIfNeeded();
  await hold(page, 4000);
});

test("reel 3 — uten mus", async ({ page }) => {
  const grid = page.getByTestId("overstyring");
  if (!(await grid.isVisible().catch(() => false))) {
    await page.getByTestId("btn-generer").click();
    await expect(page.getByTestId("xai")).toBeVisible({ timeout: 240_000 });
  }
  await grid.scrollIntoViewIfNeeded();
  await zoomForVertical(page, 1.6);

  // Park the pointer off-frame. A visible cursor kills this clip: the claim is
  // that nothing here needs a mouse.
  await page.mouse.move(0, 0);
  await hold(page, 2000);

  await page.keyboard.press("Tab");
  await hold(page, 800);
  for (const key of ["ArrowRight", "ArrowDown", "ArrowRight"]) {
    await page.keyboard.press(key);
    await hold(page, 800);
  }
  await page.keyboard.press("Enter");
  await hold(page, 1000);
  await page.keyboard.press("ArrowDown");
  await hold(page, 800);
  await page.keyboard.press("Enter");
  await hold(page, 3500);
});

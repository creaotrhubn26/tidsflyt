/**
 * demo/turnus-demo.spec.ts
 *
 * Camera operator for the Tidum Turnus demo, 16:9. Each test below is one beat
 * in docs/anbud/2026-113925-demo-manus.md, numbered to match, so the shot list
 * and the capture cannot drift apart.
 *
 * This records the real product. It mocks nothing — that is the point: the
 * manuscript's binding rule is that every frame showing Tidum Turnus is genuine
 * footage, because a generated interface in a public tender becomes a
 * credibility problem the moment the evaluator sees the real one.
 *
 * Requires, in order:
 *   1. a database seeded by server/seed/turnus-demo.ts with TURNUS_DEMO_USER=1
 *   2. the dev server running with ALLOW_DEV_AUTH_BYPASS=true
 *   3. the Python CP-SAT sidecar importable (turnus-solver/)
 *
 * Beat 1 and beat 10 are not here — they are the generated clips, and no
 * product surface appears in them.
 */
import { test, expect, type Page } from "@playwright/test";

/** The fixture's own values. Assertions use them so a reseed that changes the
 *  data fails loudly instead of quietly recording the wrong thing. */
const FIXTURE = {
  org: "Solvang bo- og omsorgssenter",
  avdeling: "Avdeling Nord",
  plan: "Grunnturnus vår 2026",
  ansatte: 28,
  linjer: 25,
  dispensasjonAnsatt: "Live Osland",
  helgefri: "2026-03-21",
} as const;

/** Hold a frame so the viewer can read it. Playwright is far faster than an eye. */
const hold = (page: Page, ms: number) => page.waitForTimeout(ms);

/**
 * Open the planning tab and select the fixture's plan.
 *
 * Every beat gets a fresh page, and the generate button, the grid and the XAI
 * panel all render only once a plan is chosen — the first take of beat 5 failed
 * on exactly this. Clicking the plan by name rather than by id keeps the spec
 * working after a reseed hands out new ids.
 */
async function velgPlan(page: Page) {
  await page.getByTestId("tab-planlegging").click();
  const plan = page.locator("[data-testid^='plan-']").filter({ hasText: FIXTURE.plan }).first();
  await expect(plan).toBeVisible();
  await plan.click();
  await expect(page.getByTestId("readiness")).toBeVisible();
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
});

test("beat 2 — oppsett", async ({ page }) => {
  await page.getByTestId("tab-oppsett").click();
  await hold(page, 1200);

  // The employee list is the establishing shot: this is a real ward, not three
  // rows of Lorem.
  const ansatte = page.getByText(FIXTURE.dispensasjonAnsatt).first();
  await expect(ansatte).toBeVisible();
  await ansatte.scrollIntoViewIfNeeded();
  await hold(page, 2500);

  // Slow scroll through the staffing demand so the weekday/weekend difference
  // is legible rather than a blur.
  for (let i = 0; i < 6; i++) {
    await page.mouse.wheel(0, 220);
    await hold(page, 420);
  }
  await hold(page, 1500);
});

test("beat 3 — regler og avtaler", async ({ page }) => {
  await page.getByTestId("tab-regler").click();
  await hold(page, 1500);

  // The whole beat rests on one thing being visible: a rule scoped to a single
  // named person, sitting next to the org-wide ones.
  //
  // Scope to the rule list. The employee's name also appears in the "who does
  // this apply to" <select>, and an unscoped getByText matches that hidden
  // <option> first — which is how the first take of this beat failed.
  // Every assertion is scoped INSIDE the list item. Both "Kun Live Osland" and
  // "Dispensasjon" also exist as hidden <option>s in the rule form's selects, so
  // any page-level getByText matches those first — that is how the first two
  // takes of this beat failed.
  const dispensasjon = page
    .locator("li")
    .filter({ hasText: `Kun ${FIXTURE.dispensasjonAnsatt}` })
    .first();
  await expect(dispensasjon).toBeVisible();
  await dispensasjon.scrollIntoViewIfNeeded();
  await expect(dispensasjon.getByText("Dispensasjon")).toBeVisible();
  await hold(page, 4000);
});

test("beat 4 — ansattes ønsker", async ({ page }) => {
  await velgPlan(page);
  await hold(page, 1000);

  const onskeType = page.getByTestId("sel-onske-type");
  if (await onskeType.isVisible().catch(() => false)) {
    await onskeType.scrollIntoViewIfNeeded();
    await hold(page, 1200);
    // Show the three priority levels, which is what makes wishes more than a
    // comment field.
    await page.getByTestId("sel-onske-prioritet").click().catch(() => {});
    await hold(page, 1800);
    await page.keyboard.press("Escape").catch(() => {});
  }
  await hold(page, 2000);
});

test("beat 5 — genereringen", async ({ page }) => {
  await velgPlan(page);
  await hold(page, 800);

  const generer = page.getByTestId("btn-generer");
  await generer.scrollIntoViewIfNeeded();
  await expect(generer).toBeEnabled();
  await hold(page, 1500);

  await generer.click();

  // Do not cut the wait. The manuscript is explicit: the search time is real
  // work — the objective climbs from 380 at a 1s budget to 1440 at 30s — and a
  // trimmed take would show a measurably worse roster than the product makes.
  await expect(page.getByTestId("xai")).toBeVisible({ timeout: 240_000 });
  await hold(page, 3000);
});

test("beat 6 — Tidemann forklarer", async ({ page }) => {
  await velgPlan(page);
  await page.getByTestId("btn-generer").click();
  const xai = page.getByTestId("xai");
  await expect(xai).toBeVisible({ timeout: 240_000 });
  await xai.scrollIntoViewIfNeeded();
  await hold(page, 1200);

  // The attributed byline, then the honest number: first roster in ~320 ms,
  // with the improvement count showing the rest was work and not a hang.
  await expect(xai.getByText(/Tidemann/)).toBeVisible();
  await expect(xai.getByText(/generert på \d+ ms/)).toBeVisible();
  await hold(page, 4000);

  // The fixture is calibrated so exactly two wishes break: 18 of 28 asked for
  // 21 March off and 12 must work. Without this the beat has nothing to explain.
  await expect(xai.getByText(/kunne ikke oppfylles/).first()).toBeVisible();
  await hold(page, 4000);
});

test("beat 7 — overstyring og konsekvens", async ({ page }) => {
  await velgPlan(page);
  await page.getByTestId("btn-generer").click();
  const grid = page.getByTestId("overstyring");
  await expect(grid).toBeVisible({ timeout: 240_000 });
  await grid.scrollIntoViewIfNeeded();
  await hold(page, 2000);

  // Drag one shift onto another employee and let the consequence land. Holding
  // afterwards is not padding: the warning is the beat.
  const chips = grid.locator("[draggable='true']");
  if ((await chips.count()) >= 2) {
    await chips.nth(0).hover();
    await hold(page, 800);
    await chips.nth(0).dragTo(chips.nth(1));
    await hold(page, 4000);
  }
});

test("beat 8 — publisering og varsling", async ({ page }) => {
  // The publish control lives inside the override grid, which only renders once
  // a generation has produced shifts. The first take of this beat skipped every
  // conditional and recorded 1.5 seconds of nothing.
  await velgPlan(page);
  await page.getByTestId("btn-generer").click();
  await expect(page.getByTestId("overstyring")).toBeVisible({ timeout: 240_000 });

  const publiser = page.getByTestId("btn-publiser");
  await publiser.scrollIntoViewIfNeeded();
  await hold(page, 1500);
  await publiser.click();
  await hold(page, 4000);

  // Close without confirming. The capture must never actually notify anyone —
  // btn-publiser-bekreft is deliberately not clicked.
  await page.keyboard.press("Escape");
  await hold(page, 1200);

  // Reminder settings live on the Regler tab.
  await page.getByTestId("tab-regler").click();
  const varselMin = page.getByTestId("sel-varsel-min");
  await expect(varselMin).toBeVisible();
  await varselMin.scrollIntoViewIfNeeded();
  await hold(page, 3500);
});

test("beat 9 — universell utforming", async ({ page }) => {
  await velgPlan(page);
  await page.getByTestId("btn-generer").click();
  const grid = page.getByTestId("overstyring");
  await expect(grid).toBeVisible({ timeout: 240_000 });
  await grid.scrollIntoViewIfNeeded();
  await hold(page, 1500);

  // The strongest beat in the video, and the one that must not be faked: the
  // grid driven entirely from the keyboard, with the focus ring visible.
  await page.keyboard.press("Tab");
  await hold(page, 700);
  for (const key of ["ArrowRight", "ArrowRight", "ArrowDown", "ArrowRight", "ArrowDown"]) {
    await page.keyboard.press(key);
    await hold(page, 650);
  }
  await page.keyboard.press("Enter");
  await hold(page, 1200);
  for (const key of ["ArrowDown", "ArrowDown"]) {
    await page.keyboard.press(key);
    await hold(page, 650);
  }
  await page.keyboard.press("Enter");
  await hold(page, 3500);
});

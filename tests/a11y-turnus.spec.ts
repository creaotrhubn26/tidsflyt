/**
 * Accessibility test for the Tidum Turnus planner (/turnus) — K-19 (WCAG).
 *
 * The public-page suite (a11y-public-pages.spec.ts) cannot reach /turnus: it
 * sits behind AuthGuard. Here the auth user and the turnus API are mocked, so
 * the run is deterministic and needs neither a seeded database nor the Python
 * CP-SAT sidecar. That matters because the override grid — the most complex
 * widget in the product, and the one a screen-reader user must operate — only
 * renders after a generation has produced shifts.
 *
 * Fails on "critical" and "serious" violations; lesser ones are logged.
 *
 * Run: npx playwright test tests/a11y-turnus.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";
// @ts-expect-error — optional dev dep; the test skips when it is absent
import AxeBuilder from "@axe-core/playwright";

const LEDER = {
  id: "turnus-leder-1",
  email: "leder@demo.kommune.no",
  name: "Lise Leder",
  role: "tiltaksleder",
  approved: true,
};

const ANSATTE = [
  { id: 1, navn: "Ansatt 1", stillingsprosent: 100, user_email: "a1@demo.no" },
  { id: 2, navn: "Ansatt 2", stillingsprosent: 80, user_email: null },
];
const VAKTKODER = [
  { id: 1, kode: "D", start_tid: "08:00:00", slutt_tid: "16:00:00" },
  { id: 2, kode: "N", start_tid: "22:00:00", slutt_tid: "06:00:00" },
];
const PLANER = [{ id: 7, navn: "Grunnturnus uke 2", rotasjon_uker: 1, avdeling_id: 3 }];

/** Generated shifts covering a weekday and a weekend day, for both employees. */
const VAKTER = [
  { id: 101, ansattId: 1, ansattNavn: "Ansatt 1", dato: "2026-01-05", vaktkodeId: 1, kode: "D", startTid: "08:00", sluttTid: "16:00" },
  { id: 102, ansattId: 2, ansattNavn: "Ansatt 2", dato: "2026-01-05", vaktkodeId: 2, kode: "N", startTid: "22:00", sluttTid: "06:00" },
  { id: 103, ansattId: 1, ansattNavn: "Ansatt 1", dato: "2026-01-10", vaktkodeId: 1, kode: "D", startTid: "08:00", sluttTid: "16:00" },
];

async function mockTurnusApi(page: Page) {
  // Playwright gives precedence to the most recently registered route, so the
  // catch-all must go first or it would swallow every specific handler below.
  await page.route(/\/api\//, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "{}" }));

  await page.route("**/api/auth/user", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(LEDER) }));

  await page.route(/\/api\/turnus\//, async (route) => {
    const path = new URL(route.request().url()).pathname;
    const json = (body: unknown) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });

    if (path.endsWith("/ansatte")) return json(ANSATTE);
    if (path.endsWith("/vaktkoder")) return json(VAKTKODER);
    if (path.endsWith("/avdelinger")) return json([{ id: 3, navn: "Sykehjem avd. A" }]);
    if (path.endsWith("/planer")) return json(PLANER);
    if (path.endsWith("/readiness")) return json({ ready: true, mangler: [] });
    if (path.endsWith("/regler")) return json([]);
    if (path.endsWith("/onsker")) return json([]);
    if (path.endsWith("/prioritering")) return json({ vekt_onsker: 8, vekt_rettferdighet: 7, vekt_helgefrekvens: 6, vekt_kontinuitet: 5, vekt_kostnad: 4 });
    if (path.endsWith("/varsel-innstillinger")) return json({ paaminnelse_min: 60, epost: false, app: true, sms: false, aktiv: true });
    if (path.endsWith("/generer")) return json({ generId: 55, status: "fullfort", solverStatus: "optimal", vakterSkrevet: 3, avvik: 0, solveTidMs: 42, feilmelding: null });
    if (path.endsWith("/vakter")) return json(VAKTER);
    if (path.endsWith("/kontekst")) return json({ krav: [{ dato: "2026-01-05", krevd: 2 }], onsker: [] });
    if (path.endsWith("/konsekvens")) return json({ brudd: [], harHardeBrudd: false });
    if (path.endsWith("/forklaring")) {
      return json({
        strukturert: {
          status: "fullfort",
          prioriteringer: [{ dimensjon: "onske", etikett: "ansattes ønsker", vekt: 8 }],
          uoppfylte: [], konflikter: [], sammendrag: "Turnusen ble generert.",
        },
        narrasjon: "Turnusen ble generert.",
      });
    }
    return json([]);
  });
}

/**
 * Scoped to the turnus page itself: the surrounding app shell (toasts, consent
 * banner, nav) is not what this suite is about, and shell-level regressions are
 * already caught by a11y-public-pages.spec.ts.
 */
async function runAxe(page: Page) {
  return await new AxeBuilder({ page })
    .include('[data-testid="turnus-page"]')
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"])
    .analyze();
}

function assertNoSeriousViolations(results: any, label: string) {
  const blocking = results.violations.filter(
    (v: any) => v.impact === "critical" || v.impact === "serious");
  const lesser = results.violations.filter(
    (v: any) => v.impact !== "critical" && v.impact !== "serious");
  if (lesser.length) {
    console.log(`[a11y:${label}] ${lesser.length} mindre avvik:`,
      lesser.map((v: any) => `${v.id} (${v.impact})`).join(", "));
  }
  const detaljer = blocking.map((v: any) =>
    `${v.id} — ${v.help}\n      ${v.nodes.slice(0, 3).map((n: any) => n.target.join(" ")).join("\n      ")}`,
  ).join("\n    ");
  expect(blocking, `${label}:\n    ${detaljer}`).toEqual([]);
}

test.describe("Tilgjengelighet: Tidum Turnus", () => {
  test.beforeEach(async ({ page }) => { await mockTurnusApi(page); });

  test("planleggersiden har ingen alvorlige WCAG-avvik", async ({ page }) => {
    await page.goto("/turnus");
    await page.locator('[data-testid="turnus-page"]').waitFor({ timeout: 20000 });
    assertNoSeriousViolations(await runAxe(page), "planlegging");
  });

  test("overstyringsrutenettet har ingen alvorlige WCAG-avvik", async ({ page }) => {
    await page.goto("/turnus");
    await page.locator('[data-testid="plan-7"]').click();
    await page.locator('[data-testid="btn-generer"]').click();
    await page.locator('[data-testid="overstyring"]').waitFor({ timeout: 20000 });
    assertNoSeriousViolations(await runAxe(page), "overstyringsrutenett");
  });

  test("regler- og ønskerfanen har ingen alvorlige WCAG-avvik", async ({ page }) => {
    await page.goto("/turnus");
    await page.locator('[data-testid="tab-regler"]').click();
    await page.locator('[data-testid="btn-onske"]').waitFor({ timeout: 20000 });
    assertNoSeriousViolations(await runAxe(page), "regler");
  });

  // The roving-tabindex grid is the desktop layout; narrow viewports render
  // per-employee cards instead (checked by the axe test above).
  test("rutenettet kan betjenes med tastatur alene", async ({ page, isMobile }) => {
    test.skip(!!isMobile, "Rutenettet er desktop-layout; mobil viser kortvisning.");
    await page.goto("/turnus");
    await page.locator('[data-testid="plan-7"]').click();
    await page.locator('[data-testid="btn-generer"]').click();
    await page.locator('[data-testid="overstyring"]').waitFor({ timeout: 20000 });

    // The grid exposes a roving-tabindex cell; focus it and move with arrows.
    const forsteCelle = page.locator('[data-testid="celle-1-2026-01-05"]');
    await forsteCelle.focus();
    await expect(forsteCelle).toBeFocused();

    await page.keyboard.press("ArrowRight");
    await expect(forsteCelle).not.toBeFocused();

    // Enter picks up the shift; the aria-live region must announce it so a
    // screen-reader user knows a drag is in progress.
    await forsteCelle.focus();
    await page.keyboard.press("Enter");
    await expect(page.locator('[data-testid="overstyring"] .sr-only')).toContainText(/plukket opp/i);
  });
});

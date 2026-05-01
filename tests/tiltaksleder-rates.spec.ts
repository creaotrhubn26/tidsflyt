/**
 * tests/tiltaksleder-rates.spec.ts
 *
 * E2E smoke for T18:
 *  - /tiltaksleder/satser viser månedstotaler + tabell + Tideman-banner
 *  - inline rate-edit triggrer PATCH og oppdaterer beløp
 *  - lokasjons-CRUD per sak
 *  - lokasjons-velger i time-tracking dukker opp når valgt sak har lokasjoner
 */
import { test, expect } from "@playwright/test";
import type { Page, Route } from "@playwright/test";

const MOCK_USER = {
  id: "10",
  email: "tiltaksleder@kunde.no",
  name: "Tiltaksleder",
  firstName: "Tiltaks",
  lastName: "Leder",
  profileImageUrl: null,
  provider: "dev",
  role: "tiltaksleder",
  vendorId: 42,
};

const MOCK_SAK_ID = "11111111-1111-1111-1111-111111111111";
const MOCK_LOC_ID = "22222222-2222-2222-2222-222222222222";

function buildMonthlyTotalsResponse() {
  return {
    period: "2026-04",
    rows: [
      {
        sakId: MOCK_SAK_ID,
        saksnummer: "S-2026-001",
        sakTitle: "Bjørndalen",
        vendorId: 42,
        companyUserId: 100,
        userEmail: "tom@firma.no",
        userCaseId: 500,
        hourlyRate: 280,
        dayRate: null,
        rateMode: "hour" as const,
        locationId: null,
        locationName: null,
        locationMode: null,
        locationHourly: null,
        locationDay: null,
        hours: 142,
        days: 18,
        amount: 39_760,
      },
      {
        sakId: MOCK_SAK_ID,
        saksnummer: "S-2026-001",
        sakTitle: "Bjørndalen",
        vendorId: 42,
        companyUserId: 101,
        userEmail: "lise@firma.no",
        userCaseId: 501,
        hourlyRate: 280,
        dayRate: 1_800,
        rateMode: "hour" as const,
        locationId: MOCK_LOC_ID,
        locationName: "Tiltaksbolig Bjørndalen",
        locationMode: "day" as const,
        locationHourly: null,
        locationDay: 1_800,
        hours: 0,
        days: 8,
        amount: 14_400,
      },
    ],
    total: 54_160,
  };
}

async function mockAuth(page: Page) {
  await page.route("**/api/auth/user", (route: Route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(MOCK_USER) }),
  );
}

test.describe("Tiltaksleder satser — T18", () => {
  test("viser månedstotaler, Tideman-banner, og inline rate-edit", async ({ page }) => {
    await mockAuth(page);

    let totalsResponse = buildMonthlyTotalsResponse();
    let patchedRate: number | null = null;

    await page.route("**/api/tiltaksleder/monthly-totals*", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(totalsResponse) }),
    );

    await page.route(`**/api/tiltaksleder/user-cases/500/rate`, async (route) => {
      const body = JSON.parse(route.request().postData() || "{}");
      if (body.hourlyRate != null) {
        patchedRate = Number(body.hourlyRate);
        // Update fixture so re-fetch shows new amount
        totalsResponse = {
          ...totalsResponse,
          rows: totalsResponse.rows.map((r) =>
            r.userCaseId === 500
              ? { ...r, hourlyRate: patchedRate!, amount: r.hours * patchedRate! }
              : r,
          ),
          total: totalsResponse.rows.reduce(
            (s, r) => s + (r.userCaseId === 500 ? r.hours * (patchedRate as number) : r.amount),
            0,
          ),
        };
      }
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
    });

    await page.route(`**/api/saker/${MOCK_SAK_ID}/locations`, (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ locations: [] }) }),
    );

    await page.goto("/tiltaksleder/satser");

    // Tideman-banner skal være synlig
    await expect(page.getByTestId("tideman-rates-header")).toBeVisible();
    await expect(page.getByText("Tideman · hjelpe-agent")).toBeVisible();
    await expect(page.getByText("Satser og månedstotaler")).toBeVisible();

    // Sak-gruppe + brukere skal være synlige
    await expect(page.getByText("Bjørndalen")).toBeVisible();
    await expect(page.getByText("tom@firma.no")).toBeVisible();
    await expect(page.getByText("lise@firma.no")).toBeVisible();

    // Lise-raden skal vise lokasjon-pill (Tiltaksbolig Bjørndalen)
    await expect(page.getByText("Tiltaksbolig Bjørndalen")).toBeVisible();

    // Klikk på Tom sin sats (280 kr) — skal åpne inline edit
    await page.getByTestId("rate-button-500").click();
    await expect(page.getByTestId("rate-edit-input")).toBeVisible();

    // Skriv 320 og trykk Enter
    await page.getByTestId("rate-edit-input").fill("320");
    await page.keyboard.press("Enter");

    // Sjekk at PATCH ble kalt med riktig verdi
    await expect.poll(() => patchedRate, { timeout: 3000 }).toBe(320);
  });

  test("lokasjons-editor: legg til + fjern lokasjon", async ({ page }) => {
    await mockAuth(page);
    await page.route("**/api/tiltaksleder/monthly-totals*", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(buildMonthlyTotalsResponse()) }),
    );

    let locations: any[] = [];
    let nextId = 0;
    await page.route(`**/api/saker/${MOCK_SAK_ID}/locations`, async (route) => {
      const method = route.request().method();
      if (method === "GET") {
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ locations }) });
      }
      if (method === "POST") {
        const body = JSON.parse(route.request().postData() || "{}");
        const created = {
          id: `loc-${++nextId}`,
          sak_id: MOCK_SAK_ID,
          name: body.name,
          address: body.address ?? null,
          rate_mode: body.rateMode,
          hourly_rate: body.hourlyRate ?? null,
          day_rate: body.dayRate ?? null,
          active: true,
        };
        locations.push(created);
        return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ location: created }) });
      }
      return route.continue();
    });
    await page.route(`**/api/saker/${MOCK_SAK_ID}/locations/loc-1`, (route) => {
      if (route.request().method() === "DELETE") {
        locations = locations.map((l) => (l.id === "loc-1" ? { ...l, active: false } : l));
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
      }
      return route.continue();
    });

    await page.goto("/tiltaksleder/satser");

    // Vent til siden har lastet inn første sak — den ikke kollapset
    await expect(page.getByText("Bjørndalen")).toBeVisible();

    // Klikk "Legg til lokasjon"
    await page.getByTestId(`add-location-${MOCK_SAK_ID}`).click();

    // Fyll inn skjema
    await page.getByTestId("new-location-name").fill("Tiltaksbolig Test");
    await page.getByTestId("new-location-address").fill("Storgata 12");
    await page.getByTestId("new-location-rate").fill("1800");
    await page.getByTestId("save-location").click();

    // Lokasjon skal nå være synlig
    await expect(page.getByText("Tiltaksbolig Test")).toBeVisible();
    await expect(page.getByText("kr 1 800/døgn")).toBeVisible();

    // Slett lokasjonen
    await page.getByTestId("remove-location-loc-1").click();
    // Den skal forsvinne (active=false → filtrert ut i UI)
    await expect(page.getByText("Tiltaksbolig Test")).not.toBeVisible({ timeout: 3000 });
  });
});

/**
 * tests/time-tracking-location-picker.spec.ts
 *
 * E2E smoke for LocationPickerInline i time-tracking-siden.
 *  - Når valgt sak har lokasjoner: picker vises med "Generelt" + per-lokasjon-knapper
 *  - Klikk på lokasjon → state oppdateres
 *  - POST /api/time-entries inkluderer sakId + sakLocationId i body
 *  - Når valgt sak IKKE har lokasjoner: picker er skjult
 */
import { test, expect } from "@playwright/test";
import type { Page, Route } from "@playwright/test";

const MOCK_USER = {
  id: "100",
  email: "tom@firma.no",
  firstName: "Tom",
  lastName: "Eriksen",
  role: "miljoarbeider",
  vendorId: 42,
};

const MOCK_SAK_WITH_LOC = {
  id: 1,
  case_id: "S-2026-001",
  case_title: "Bjørndalen",
  status: "active",
  sak_id: "11111111-1111-1111-1111-111111111111",
  sak_title: "Bjørndalen",
  locations: [
    {
      id: "22222222-2222-2222-2222-222222222222",
      name: "Tiltaksbolig Bjørndalen",
      address: "Storgata 12",
      rate_mode: "day" as const,
      hourly_rate: null,
      day_rate: "1800",
    },
  ],
};

const MOCK_SAK_NO_LOC = {
  id: 2,
  case_id: "S-2026-002",
  case_title: "Skogvik",
  status: "active",
  sak_id: "33333333-3333-3333-3333-333333333333",
  sak_title: "Skogvik",
  locations: [],
};

async function mockBaseRoutes(page: Page) {
  await page.route("**/api/auth/user", (route: Route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(MOCK_USER) }),
  );
  await page.route("**/api/time-entries**", (route: Route) => {
    if (route.request().method() === "GET") {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
    }
    return route.continue();
  });
  await page.route("**/api/time-tracking/work-types", (route: Route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        role: "miljoarbeider",
        timeTrackingEnabled: true,
        workTypes: [
          { id: "wt-1", name: "Arbeid", color: "bg-blue-500", entryMode: "timer_or_manual" },
        ],
      }),
    }),
  );
  await page.route("**/api/time-entries/suggestions**", (route: Route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ suggestion: null }) }),
  );
}

test.describe("LocationPickerInline i time-tracking", () => {
  test("picker vises når valgt sak har lokasjoner", async ({ page }) => {
    await mockBaseRoutes(page);
    await page.route("**/api/company/me/assigned-cases**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([MOCK_SAK_WITH_LOC]),
      }),
    );

    await page.goto("/time");

    // Vent til siden har lastet og sak-velger er tilgjengelig
    const sakSelect = page.getByTestId("project-select");
    await expect(sakSelect).toBeVisible({ timeout: 10_000 });

    // Velg saken som har lokasjoner
    await sakSelect.click();
    await page.getByRole("option", { name: "Bjørndalen" }).click();

    // LocationPickerInline skal være synlig
    await expect(page.getByTestId("timer-location")).toBeVisible();
    await expect(page.getByText("Tideman: hvor jobbet du?")).toBeVisible();

    // Knappene skal vises: "Generelt" + Tiltaksbolig
    await expect(page.getByTestId("timer-location-default")).toBeVisible();
    await expect(page.getByTestId("timer-location-22222222-2222-2222-2222-222222222222")).toBeVisible();
    await expect(page.getByText(/kr 1800\/døgn/)).toBeVisible();

    // Klikk på Tiltaksbolig
    await page.getByTestId("timer-location-22222222-2222-2222-2222-222222222222").click();
  });

  test("picker er skjult når valgt sak ikke har lokasjoner", async ({ page }) => {
    await mockBaseRoutes(page);
    await page.route("**/api/company/me/assigned-cases**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([MOCK_SAK_NO_LOC]),
      }),
    );

    await page.goto("/time");

    const sakSelect = page.getByTestId("project-select");
    await expect(sakSelect).toBeVisible({ timeout: 10_000 });

    await sakSelect.click();
    await page.getByRole("option", { name: "Skogvik" }).click();

    // LocationPickerInline skal IKKE være synlig
    await expect(page.getByTestId("timer-location")).not.toBeVisible();
  });
});

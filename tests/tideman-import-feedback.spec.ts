/**
 * tests/tideman-import-feedback.spec.ts
 *
 * E2E smoke for Tideman-feedback-card etter bekreftet import.
 *  - Card vises bare når status='confirmed'
 *  - 5-stjerne rating + tekst-felt + "Send til Tideman"-knapp
 *  - Etter sending: takke-card erstatter feedback-form
 *  - POST /api/imports/:id/feedback kalles med rating + comment
 */
import { test, expect } from "@playwright/test";
import type { Page, Route } from "@playwright/test";

const MOCK_USER = {
  id: "1",
  email: "daniel@creatorhubn.com",
  firstName: "Daniel",
  lastName: "Hovedadmin",
  role: "hovedadmin",
  vendorId: 42,
};
const MOCK_IMPORT_ID = "00000000-0000-0000-0000-000000000099";

function buildConfirmedImport() {
  return {
    id: MOCK_IMPORT_ID,
    vendorId: 42,
    source: "planday",
    status: "confirmed",
    fileName: "ansatte.xlsx",
    fileHash: "abc",
    rowCount: 4,
    createdBy: "daniel@creatorhubn.com",
    createdAt: new Date().toISOString(),
    confirmedAt: new Date().toISOString(),
    rolledBackAt: null,
    summaryJsonb: { valid: 3, errors: 0, duplicates: 1, imported: 3, skipped: 1, admin_grants: [] },
  };
}
function buildConfirmedRows() {
  return [
    {
      id: "row-1",
      importId: MOCK_IMPORT_ID,
      rowIndex: 0,
      externalId: "p-1",
      rawJsonb: {},
      parsedJsonb: { email: "tom@firma.no", firstName: "Tom", lastName: "E" },
      status: "imported",
      errorMsg: null,
      roleAssigned: "miljoarbeider",
      targetUserId: 100,
    },
  ];
}

async function mockAuth(page: Page) {
  await page.route("**/api/auth/user", (route: Route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(MOCK_USER) }),
  );
}

test.describe("Tideman feedback etter import-confirm", () => {
  test("feedback-card → send → takke-card", async ({ page }) => {
    await mockAuth(page);

    let receivedFeedback: { rating?: number; comment?: string } | null = null;

    await page.route(`**/api/imports/${MOCK_IMPORT_ID}`, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ import: buildConfirmedImport(), rows: buildConfirmedRows() }),
      }),
    );

    await page.route(`**/api/imports/${MOCK_IMPORT_ID}/feedback`, (route) => {
      const body = JSON.parse(route.request().postData() || "{}");
      receivedFeedback = { rating: body.rating, comment: body.comment };
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
    });

    await page.goto(`/import-employees/${MOCK_IMPORT_ID}/preview`);

    // Tideman feedback-card skal være synlig (importen er bekreftet)
    await expect(page.getByTestId("tideman-feedback-card")).toBeVisible();
    await expect(page.getByText("Hvordan gikk importen?")).toBeVisible();

    // Send-knapp er disabled før vi velger stjerne
    await expect(page.getByTestId("tideman-submit")).toBeDisabled();

    // Klikk 4 stjerner
    await page.getByTestId("tideman-star-4").click();
    await expect(page.getByTestId("tideman-submit")).toBeEnabled();

    // Skriv kommentar
    await page.getByTestId("tideman-comment").fill("Gikk smertefritt — guiden var tydelig.");

    // Send til Tideman
    await page.getByTestId("tideman-submit").click();

    // POST skal være kalt med rating=4
    await expect.poll(() => receivedFeedback?.rating, { timeout: 3000 }).toBe(4);
    expect(receivedFeedback?.comment).toContain("guiden var tydelig");

    // Etter send: takke-card erstatter feedback-form
    await expect(page.getByTestId("tideman-thanks")).toBeVisible();
    await expect(page.getByText("Takk for tilbakemeldingen!")).toBeVisible();
    await expect(page.getByTestId("tideman-feedback-card")).not.toBeVisible();
  });
});

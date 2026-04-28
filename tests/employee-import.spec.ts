import { test, expect } from "@playwright/test";
import type { Page, Route } from "@playwright/test";

const MOCK_USER = {
  id: "1",
  email: "daniel@creatorhubn.com",
  name: "Daniel",
  firstName: "Daniel",
  lastName: "Hovedadmin",
  profileImageUrl: null,
  provider: "dev",
  role: "hovedadmin",
  vendorId: 42,
};

const MOCK_IMPORT_ID = "00000000-0000-0000-0000-000000000001";

function buildMockImport(status: "staged" | "confirmed" = "staged") {
  return {
    id: MOCK_IMPORT_ID,
    vendorId: 42,
    source: "planday",
    status,
    fileName: "ansatte.xlsx",
    fileHash: "abc123",
    rowCount: 4,
    createdBy: "daniel@creatorhubn.com",
    createdAt: new Date().toISOString(),
    confirmedAt: status === "confirmed" ? new Date().toISOString() : null,
    rolledBackAt: null,
    summaryJsonb: status === "confirmed"
      ? { valid: 3, errors: 0, duplicates: 1, imported: 3, skipped: 1, admin_grants: [] }
      : { valid: 3, errors: 0, duplicates: 1 },
  };
}

function buildMockRows() {
  return [
    {
      id: "row-1",
      importId: MOCK_IMPORT_ID,
      rowIndex: 0,
      externalId: "p-101",
      rawJsonb: {},
      parsedJsonb: {
        email: "tom@firma.no",
        firstName: "Tom",
        lastName: "Eriksen",
        phone: "+4798765432",
        department: "Bjørndalen",
        jobTitle: "Miljøarbeider",
        hiredDate: "2024-01-15",
      },
      status: "valid",
      errorMsg: null,
      roleAssigned: "miljoarbeider",
      targetUserId: null,
    },
    {
      id: "row-2",
      importId: MOCK_IMPORT_ID,
      rowIndex: 1,
      externalId: "p-102",
      rawJsonb: {},
      parsedJsonb: {
        email: "lise@firma.no",
        firstName: "Lise",
        lastName: "Hansen",
        phone: "+4791112233",
        department: "Bjørndalen",
        jobTitle: "Avdelingsleder",
        hiredDate: "2022-06-01",
      },
      status: "valid",
      errorMsg: null,
      roleAssigned: "tiltaksleder", // smart hint kicked in
      targetUserId: null,
    },
    {
      id: "row-3",
      importId: MOCK_IMPORT_ID,
      rowIndex: 2,
      externalId: "p-103",
      rawJsonb: {},
      parsedJsonb: { email: "knut@firma.no", firstName: "Knut", lastName: "Olsen" },
      status: "duplicate",
      errorMsg: null,
      roleAssigned: null,
      targetUserId: null,
    },
    {
      id: "row-4",
      importId: MOCK_IMPORT_ID,
      rowIndex: 3,
      externalId: null,
      rawJsonb: {},
      parsedJsonb: null,
      status: "error",
      errorMsg: "Mangler e-post",
      roleAssigned: null,
      targetUserId: null,
    },
  ];
}

async function mockAuth(page: Page) {
  await page.route("**/api/auth/user", (route: Route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(MOCK_USER) }),
  );
}

test.describe("Ansatt-import — wizard og preview", () => {
  test("velger Planday, ser guide, laster opp fil, navigerer til preview", async ({ page }) => {
    await mockAuth(page);

    // Mock POST /api/imports/employees (file upload)
    await page.route("**/api/imports/employees", (route) => {
      if (route.request().method() === "POST") {
        return route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify({
            import_id: MOCK_IMPORT_ID,
            summary: { total: 4, valid: 2, errors: 1, duplicates: 1 },
          }),
        });
      }
      return route.continue();
    });

    await page.goto("/import-employees");

    // Steg 1: kilde-velger synlig
    await expect(page.getByText("Hvor kommer dataene fra?")).toBeVisible();
    await page.getByTestId("source-planday").click();

    // Steg 2: Planday-guide
    await expect(page.getByText("Slik eksporterer du fra Planday")).toBeVisible();
    await expect(page.getByText('Hak av "Include deactivated employees"')).toBeVisible();
    await page.getByTestId("button-continue-upload").click();

    // Steg 3: opplasting
    await expect(page.getByText("Last opp fil")).toBeVisible();

    // Last opp en mock-fil
    const fileInput = page.getByTestId("input-file");
    await fileInput.setInputFiles({
      name: "ansatte.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer: Buffer.from("dummy-xlsx-content"),
    });

    await expect(page.getByText("ansatte.xlsx")).toBeVisible();
    await page.getByTestId("button-upload").click();

    // Skal navigere til preview-side
    await expect(page).toHaveURL(new RegExp(`/import-employees/${MOCK_IMPORT_ID}/preview`));
  });

  test("preview viser rader, smart hint, og fanger admin-grants i bekreftelses-modal", async ({ page }) => {
    await mockAuth(page);

    let currentRows = buildMockRows();
    let currentImport = buildMockImport("staged");

    // GET /api/imports/:id
    await page.route(`**/api/imports/${MOCK_IMPORT_ID}`, (route) => {
      if (route.request().method() === "GET") {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ import: currentImport, rows: currentRows }),
        });
      }
      if (route.request().method() === "DELETE") {
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, rolled_back: 3 }) });
      }
      return route.continue();
    });

    // PATCH role for én rad
    await page.route(`**/api/imports/${MOCK_IMPORT_ID}/rows/*`, async (route) => {
      const body = JSON.parse(route.request().postData() || "{}");
      const url = route.request().url();
      const rowId = url.split("/").pop();
      currentRows = currentRows.map((r) => (r.id === rowId ? { ...r, roleAssigned: body.role_assigned } : r));
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
    });

    // POST confirm
    await page.route(`**/api/imports/${MOCK_IMPORT_ID}/confirm`, (route) => {
      currentImport = buildMockImport("confirmed");
      currentRows = currentRows.map((r) => (r.status === "valid" ? { ...r, status: "imported" as const, targetUserId: 100 + r.rowIndex } : r));
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, imported: 2, skipped: 2, admin_grants: ["lise@firma.no"] }),
      });
    });

    await page.goto(`/import-employees/${MOCK_IMPORT_ID}/preview`);

    // Header
    await expect(page.getByText("Importer ansatte — preview")).toBeVisible();
    await expect(page.getByText("planday")).toBeVisible();

    // Rader
    await expect(page.getByText("Tom Eriksen")).toBeVisible();
    await expect(page.getByText("Lise Hansen")).toBeVisible();

    // Smart hint på Lise (jobTitle="Avdelingsleder" → roleAssigned=tiltaksleder)
    const liseRow = page.getByTestId("row-1");
    await expect(liseRow.getByText("Foreslått")).toBeVisible();

    // Duplicate-rad: knut er allerede registrert
    const knutRow = page.getByTestId("row-2");
    await expect(knutRow.getByText("Allerede i Tidum")).toBeVisible();

    // Error-rad
    const errorRow = page.getByTestId("row-3");
    await expect(errorRow.getByText("Mangler e-post")).toBeVisible();

    // Endre Tom sin rolle til vendor_admin
    await liseRow.getByTestId("role-select-1"); // bare for å sjekke at den finnes
    const tomRoleSelect = page.getByTestId("role-select-0");
    await tomRoleSelect.click();
    await page.getByRole("option", { name: /Leverandøradmin/ }).click();

    // Åpne bekreftelses-modal
    await page.getByTestId("button-open-confirm").click();
    await expect(page.getByText("Bekreft import")).toBeVisible();
    await expect(page.getByText(/Du gir leverandøradmin-tilgang til 1 person/)).toBeVisible();
    await expect(page.getByText("tom@firma.no")).toBeVisible();

    // Bekreft
    await page.getByTestId("button-confirm-import").click();
    await expect(page.getByText("Importen er bekreftet.")).toBeVisible();

    // Rollback skal være tilgjengelig nå
    await expect(page.getByTestId("button-open-rollback")).toBeVisible();
  });

  test("bulk-aksjon ekskluderer vendor_admin", async ({ page }) => {
    await mockAuth(page);

    await page.route(`**/api/imports/${MOCK_IMPORT_ID}`, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ import: buildMockImport("staged"), rows: buildMockRows() }),
      }),
    );

    await page.goto(`/import-employees/${MOCK_IMPORT_ID}/preview`);

    // Bulk-knappene skal ikke inneholde Leverandøradmin
    const bulk = page.locator('[data-testid^="bulk-"]');
    await expect(bulk).toHaveCount(4); // miljoarbeider, tiltaksleder, teamleder, case_manager
    await expect(page.getByTestId("bulk-vendor_admin")).toHaveCount(0);
  });
});

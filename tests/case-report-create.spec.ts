import { test, expect } from "@playwright/test";

// ── Shared fixtures ───────────────────────────────────────────────────────

const MOCK_USER = {
  id: "smoke-worker",
  email: "maria@tidum.no",
  name: "Maria",
  firstName: "Maria",
  lastName: "Nord",
  profileImageUrl: null,
  provider: "dev",
  role: "miljoarbeider",
  vendorId: null,
};

const MOCK_DRAFT_REPORT = {
  id: 1,
  vendorId: null,
  userId: "smoke-worker",
  userCasesId: null,
  caseId: "SAK-2024-001",
  month: "2024-01",
  background: "",
  actions: "",
  progress: "",
  challenges: "",
  factors: "",
  assessment: "",
  recommendations: "",
  notes: "",
  status: "draft",
  rejectionReason: null,
  rejectedBy: null,
  rejectedAt: null,
  approvedBy: null,
  approvedAt: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

async function mockAuth(page: import("@playwright/test").Page) {
  await page.route("**/api/auth/user", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(MOCK_USER),
    });
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────

test.describe("Saksrapport – oppretting", () => {
  test("kan lage en ny saksrapport og lagre som utkast", async ({ page }, testInfo) => {
    await mockAuth(page);

    // Track created report state so GET refetches see the new report
    let savedReport: typeof MOCK_DRAFT_REPORT | null = null;

    await page.route("**/api/case-reports", async (route) => {
      const method = route.request().method();

      if (method === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ reports: savedReport ? [savedReport] : [] }),
        });
      } else if (method === "POST") {
        savedReport = { ...MOCK_DRAFT_REPORT };
        await route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify(savedReport),
        });
      } else {
        await route.continue();
      }
    });

    await page.goto("/case-reports", { waitUntil: "domcontentloaded" });

    // Verify page loaded correctly
    await expect(page.getByTestId("text-page-title")).toBeVisible();
    await expect(page.getByTestId("text-page-title")).toContainText("saksrapporter");
    await expect(page.getByTestId("button-new-report")).toBeVisible();

    // Åpne skjemaet
    await page.getByTestId("button-new-report").click();

    // Skjemaet vises — fyll inn påkrevde felt
    await expect(page.getByTestId("input-case-id")).toBeVisible();
    await page.getByTestId("input-case-id").fill("SAK-2024-001");

    // Lagre som utkast
    await page.getByTestId("button-save-report").click();

    // Etter lagring skal skjemaet lukkes og "Ny rapport"-knappen vises igjen
    await expect(page.getByTestId("button-new-report")).toBeVisible({ timeout: 5000 });

    // Skjermbilde av resultatsiden
    const screenshot = await page.screenshot({ fullPage: false });
    await testInfo.attach("case-report-created", {
      body: screenshot,
      contentType: "image/png",
    });
  });

  test("viser feilmelding når saksnummer mangler", async ({ page }) => {
    await mockAuth(page);

    await page.route("**/api/case-reports", async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ reports: [] }),
        });
      } else {
        await route.continue();
      }
    });

    await page.goto("/case-reports", { waitUntil: "domcontentloaded" });
    await page.getByTestId("button-new-report").click();

    // Prøv å lagre uten saksnummer (måned er forhåndsvalgt)
    await page.getByTestId("button-save-report").click();

    // Skjemaet skal fortsatt være åpent (validering blokkerte lagring)
    await expect(page.getByTestId("input-case-id")).toBeVisible();

    // Feilmelding-toast skal vises (bruker .first() for å unngå strict-mode-konflikt med aria-live-span)
    await expect(page.getByText("Saksnummer og måned er påkrevd.").first()).toBeVisible({ timeout: 3000 });
  });

  test("kan avbryte opprettingen uten at rapporten lagres", async ({ page }) => {
    await mockAuth(page);

    let postCalled = false;

    await page.route("**/api/case-reports", async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ reports: [] }),
        });
      } else if (route.request().method() === "POST") {
        postCalled = true;
        await route.continue();
      } else {
        await route.continue();
      }
    });

    await page.goto("/case-reports", { waitUntil: "domcontentloaded" });
    await page.getByTestId("button-new-report").click();

    // Fyll inn felt
    await page.getByTestId("input-case-id").fill("SAK-2024-002");

    // Klikk avbryt
    await page.getByTestId("button-cancel").click();

    // Skjemaet skal lukkes
    await expect(page.getByTestId("button-new-report")).toBeVisible({ timeout: 3000 });

    // Ingen POST-kall skal ha blitt sendt
    expect(postCalled).toBe(false);
  });
});

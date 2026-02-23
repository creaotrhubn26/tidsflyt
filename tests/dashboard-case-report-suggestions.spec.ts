import { expect, test, type Page } from "@playwright/test";

async function mockDashboardCaseSuggestionsApi(page: Page) {
  await page.route("**/api/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({}),
    });
  });

  await page.route(/\/api\/auth\/user(\?.*)?$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: "dashboard-case-worker",
        email: "maria@tidum.no",
        name: "Maria",
        firstName: "Maria",
        lastName: "Nord",
        profileImageUrl: null,
        provider: "dev",
        role: "member",
        vendorId: null,
      }),
    });
  });

  await page.route("**/api/company/users**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([]),
    });
  });

  await page.route("**/api/portal/settings**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        companyName: "Tidum",
        primaryColor: "#1F6B73",
        logoUrl: null,
      }),
    });
  });

  await page.route("**/api/feedback/check-milestone", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ shouldPrompt: false }),
    });
  });

  await page.route("**/api/stats**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        totalHours: 12.5,
        activeUsers: 3,
        pendingApprovals: 1,
        casesThisWeek: 2,
        hoursTrend: 3,
        usersTrend: 0,
        approvalsTrend: -1,
        casesTrend: 1,
      }),
    });
  });

  await page.route("**/api/activities**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([]),
    });
  });

  await page.route("**/api/chart-data**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        hoursPerDay: [
          { day: "Man", hours: 2.5 },
          { day: "Tir", hours: 3 },
          { day: "Ons", hours: 2 },
          { day: "Tor", hours: 3 },
          { day: "Fre", hours: 2 },
          { day: "Lor", hours: 0 },
          { day: "Son", hours: 0 },
        ],
        heatmapData: [],
      }),
    });
  });

  await page.route("**/api/time-entries/suggestions**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        date: "2026-02-23",
        analyzedEntries: 0,
        suggestion: {
          project: { value: null, confidence: 0.2, sampleSize: 0, reason: "Ingen forslag" },
          description: { value: null, confidence: 0.2, sampleSize: 0, reason: "Ingen forslag" },
          hours: { value: null, confidence: 0.2, sampleSize: 0, reason: "Ingen forslag" },
          bulkCopyPrevMonth: { value: false, confidence: 0.2, sampleSize: 0, reason: "Ingen forslag" },
        },
        personalization: {
          totalFeedback: 0,
          acceptanceRate: null,
          feedbackByType: {},
        },
      }),
    });
  });

  await page.route("**/api/case-reports/suggestions/feedback", async (route) => {
    await route.fulfill({
      status: 204,
      contentType: "application/json",
      body: "",
    });
  });

  await page.route("**/api/case-reports/suggestions**", async (route) => {
    if (route.request().url().includes("/api/case-reports/suggestions/feedback")) {
      await route.fallback();
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        month: "2026-02",
        analyzedReports: 11,
        suggestion: {
          caseId: {
            value: "SAK-2026-123",
            confidence: 0.82,
            sampleSize: 5,
            reason: "Mest brukte sak i tidligere rapporter.",
          },
          template: {
            value: "Forrige måned (samme sak)",
            confidence: 0.79,
            sampleSize: 4,
            reason: "Basert på tidligere rapporter.",
          },
          copyPreviousMonth: {
            value: true,
            confidence: 0.81,
            sampleSize: 1,
            reason: "Fant rapport i forrige måned.",
          },
          fields: {
            background: { value: "<p>Forslag bakgrunn.</p>", confidence: 0.7, sampleSize: 2, reason: "Historikk." },
            actions: { value: "<p>Forslag tiltak.</p>", confidence: 0.7, sampleSize: 2, reason: "Historikk." },
            progress: { value: null, confidence: 0.2, sampleSize: 0, reason: "Ingen forslag." },
            challenges: { value: null, confidence: 0.2, sampleSize: 0, reason: "Ingen forslag." },
            factors: { value: null, confidence: 0.2, sampleSize: 0, reason: "Ingen forslag." },
            assessment: { value: "<p>Forslag vurdering.</p>", confidence: 0.7, sampleSize: 2, reason: "Historikk." },
            recommendations: { value: null, confidence: 0.2, sampleSize: 0, reason: "Ingen forslag." },
            notes: { value: "Forslag notat", confidence: 0.7, sampleSize: 2, reason: "Historikk." },
          },
        },
        previousMonthReport: {
          id: 41,
          caseId: "SAK-2026-123",
          month: "2026-01",
          fields: {
            background: "<p>Kopiert bakgrunn fra forrige måned.</p>",
            actions: "<p>Kopierte tiltak fra forrige måned.</p>",
            progress: null,
            challenges: null,
            factors: null,
            assessment: "<p>Kopiert vurdering fra forrige måned.</p>",
            recommendations: null,
            notes: "Kopiert notat fra forrige måned.",
          },
        },
        personalization: {
          totalFeedback: 2,
          acceptanceRate: 1,
          feedbackByType: {
            copy_previous_month: { accepted: 2, rejected: 0 },
          },
        },
      }),
    });
  });

  await page.route("**/api/case-reports**", async (route) => {
    if (route.request().url().includes("/api/case-reports/suggestions")) {
      await route.fallback();
      return;
    }
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ reports: [] }),
      });
      return;
    }
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({ id: 901, status: "draft" }),
    });
  });
}

test("dashboard kan åpne saksrapport med auto-prefill fra forslag", async ({ page }) => {
  await mockDashboardCaseSuggestionsApi(page);

  await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("dashboard-case-report-suggestion")).toBeVisible();
  await page.getByTestId("dashboard-case-report-suggestion-apply").click();

  await expect(page).toHaveURL(/\/case-reports/);
  await expect(page.getByTestId("input-case-id")).toHaveValue("SAK-2026-123");
  await expect(page.locator('[data-testid="editor-background"] .ql-editor')).toContainText(
    "Kopiert bakgrunn fra forrige måned.",
  );
  await expect(page.getByTestId("input-notes")).toHaveValue("Kopiert notat fra forrige måned.");
});

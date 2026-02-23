import { test, expect, type Page } from "@playwright/test";

type SuggestionMode = "off" | "dashboard_only" | "balanced" | "proactive";

async function mockSuggestionModesApi(page: Page, mode: SuggestionMode) {
  let suggestionSettings = {
    mode,
    frequency: "high" as const,
    updatedAt: "2026-02-23T08:00:00.000Z",
  };

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
        id: "mode-worker",
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

  await page.route("**/api/suggestion-settings", async (route) => {
    if (route.request().method() === "PATCH") {
      const payload = route.request().postDataJSON() as Partial<typeof suggestionSettings>;
      suggestionSettings = {
        ...suggestionSettings,
        ...payload,
        updatedAt: "2026-02-23T09:00:00.000Z",
      };
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(suggestionSettings),
    });
  });

  await page.route("**/api/stats**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        totalHours: 0,
        activeUsers: 3,
        pendingApprovals: 0,
        casesThisWeek: 0,
        hoursTrend: 0,
        usersTrend: 0,
        approvalsTrend: 0,
        casesTrend: 0,
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
          { day: "Man", hours: 0 },
          { day: "Tir", hours: 0 },
          { day: "Ons", hours: 0 },
          { day: "Tor", hours: 0 },
          { day: "Fre", hours: 0 },
          { day: "Lor", hours: 0 },
          { day: "Son", hours: 0 },
        ],
        heatmapData: [],
      }),
    });
  });

  await page.route("**/api/time-entries/suggestions**", async (route) => {
    if (route.request().url().includes("/api/time-entries/suggestions/feedback")) {
      await route.fallback();
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        date: "2026-02-23",
        analyzedEntries: 24,
        suggestion: {
          project: { value: "development", confidence: 0.82, sampleSize: 12, reason: "Mest brukt prosjekt." },
          description: { value: "Oppfølging av tiltak", confidence: 0.78, sampleSize: 10, reason: "Mest brukt beskrivelse." },
          hours: { value: 7.5, confidence: 0.8, sampleSize: 9, reason: "Gjennomsnitt fra lignende dager." },
          bulkCopyPrevMonth: { value: true, confidence: 0.7, sampleSize: 8, reason: "Du har føringer i forrige måned." },
        },
        personalization: {
          totalFeedback: 0,
          acceptanceRate: null,
          feedbackByType: {},
        },
      }),
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
        analyzedReports: 14,
        suggestion: {
          caseId: { value: "SAK-2026-007", confidence: 0.83, sampleSize: 6, reason: "Mest brukte sak." },
          template: { value: "Forrige måned", confidence: 0.78, sampleSize: 5, reason: "Basert på historikk." },
          copyPreviousMonth: { value: true, confidence: 0.82, sampleSize: 1, reason: "Fant rapport i forrige måned." },
          fields: {
            background: { value: "<p>Bakgrunn</p>", confidence: 0.8, sampleSize: 4, reason: "Historikk." },
            actions: { value: "<p>Tiltak</p>", confidence: 0.79, sampleSize: 4, reason: "Historikk." },
            progress: { value: null, confidence: 0.2, sampleSize: 0, reason: "Ingen forslag." },
            challenges: { value: null, confidence: 0.2, sampleSize: 0, reason: "Ingen forslag." },
            factors: { value: null, confidence: 0.2, sampleSize: 0, reason: "Ingen forslag." },
            assessment: { value: "<p>Vurdering</p>", confidence: 0.76, sampleSize: 3, reason: "Historikk." },
            recommendations: { value: null, confidence: 0.2, sampleSize: 0, reason: "Ingen forslag." },
            notes: { value: "Notat", confidence: 0.72, sampleSize: 2, reason: "Historikk." },
          },
        },
        previousMonthReport: {
          id: 77,
          caseId: "SAK-2026-007",
          month: "2026-01",
          fields: {
            background: "<p>Bakgrunn</p>",
            actions: "<p>Tiltak</p>",
            progress: null,
            challenges: null,
            factors: null,
            assessment: "<p>Vurdering</p>",
            recommendations: null,
            notes: "Notat",
          },
        },
        personalization: {
          totalFeedback: 0,
          acceptanceRate: null,
          feedbackByType: {},
        },
      }),
    });
  });

  await page.route("**/api/time-entries**", async (route) => {
    if (route.request().url().includes("/api/time-entries/suggestions")) {
      await route.fallback();
      return;
    }

    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      });
      return;
    }

    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({ id: "created-entry" }),
    });
  });

  await page.route("**/api/case-reports", async (route) => {
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
      body: JSON.stringify({ id: 99, status: "draft" }),
    });
  });

  await page.route("**/api/invoices**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          id: 1,
          invoiceNumber: "INV-1001",
          userId: "mode-worker",
          clientName: "Eksempel AS",
          clientAddress: "Eksempelveien 1",
          clientOrg: "999888777",
          clientEmail: "post@eksempel.no",
          invoiceDate: "2026-01-31",
          dueDate: "2026-02-14",
          subtotal: 10000,
          mva: 2500,
          total: 12500,
          status: "draft",
          notes: null,
          paymentDate: null,
          paymentMethod: null,
          periodStart: "2026-01-01",
          periodEnd: "2026-01-31",
          createdAt: "2026-02-01T08:00:00.000Z",
          updatedAt: "2026-02-01T08:00:00.000Z",
          lineItems: [
            { id: 11, invoiceId: 1, description: "Konsulenttimer", quantity: 8, unitPrice: 1250, total: 10000 },
          ],
        },
      ]),
    });
  });

  await page.route("**/api/recurring**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          id: 7,
          userId: "mode-worker",
          title: "Ukentlig oppfølging",
          description: "Fast oppfølging",
          activity: "Oppfølging",
          project: "Tiltak A",
          hours: 2,
          recurrenceType: "weekly",
          recurrenceDays: ["monday"],
          recurrenceDay: null,
          startDate: "2026-01-01",
          endDate: null,
          isActive: true,
          createdAt: "2026-02-01T08:00:00.000Z",
        },
      ]),
    });
  });

  await page.route("**/api/reports**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([]),
    });
  });

  await page.route("**/api/users**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([]),
    });
  });
}

const modeExpectations: Record<SuggestionMode, { dashboard: boolean; workflow: boolean; automation: boolean }> = {
  off: { dashboard: false, workflow: false, automation: false },
  dashboard_only: { dashboard: true, workflow: false, automation: false },
  balanced: { dashboard: true, workflow: true, automation: false },
  proactive: { dashboard: true, workflow: true, automation: true },
};

for (const mode of ["off", "dashboard_only", "balanced", "proactive"] as const) {
  test(`forslagsmoduser: ${mode}`, async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem(
        "tidum-report-schedule",
        JSON.stringify({
          reportType: "monthly",
          frequency: "monthly",
          updatedAt: "2026-02-23T08:00:00.000Z",
        }),
      );
    });

    await mockSuggestionModesApi(page, mode);
    const expected = modeExpectations[mode];

    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    if (expected.dashboard) {
      await expect(page.getByTestId("dashboard-quick-log-suggestion")).toBeVisible();
      await expect(page.getByTestId("dashboard-case-report-suggestion")).toBeVisible();
    } else {
      await expect(page.getByTestId("dashboard-quick-log-suggestion")).toHaveCount(0);
      await expect(page.getByTestId("dashboard-case-report-suggestion")).toHaveCount(0);
    }

    await page.goto("/time", { waitUntil: "domcontentloaded" });
    if (expected.workflow) {
      await expect(page.getByTestId("time-suggestions-card")).toBeVisible();
    } else {
      await expect(page.getByTestId("time-suggestions-card")).toHaveCount(0);
    }

    await page.goto("/case-reports", { waitUntil: "domcontentloaded" });
    await page.getByTestId("button-new-report").click();
    if (!(await page.getByTestId("input-case-id").isVisible().catch(() => false))) {
      await page.getByRole("button", { name: "Opprett første saksrapport" }).click();
    }
    await expect(page.getByTestId("input-case-id")).toBeVisible();

    if (expected.workflow) {
      await expect(page.getByTestId("case-report-suggestions-card")).toBeVisible();
    } else {
      await expect(page.getByTestId("case-report-suggestions-card")).toHaveCount(0);
    }

    await page.goto("/reports", { waitUntil: "domcontentloaded" });
    await page.getByRole("tab", { name: "Planlegg" }).click();
    if (expected.automation) {
      await expect(page.getByTestId("reports-schedule-suggestion")).toBeVisible();
    } else {
      await expect(page.getByTestId("reports-schedule-suggestion")).toHaveCount(0);
    }
  });
}

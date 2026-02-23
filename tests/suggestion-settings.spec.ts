import { test, expect, type Page } from "@playwright/test";

async function mockSuggestionSettingsFlow(page: Page) {
  let suggestionSettings = {
    mode: "balanced",
    frequency: "normal",
    confidenceThreshold: 0.45,
    blocked: {
      projects: [],
      descriptions: [],
      caseIds: [],
    },
    userOverride: false,
    teamDefault: null,
    rollout: null,
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
        id: "settings-worker",
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

  await page.route("**/api/profile", async (route) => {
    if (route.request().method() === "PATCH") {
      const payload = route.request().postDataJSON() as Record<string, unknown>;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: "settings-worker",
          email: "maria@tidum.no",
          firstName: payload.firstName ?? "Maria",
          lastName: payload.lastName ?? "Nord",
          profileImageUrl: null,
          role: "member",
          vendorId: null,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-02-23T08:00:00.000Z",
          phone: payload.phone ?? null,
          language: payload.language ?? "no",
          notificationEmail: payload.notificationEmail ?? true,
          notificationPush: payload.notificationPush ?? false,
          notificationWeekly: payload.notificationWeekly ?? true,
        }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: "settings-worker",
        email: "maria@tidum.no",
        firstName: "Maria",
        lastName: "Nord",
        profileImageUrl: null,
        role: "member",
        vendorId: null,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-02-23T08:00:00.000Z",
        phone: null,
        language: "no",
        notificationEmail: true,
        notificationPush: false,
        notificationWeekly: true,
      }),
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
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(suggestionSettings),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(suggestionSettings),
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
}

test("bruker kan skru av forslag i innstillinger og skjule dashboard-forslag", async ({ page }) => {
  await mockSuggestionSettingsFlow(page);

  await page.goto("/settings", { waitUntil: "domcontentloaded" });

  const suggestionsSwitch = page.getByTestId("suggestions-enabled-switch");
  await expect(suggestionsSwitch).toHaveAttribute("data-state", "checked");
  await page.getByTestId("suggestion-threshold-select").click();
  await page.getByRole("option", { name: "Kun høy sikkerhet (60%)" }).click();
  await suggestionsSwitch.click();
  await expect(suggestionsSwitch).toHaveAttribute("data-state", "unchecked");

  await page.goto("/dashboard", { waitUntil: "domcontentloaded" });

  await expect(page.getByTestId("dashboard-quick-log-suggestion")).toHaveCount(0);
  await expect(page.getByTestId("dashboard-case-report-suggestion")).toHaveCount(0);
});

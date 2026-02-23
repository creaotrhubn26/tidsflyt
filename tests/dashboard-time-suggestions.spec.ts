import { test, expect, type Page } from "@playwright/test";

async function mockDashboardSuggestionsApi(page: Page, feedbackEvents: any[]) {
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
        id: "dashboard-worker",
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

  await page.route("**/api/time-entries/suggestions/feedback", async (route) => {
    const postData = route.request().postData();
    feedbackEvents.push(postData ? JSON.parse(postData) : {});
    await route.fulfill({
      status: 204,
      contentType: "application/json",
      body: "",
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
          project: {
            value: "development",
            confidence: 0.82,
            sampleSize: 12,
            reason: "Mest brukt prosjekt i lignende føringer.",
          },
          description: {
            value: "Oppfølging av tiltak",
            confidence: 0.78,
            sampleSize: 10,
            reason: "Mest brukt beskrivelse i lignende føringer.",
          },
          hours: {
            value: 7.5,
            confidence: 0.8,
            sampleSize: 9,
            reason: "Gjennomsnitt fra lignende dager.",
          },
          bulkCopyPrevMonth: {
            value: true,
            confidence: 0.7,
            sampleSize: 8,
            reason: "Du har føringer i forrige måned.",
          },
        },
        personalization: {
          totalFeedback: 3,
          acceptanceRate: 0.66,
          feedbackByType: {
            project: { accepted: 2, rejected: 1 },
          },
        },
      }),
    });
  });

  await page.route("**/api/time-entries**", async (route) => {
    const req = route.request();

    if (req.url().includes("/api/time-entries/suggestions")) {
      await route.fallback();
      return;
    }

    if (req.method() === "GET") {
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
}

test("dashboard bruker forslag i quick log og viderefører prefill til timeføring", async ({ page }) => {
  const feedbackEvents: any[] = [];
  await mockDashboardSuggestionsApi(page, feedbackEvents);

  await page.goto("/dashboard", { waitUntil: "domcontentloaded" });

  await expect(page.getByTestId("dashboard-quick-log-suggestion")).toBeVisible();
  await page.getByTestId("dashboard-quick-log-apply-suggestion").click();

  await expect(page.getByTestId("dashboard-quick-log-description")).toHaveValue("Oppfølging av tiltak");
  await expect(page.getByTestId("dashboard-quick-log-hours")).toHaveValue("7.5");

  await expect(page.getByTestId("next-action")).toContainText("Start med forslag");
  await page.getByTestId("next-action").getByRole("button", { name: "Start med forslag" }).click();

  await expect(page).toHaveURL(/\/time-tracking/);
  await expect(page.getByTestId("project-select")).toContainText("Utvikling");
  await expect(page.getByTestId("task-input")).toHaveValue("Oppfølging av tiltak");

  await expect.poll(() => feedbackEvents.length).toBeGreaterThan(0);
  expect(
    feedbackEvents.some(
      (event) =>
        event.suggestionType === "apply_all" &&
        event.outcome === "accepted",
    ),
  ).toBeTruthy();
});

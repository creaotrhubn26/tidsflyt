import { test, expect, type Page } from "@playwright/test";

async function mockTimeSuggestionsApi(page: Page, feedbackEvents: any[], blockEvents: any[]) {
  // Generic fallback must be registered first (lowest priority).
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
        id: "worker-suggestions",
        email: "maria@tidum.no",
        name: "Maria",
        firstName: "Maria",
        lastName: "Nord",
        profileImageUrl: null,
        provider: "dev",
        role: "miljoarbeider",
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

  await page.route("**/api/time-entries/suggestions/feedback", async (route) => {
    const postData = route.request().postData();
    feedbackEvents.push(postData ? JSON.parse(postData) : {});
    await route.fulfill({
      status: 204,
      contentType: "application/json",
      body: "",
    });
  });

  await page.route("**/api/suggestion-settings/blocks", async (route) => {
    const postData = route.request().postData();
    if (postData) {
      blockEvents.push(JSON.parse(postData));
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        mode: "balanced",
        frequency: "normal",
        confidenceThreshold: 0.45,
        blocked: {
          projects: ["development"],
          descriptions: [],
          caseIds: [],
        },
        userOverride: true,
        teamDefault: null,
        rollout: null,
        updatedAt: "2026-02-23T09:00:00.000Z",
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

test("time tracking viser personlige forslag og sender feedback", async ({ page }) => {
  const feedbackEvents: any[] = [];
  const blockEvents: any[] = [];
  await mockTimeSuggestionsApi(page, feedbackEvents, blockEvents);

  await page.goto("/time", { waitUntil: "domcontentloaded" });

  await expect(page.getByTestId("time-suggestions-card")).toBeVisible();
  await expect(page.getByTestId("suggestion-project")).toContainText("Utvikling");
  await expect(page.getByTestId("suggestion-description")).toContainText("Oppfølging av tiltak");
  await expect(page.getByTestId("suggestion-hours")).toContainText("7.5 timer");

  await page.getByTestId("suggestion-project-apply").click();
  await page.getByTestId("suggestion-description-apply").click();
  await page.getByTestId("suggestion-hours-apply").click();

  await expect(page.getByTestId("project-select")).toContainText("Utvikling");
  await expect(page.getByTestId("task-input")).toHaveValue("Oppfølging av tiltak");
  await expect(page.getByTestId("manual-hours")).toHaveValue("7.5");
  await page.getByRole("dialog", { name: "Legg til manuell registrering" }).getByRole("button", { name: "Avbryt" }).click();

  await page.getByTestId("suggestion-project-never").click();

  await expect.poll(() => feedbackEvents.length).toBeGreaterThanOrEqual(4);
  await expect.poll(() => blockEvents.length).toBeGreaterThanOrEqual(1);
  expect(feedbackEvents.some((event) => event.suggestionType === "project" && event.outcome === "accepted")).toBeTruthy();
  expect(feedbackEvents.some((event) => event.suggestionType === "hours" && event.outcome === "accepted")).toBeTruthy();
  expect(blockEvents.some((event) => event.category === "project" && event.value === "development")).toBeTruthy();
});

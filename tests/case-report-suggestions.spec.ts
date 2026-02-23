import { test, expect, type Page } from "@playwright/test";

async function mockCaseReportSuggestionsApi(page: Page, feedbackEvents: any[]) {
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
        id: "case-report-worker",
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

  await page.route("**/api/case-reports/suggestions/feedback", async (route) => {
    const postData = route.request().postData();
    feedbackEvents.push(postData ? JSON.parse(postData) : {});
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
        analyzedReports: 14,
        suggestion: {
          caseId: {
            value: "SAK-2026-007",
            confidence: 0.83,
            sampleSize: 6,
            reason: "Mest brukte sak i tidligere rapporter.",
          },
          template: {
            value: "Forrige måned (samme sak)",
            confidence: 0.78,
            sampleSize: 5,
            reason: "Basert på relevant historikk.",
          },
          copyPreviousMonth: {
            value: true,
            confidence: 0.82,
            sampleSize: 1,
            reason: "Fant rapport i forrige måned.",
          },
          fields: {
            background: {
              value: "<p>Brukeren hadde stabil oppfølging i perioden.</p>",
              confidence: 0.8,
              sampleSize: 4,
              reason: "Hentet fra tidligere rapporter.",
            },
            actions: {
              value: "<p>Ukentlige møter og tett koordinering med skole.</p>",
              confidence: 0.79,
              sampleSize: 4,
              reason: "Hentet fra tidligere rapporter.",
            },
            progress: {
              value: null,
              confidence: 0.2,
              sampleSize: 0,
              reason: "Ingen forslag tilgjengelig.",
            },
            challenges: {
              value: null,
              confidence: 0.2,
              sampleSize: 0,
              reason: "Ingen forslag tilgjengelig.",
            },
            factors: {
              value: null,
              confidence: 0.2,
              sampleSize: 0,
              reason: "Ingen forslag tilgjengelig.",
            },
            assessment: {
              value: "<p>Tiltaket anbefales videreført med mindre justeringer.</p>",
              confidence: 0.76,
              sampleSize: 3,
              reason: "Hentet fra tidligere rapporter.",
            },
            recommendations: {
              value: null,
              confidence: 0.2,
              sampleSize: 0,
              reason: "Ingen forslag tilgjengelig.",
            },
            notes: {
              value: "Neste oppfølgingsmøte er satt til uke 11.",
              confidence: 0.72,
              sampleSize: 2,
              reason: "Hentet fra tidligere rapporter.",
            },
          },
        },
        previousMonthReport: {
          id: 77,
          caseId: "SAK-2026-007",
          month: "2026-01",
          fields: {
            background: "<p>Forrige måned: stabil utvikling.</p>",
            actions: "<p>Forrige måned: to koordinasjonsmøter.</p>",
            progress: null,
            challenges: null,
            factors: null,
            assessment: "<p>Forrige måned: positiv utvikling.</p>",
            recommendations: null,
            notes: "Forrige måned-notat.",
          },
        },
        personalization: {
          totalFeedback: 4,
          acceptanceRate: 0.75,
          feedbackByType: {
            case_id: { accepted: 2, rejected: 0 },
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
      body: JSON.stringify({ id: 99, status: "draft" }),
    });
  });
}

test("saksrapporter viser personlige forslag og kan kopiere forrige måned", async ({ page }) => {
  const feedbackEvents: any[] = [];
  await mockCaseReportSuggestionsApi(page, feedbackEvents);

  await page.goto("/case-reports", { waitUntil: "domcontentloaded" });
  await page.getByTestId("button-new-report").click();
  if (!(await page.getByTestId("input-case-id").isVisible().catch(() => false))) {
    await page.getByRole("button", { name: "Opprett første saksrapport" }).click();
  }
  await expect(page.getByTestId("input-case-id")).toBeVisible();

  await expect(page.getByTestId("case-report-suggestions-card")).toBeVisible();
  await page.getByTestId("case-report-suggestion-apply-caseid").click();
  await expect(page.getByTestId("input-case-id")).toHaveValue("SAK-2026-007");

  await page.getByTestId("case-report-suggestion-apply-empty").click();
  await expect(page.locator('[data-testid="editor-background"] .ql-editor')).toContainText("Brukeren hadde stabil oppfølging");
  await expect(page.locator('[data-testid="editor-actions"] .ql-editor')).toContainText("Ukentlige møter");
  await expect(page.getByTestId("input-notes")).toHaveValue("Neste oppfølgingsmøte er satt til uke 11.");

  await page.getByTestId("case-report-suggestion-copy-previous-month").click();
  await expect(page.locator('[data-testid="editor-background"] .ql-editor')).toContainText("Forrige måned: stabil utvikling.");
  await expect(page.getByTestId("input-notes")).toHaveValue("Forrige måned-notat.");

  await expect.poll(() => feedbackEvents.length).toBeGreaterThan(0);
  expect(
    feedbackEvents.some(
      (event) => event.suggestionType === "copy_previous_month" && event.outcome === "accepted",
    ),
  ).toBeTruthy();
});

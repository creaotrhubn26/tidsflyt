import { test, expect, type Page, type Route } from "@playwright/test";

function formatDate(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function buildPreviousMonthTemplateEntries(startDateStr: string) {
  const monthStart = new Date(`${startDateStr}T00:00:00`);
  const entries: Array<{ date: string; hours: number; description: string; caseNumber: string }> = [];

  // First weekday occurrence for Mon..Fri in this month
  for (let dayOfWeek = 1; dayOfWeek <= 5; dayOfWeek++) {
    const d = new Date(monthStart);
    while (d.getDay() !== dayOfWeek) {
      d.setDate(d.getDate() + 1);
    }

    entries.push({
      date: formatDate(d),
      hours: dayOfWeek + 4, // 5..9 timer
      description: "Kopi test",
      caseNumber: "development",
    });
  }

  return entries;
}

async function mockApi(page: Page) {
  // Generic fallback for unknown API calls.
  // Must be registered first because Playwright uses last-registered route as highest priority.
  await page.route("**/api/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({}),
    });
  });

  await page.route("**/api/auth/user", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: "bulk-copy-worker",
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

  await page.route("**/api/time-entries/check-existing**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ existingDates: [] }),
    });
  });

  await page.route("**/api/time-entries**", async (route: Route) => {
    const req = route.request();
    if (req.method() !== "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({}),
      });
      return;
    }

    const url = new URL(req.url());
    const startDate = url.searchParams.get("startDate");
    const endDate = url.searchParams.get("endDate");

    // Daily list on page load
    if (startDate && endDate && startDate === endDate) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      });
      return;
    }

    // Previous month fetch used by "Kopier forrige måned"
    if (startDate && endDate && startDate !== endDate) {
      const entries = buildPreviousMonthTemplateEntries(startDate);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(entries),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([]),
    });
  });
}

test("bulk modal kan kopiere fra forrige måned og aktivere dager", async ({ page }) => {
  await mockApi(page);
  await page.goto("/time", { waitUntil: "domcontentloaded" });

  await page.getByTestId("add-bulk-entry").click();
  await expect(page.getByRole("heading", { name: "Fyll ut måned" })).toBeVisible();

  const copyBtn = page.getByTestId("button-copy-previous-month");
  await expect(copyBtn).toBeVisible();
  await expect(copyBtn).toBeEnabled();

  await copyBtn.click();

  const submitBtn = page.getByTestId("button-submit-bulk");
  await expect(submitBtn).toBeVisible();
  await expect(submitBtn).toContainText(/Registrer [1-9]\d* dager/);

  // Go back and verify prefill from copied month
  await page.getByTestId("button-back").click();
  await expect(page.getByTestId("input-bulk-description")).toHaveValue("Kopi test");
  await expect(page.getByTestId("select-bulk-project")).toContainText("Utvikling");
});

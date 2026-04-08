import { test, expect, type Page } from "@playwright/test";

const SUPER_ADMIN = {
  id: "sa-preview-001",
  email: "daniel@creatorhubn.com",
  name: "Daniel Qazi",
  firstName: "Daniel",
  lastName: "Qazi",
  profileImageUrl: null,
  provider: "dev",
  role: "super_admin",
  vendorId: null,
};

async function mockTidumPortal(page: Page) {
  await page.route(/\/api\//, async (route) => {
    const url = route.request().url();

    if (url.includes("/api/auth/user")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(SUPER_ADMIN),
      });
      return;
    }

    if (url.includes("/api/portal/settings")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          companyName: "Tidum",
          primaryColor: "#1F6B73",
          logoUrl: null,
          welcomeMessage: "Velkommen til Tidum",
        }),
      });
      return;
    }

    if (
      url.includes("/api/activities")
      || url.includes("/api/notifications")
      || url.includes("/api/time-entries")
      || url.includes("/api/company/users")
      || url.includes("/api/reports")
      || url.includes("/api/users")
      || url.includes("/api/vendors")
    ) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      });
      return;
    }

    if (url.includes("/api/timesheets/submissions")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ submissions: [] }),
      });
      return;
    }

    if (url.includes("/api/admin/timesheets")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ timesheets: [] }),
      });
      return;
    }

    if (url.includes("/api/stats")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          totalHours: 0,
          activeUsers: 0,
          pendingApprovals: 0,
          casesThisWeek: 0,
          hoursTrend: 0,
          usersTrend: 0,
          approvalsTrend: 0,
          casesTrend: 0,
        }),
      });
      return;
    }

    if (url.includes("/api/profile")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: SUPER_ADMIN.id,
          email: SUPER_ADMIN.email,
          firstName: SUPER_ADMIN.firstName,
          lastName: SUPER_ADMIN.lastName,
          profileImageUrl: null,
          role: SUPER_ADMIN.role,
          vendorId: SUPER_ADMIN.vendorId,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          phone: null,
          language: "no",
          notificationEmail: true,
          notificationPush: false,
          notificationWeekly: true,
        }),
      });
      return;
    }

    if (url.includes("/api/time-tracking/work-types")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          role: "super_admin",
          timeTrackingEnabled: true,
          workTypes: [],
        }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({}),
    });
  });
}

async function ensureSidebarOpen(page: Page) {
  const visibleUserMenuTrigger = page.locator('[data-testid="user-menu-trigger"]:visible').last();
  if (await visibleUserMenuTrigger.count()) {
    return;
  }

  if ((page.viewportSize()?.width || 0) < 768) {
    const mobileMenuTrigger = page.getByTestId("mobile-menu-trigger");
    await mobileMenuTrigger.click();
  }
  await expect(visibleUserMenuTrigger).toBeVisible();
}

async function openUserMenu(page: Page) {
  await ensureSidebarOpen(page);
  if ((page.viewportSize()?.width || 0) < 768) {
    const trigger = page.locator('[data-testid="user-menu-trigger"]:visible').last();
    await trigger.scrollIntoViewIfNeeded();
    await trigger.evaluate((element: HTMLElement) => element.click());
    return;
  }
  const trigger = page.locator('[data-testid="user-menu-trigger"]:visible').last();
  await trigger.click();
}

function visibleByTestId(page: Page, testId: string) {
  return page.locator(`[data-testid="${testId}"]:visible`);
}

async function switchViewMode(page: Page, label: "Admin" | "Institusjon" | "Miljøarbeider") {
  if ((page.viewportSize()?.width || 0) < 768) {
    const mode =
      label === "Institusjon"
        ? "institution"
        : label === "Miljøarbeider"
          ? "miljoarbeider"
          : "admin";
    await page.evaluate(
      ({ userId, nextMode }) => {
        window.localStorage.setItem(`tidum-role-preview:${userId}`, nextMode);
      },
      { userId: SUPER_ADMIN.id, nextMode: mode },
    );
    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/dashboard$/);
    return;
  }

  await openUserMenu(page);
  await page.getByRole("menuitemradio", { name: label }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

test("admin can switch between Admin, Institusjon, and Miljøarbeider views end-to-end", async ({ page }) => {
  await mockTidumPortal(page);
  await page.goto("/dashboard", { waitUntil: "domcontentloaded" });

  await expect(page).toHaveURL(/\/dashboard$/);
  await ensureSidebarOpen(page);
  await expect(visibleByTestId(page, "sidebar-leverandører")).toBeVisible();
  await expect(visibleByTestId(page, "sidebar-invitasjoner")).toHaveCount(0);

  await switchViewMode(page, "Institusjon");
  await ensureSidebarOpen(page);
  await expect(visibleByTestId(page, "sidebar-invitasjoner")).toBeVisible();
  await expect(visibleByTestId(page, "sidebar-rapporter")).toBeVisible();
  await expect(visibleByTestId(page, "sidebar-leverandører")).toHaveCount(0);

  await page.goto("/reports", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("reports-title")).toBeVisible();

  await page.goto("/vendors", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/dashboard$/);

  await switchViewMode(page, "Miljøarbeider");
  await ensureSidebarOpen(page);
  await expect(visibleByTestId(page, "sidebar-invitasjoner")).toHaveCount(0);
  await expect(visibleByTestId(page, "sidebar-timelister")).toBeVisible();

  await page.goto("/timesheets", { waitUntil: "domcontentloaded" });
  await expect(page.getByText("Mine innsendinger")).toBeVisible();

  await page.goto("/reports", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/dashboard$/);

  await switchViewMode(page, "Admin");
  await ensureSidebarOpen(page);
  await expect(visibleByTestId(page, "sidebar-leverandører")).toBeVisible();

  await page.goto("/vendors", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("tab-vendors")).toBeVisible();
});

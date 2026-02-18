import { test, expect } from "@playwright/test";

test.describe("Dashboard worker mobile top", () => {
  test("øverste del matcher struktur og klokken beveger seg", async ({ page }, testInfo) => {
    await page.route("**/api/auth/user", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: "smoke-worker",
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

    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });

    const topCard = page.getByTestId("worker-top-card");
    const rootCard = page.getByTestId("worker-mobile-root");
    const hand = page.getByTestId("worker-clock-hand");

    await expect(rootCard).toBeVisible();
    await expect(topCard).toBeVisible();
    await expect(hand).toBeVisible();
    await expect(page.getByText("Hei, Maria!")).toBeVisible();
    await expect(page.getByText("Du er i gang! Registreringen pågår")).toBeVisible();
    await expect(page.getByRole("button", { name: /Pause|Fortsett/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Ferdig|Lagrer/ })).toBeVisible();

    const before = await hand.getAttribute("style");
    await page.waitForTimeout(2200);
    const after = await hand.getAttribute("style");

    expect(before).not.toBeNull();
    expect(after).not.toBeNull();
    expect(after).not.toBe(before);

    await page.getByRole("button", { name: /Pause|Fortsett/ }).click();
    await expect(page.getByRole("button", { name: /Pause|Fortsett/ })).toContainText("Fortsett");
    await expect(topCard).toHaveScreenshot("worker-mobile-top-card.png", {
      animations: "disabled",
      scale: "device",
      maxDiffPixelRatio: 0.02,
    });
    await expect(rootCard).toHaveScreenshot("worker-mobile-full-card.png", {
      animations: "disabled",
      scale: "device",
      maxDiffPixelRatio: 0.03,
    });

    const screenshot = await page.screenshot({ fullPage: false });
    await testInfo.attach("worker-mobile-top", {
      body: screenshot,
      contentType: "image/png",
    });
  });
});

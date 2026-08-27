import { expect, test, type Page } from "@playwright/test";

const leader = {
  id: "archive-leader",
  email: "leder@halden.kommune.no",
  firstName: "Liv",
  lastName: "Leder",
  role: "barnevernsleder",
  vendorId: null,
  kommuneId: 7,
};

function json(body: unknown, status = 200) {
  return { status, contentType: "application/json", body: JSON.stringify(body) };
}

async function installMocks(page: Page, onConnect: (body: Record<string, unknown>) => void) {
  await page.route("**/api/**", (route) => route.fulfill(json({})));
  await page.route("**/api/csrf-token", (route) => route.fulfill(json({ token: "archive-csrf" })));
  await page.route(/\/api\/auth\/user(\?.*)?$/, (route) => route.fulfill(json(leader)));
  await page.route("**/api/profile", (route) => route.fulfill(json({
    ...leader,
    profileImageUrl: null,
    createdAt: "2026-08-27T08:00:00.000Z",
    updatedAt: "2026-08-27T08:00:00.000Z",
    phone: null,
    language: "no",
    notificationEmail: true,
    notificationPush: false,
    notificationWeekly: true,
  })));
  await page.route("**/api/portal/settings**", (route) => route.fulfill(json({ companyName: "Halden kommune" })));
  await page.route("**/api/company/users**", (route) => route.fulfill(json([])));
  await page.route("**/api/integrations/arkiv/status", (route) => route.fulfill(json({ connected: false })));
  await page.route("**/api/integrations/arkiv/connect", (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    onConnect(body);
    return route.fulfill(json({
      connected: true,
      kommuneId: 7,
      provider: "documaster",
      baseUrl: body.baseUrl,
      tokenUrl: body.tokenUrl,
      arkivdelId: body.arkivdelId,
      status: "active",
    }));
  });
}

test("barnevernsleder kan registrere separat Documaster-IDP fra innstillinger", async ({ page }) => {
  let submitted: Record<string, unknown> | null = null;
  await installMocks(page, (body) => { submitted = body; });

  await page.goto("/settings", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("arkiv-connect-card")).toBeVisible();
  await page.getByTestId("arkiv-baseurl-input").fill("https://archive.halden.example.no");
  await page.getByTestId("arkiv-tokenurl-input").fill("https://idp.halden.example.no/oauth2/token");
  await page.getByTestId("arkiv-clientid-input").fill("halden-client");
  await page.getByTestId("arkiv-clientsecret-input").fill("test-secret");
  await page.getByTestId("arkiv-arkivdel-input").fill("arkivdel-1");
  await page.getByTestId("arkiv-connect-submit").click();

  await expect.poll(() => submitted).toEqual(expect.objectContaining({
    provider: "documaster",
    baseUrl: "https://archive.halden.example.no",
    tokenUrl: "https://idp.halden.example.no/oauth2/token",
    clientId: "halden-client",
    clientSecret: "test-secret",
    arkivdelId: "arkivdel-1",
  }));
});

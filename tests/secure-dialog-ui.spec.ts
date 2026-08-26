import { expect, test, type Page, type Request } from "@playwright/test";

const MELDING_ID = "11111111-1111-4111-8111-111111111111";
const PARTY_ID = "22222222-2222-4222-8222-222222222222";
const CONVERSATION_ID = "33333333-3333-4333-8333-333333333333";
const MESSAGE_ID = "44444444-4444-4444-8444-444444444444";

const STAFF_USER = {
  id: "staff-secure-dialog",
  email: "saksbehandler@halden.kommune.no",
  firstName: "Siri",
  lastName: "Saksbehandler",
  role: "kommune_saksbehandler",
  vendorId: null,
};

const PORTAL_USER = {
  id: "portal-secure-dialog",
  email: "innbygger@example.no",
  firstName: "Ola",
  lastName: "Nordmann",
  role: "innbygger",
  vendorId: null,
};

function json(body: unknown, status = 200) {
  return { status, contentType: "application/json", body: JSON.stringify(body) };
}

function parsedBody(request: Request): Record<string, unknown> {
  return request.postDataJSON() as Record<string, unknown>;
}

async function installCommonMocks(page: Page, user: typeof STAFF_USER | typeof PORTAL_USER) {
  await page.route("**/api/csrf-token", (route) => route.fulfill(json({ token: "test-csrf-token" })));
  await page.route("**/api/auth/user", (route) => route.fulfill(json(user)));
  await page.route("**/api/portal/settings**", (route) => route.fulfill(json({ companyName: "Halden kommune" })));
  await page.route("**/api/company/users**", (route) => route.fulfill(json([])));
  await page.route("**/api/activities**", (route) => route.fulfill(json([])));
  await page.route("**/api/notifications**", (route) => route.fulfill(json([])));
  await page.route("**/api/vendor/org-info**", (route) => route.fulfill(json(null)));
  await page.route("**/api/user-state/settings**", (route) => route.fulfill(json({ onboardingCompleted: true, tourCompleted: true })));
}

test.describe("Sikker dialog", () => {
  test("kommuneansatt sender sikkert uten å sende tenant-id fra klienten", async ({ page }) => {
    await installCommonMocks(page, STAFF_USER);

    const mutationBodies: Array<{ path: string; body: Record<string, unknown> }> = [];
    let sent = false;

    await page.route("**/api/barnevern/meldinger", (route) => route.fulfill(json([{
      id: MELDING_ID,
      meldingsnummer: "BV-2026-0042",
      barnNavn: "Skjermet barn",
      status: "under_behandling",
      mottattDato: "2026-08-25T08:00:00.000Z",
    }])));

    await page.route("**/api/secure-dialog/**", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const path = url.pathname;
      const method = request.method();

      if (method === "GET" && path === "/api/secure-dialog/parties") {
        await route.fulfill(json([]));
        return;
      }
      if (method === "GET" && path === "/api/secure-dialog/conversations") {
        await route.fulfill(json(sent ? [{
          id: CONVERSATION_ID,
          kommune_id: 7,
          barnevern_melding_id: MELDING_ID,
          subject: "Møteinnkalling",
          status: "open",
          created_at: "2026-08-26T08:00:00.000Z",
          updated_at: "2026-08-26T08:00:00.000Z",
        }] : []));
        return;
      }
      if (method === "GET" && path === `/api/secure-dialog/conversations/${CONVERSATION_ID}`) {
        await route.fulfill(json({
          id: CONVERSATION_ID,
          meldingId: MELDING_ID,
          subject: "Møteinnkalling",
          status: "open",
          participants: [{ id: PARTY_ID, displayName: "Ola Nordmann", partyRole: "forelder" }],
          messages: [{
            id: MESSAGE_ID,
            senderUserId: STAFF_USER.id,
            senderPartyId: null,
            senderKind: "staff",
            content: "Du har fått en sikker møteinnkalling.",
            status: "sent",
            sentAt: "2026-08-26T08:00:00.000Z",
            createdAt: "2026-08-26T08:00:00.000Z",
            attachments: [],
          }],
        }));
        return;
      }

      if (method === "POST") {
        const body = parsedBody(request);
        mutationBodies.push({ path, body });
        if (path === "/api/secure-dialog/parties") {
          await route.fulfill(json({ id: PARTY_ID }, 201));
          return;
        }
        if (path === `/api/secure-dialog/cases/${MELDING_ID}/access`) {
          await route.fulfill(json({ id: "55555555-5555-4555-8555-555555555555" }, 201));
          return;
        }
        if (path === "/api/secure-dialog/conversations") {
          await route.fulfill(json({ id: CONVERSATION_ID, subject: "Møteinnkalling", status: "open" }, 201));
          return;
        }
        if (path === `/api/secure-dialog/conversations/${CONVERSATION_ID}/drafts`) {
          await route.fulfill(json({ id: MESSAGE_ID }, 201));
          return;
        }
        if (path === `/api/secure-dialog/messages/${MESSAGE_ID}/send`) {
          sent = true;
          await route.fulfill(json({ id: MESSAGE_ID, status: "sent" }));
          return;
        }
      }

      await route.fulfill(json({ error: "Uventet testkall" }, 500));
    });

    await page.goto("/sikker-sending");
    await expect(page.getByRole("heading", { name: "Sikker sending" }).last()).toBeVisible();
    await page.getByRole("button", { name: "Ny part" }).click();
    await page.getByTestId("secure-party-name").fill("Ola Nordmann");
    await page.getByTestId("secure-party-ssn").fill("01019012345");
    await page.getByTestId("secure-party-email").fill("ola@example.no");
    await page.getByTestId("secure-initial-file").setInputFiles({
      name: "vedlegg.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.7\nplaywright"),
    });
    await expect(page.getByText("vedlegg.pdf", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Fjern" }).click();
    await expect(page.getByText("vedlegg.pdf", { exact: true })).toHaveCount(0);
    await page.getByTestId("secure-subject").fill("Møteinnkalling");
    await page.getByTestId("secure-message").fill("Du har fått en sikker møteinnkalling.");
    await page.getByTestId("secure-create-send").click();

    await expect(page.getByText("Mottakeren får et nøytralt varsel og leser innholdet etter innlogging.", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Møteinnkalling", { exact: true }).last()).toBeVisible();
    await expect(page.getByText("Du har fått en sikker møteinnkalling.")).toBeVisible();
    expect(mutationBodies.map(({ path }) => path)).toEqual([
      "/api/secure-dialog/parties",
      `/api/secure-dialog/cases/${MELDING_ID}/access`,
      "/api/secure-dialog/conversations",
      `/api/secure-dialog/conversations/${CONVERSATION_ID}/drafts`,
      `/api/secure-dialog/messages/${MESSAGE_ID}/send`,
    ]);
    expect(mutationBodies.every(({ body }) => !("kommuneId" in body) && !("kommune_id" in body))).toBe(true);
    expect(mutationBodies[0].body).toMatchObject({
      displayName: "Ola Nordmann",
      personnummer: "01019012345",
      notificationEmail: "ola@example.no",
    });
  });

  test("innbygger leser og svarer i sikker portal", async ({ page }) => {
    await installCommonMocks(page, PORTAL_USER);
    let replyContent: string | null = null;
    let replySent = false;

    await page.route("**/api/secure-dialog/**", async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      const method = request.method();

      if (method === "GET" && path === "/api/secure-dialog/conversations") {
        await route.fulfill(json([{
          id: CONVERSATION_ID,
          kommune_id: 7,
          barnevern_melding_id: MELDING_ID,
          subject: "Møteinnkalling",
          status: "open",
          created_at: "2026-08-26T08:00:00.000Z",
          updated_at: "2026-08-26T08:00:00.000Z",
        }]));
        return;
      }
      if (method === "GET" && path === `/api/secure-dialog/conversations/${CONVERSATION_ID}`) {
        const messages = [{
          id: MESSAGE_ID,
          senderUserId: STAFF_USER.id,
          senderPartyId: null,
          senderKind: "staff",
          content: "Du har fått en sikker møteinnkalling.",
          status: "sent",
          sentAt: "2026-08-26T08:00:00.000Z",
          createdAt: "2026-08-26T08:00:00.000Z",
          attachments: [],
        }];
        if (replySent) messages.push({
          id: "66666666-6666-4666-8666-666666666666",
          senderUserId: PORTAL_USER.id,
          senderPartyId: PARTY_ID,
          senderKind: "party",
          content: replyContent ?? "",
          status: "sent",
          sentAt: "2026-08-26T09:00:00.000Z",
          createdAt: "2026-08-26T09:00:00.000Z",
          attachments: [],
        });
        await route.fulfill(json({
          id: CONVERSATION_ID,
          meldingId: MELDING_ID,
          subject: "Møteinnkalling",
          status: "open",
          participants: [{ id: PARTY_ID, displayName: "Ola Nordmann", partyRole: "forelder" }],
          messages,
        }));
        return;
      }
      if (method === "POST" && path === `/api/secure-dialog/conversations/${CONVERSATION_ID}/drafts`) {
        replyContent = String(parsedBody(request).content ?? "");
        await route.fulfill(json({ id: "66666666-6666-4666-8666-666666666666" }, 201));
        return;
      }
      if (method === "POST" && path === "/api/secure-dialog/messages/66666666-6666-4666-8666-666666666666/send") {
        replySent = true;
        await route.fulfill(json({ id: "66666666-6666-4666-8666-666666666666", status: "sent" }));
        return;
      }
      await route.fulfill(json({ error: "Uventet testkall" }, 500));
    });

    await page.goto("/innbygger");
    await expect(page.getByRole("heading", { name: "Mine sikre meldinger" })).toBeVisible();
    await expect(page.getByText("Du har fått en sikker møteinnkalling.")).toBeVisible();
    await page.getByTestId("secure-dialog-reply").fill("Takk, jeg bekrefter at jeg kommer.");
    await page.getByTestId("secure-dialog-send").click();

    await expect.poll(() => replySent).toBe(true);
    await expect(page.getByText("Takk, jeg bekrefter at jeg kommer.")).toBeVisible();
    expect(replyContent).toBe("Takk, jeg bekrefter at jeg kommer.");
  });

  test("kommuneansatt ser bare sikker sending i mobilnavigasjonen", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await installCommonMocks(page, STAFF_USER);
    await page.route("**/api/barnevern/meldinger", (route) => route.fulfill(json([])));

    await page.goto("/sikker-sending");

    const mobileNav = page.getByTestId("mobile-bottom-nav");
    await expect(mobileNav).toBeVisible();
    await expect(mobileNav.getByRole("link", { name: "Sikker sending" })).toBeVisible();
    await expect(mobileNav.getByRole("link", { name: "Dashboard" })).toHaveCount(0);
    await expect(mobileNav.getByRole("link", { name: "Timer" })).toHaveCount(0);
    await expect(mobileNav.getByRole("link", { name: "Rapporter" })).toHaveCount(0);
    await expect(mobileNav.getByRole("button", { name: "Flere navigasjonsvalg" })).toHaveCount(0);
  });

  test("innbygger får enkel eID-veiledning når innboksen avvises", async ({ page }) => {
    await installCommonMocks(page, PORTAL_USER);
    await page.route("**/api/secure-dialog/conversations", (route) => route.fulfill(json({ error: "Forbidden" }, 403)));

    await page.goto("/innbygger");

    await expect(page.getByText("Meldingene kunne ikke åpnes")).toBeVisible();
    await expect(page.getByRole("link", { name: "Logg inn med BankID" })).toHaveAttribute("href", "/api/auth/idura/login");
    await expect(page.getByRole("link", { name: "Logg inn med Buypass" })).toHaveAttribute("href", "/api/auth/buypass/login");
  });
});

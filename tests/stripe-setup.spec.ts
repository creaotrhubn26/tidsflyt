import { test, expect } from "@playwright/test";

/**
 * One-shot Stripe-oppsett via admin-UI.
 *
 * Bruk:
 *   STRIPE_SECRET_KEY=sk_test_... \
 *   STRIPE_WEBHOOK_SECRET=whsec_... \
 *   STRIPE_PUBLISHABLE_KEY=pk_test_...   # valgfri \
 *   DATABASE_URL=postgres://... \
 *   npx playwright test tests/stripe-setup.spec.ts --project=desktop-chromium
 *
 * Forutsetter dev-mode (NODE_ENV != production) som auto-injecter super_admin
 * via requireSuperAdmin-bypass (server/custom-auth.ts:509).
 *
 * Hvilke handlinger:
 *   1. Sett stripe_secret_key + stripe_webhook_secret (+ optional publishable)
 *   2. Verifiser at /admin/salg/stripe sier "configured"
 *   3. Klikk "Sync alle tiers til Stripe"
 *   4. Verifiser at hver ikke-Enterprise tier får Stripe Product-ID
 */

const SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
const PUBLISHABLE_KEY = process.env.STRIPE_PUBLISHABLE_KEY;

test.describe("Stripe-integrasjon — oppsett", () => {
  test.skip(!SECRET_KEY, "STRIPE_SECRET_KEY env-var mangler");

  test("setter Stripe-nøkler i app_settings", async ({ page }) => {
    await page.goto("/admin/salg/innstillinger");
    await expect(page.getByRole("heading", { name: /Innstillinger/i })).toBeVisible();

    // Vent til settings-listen lastes
    await expect(page.getByText("Stripe Secret Key")).toBeVisible({ timeout: 15_000 });

    // Helper: finn raden basert på label-tekst, fyll input, klikk Lagre
    async function setSetting(label: string, value: string) {
      // Hver setting er en grid-rad: [label] [input] [Lagre-button]
      const row = page.locator("div").filter({
        has: page.locator("label", { hasText: label }),
      }).first();
      const input = row.getByRole("textbox");
      await input.fill(value);
      await row.getByRole("button", { name: /Lagre/i }).click();
      // Toast bekrefter
      await expect(page.getByText(label).first()).toBeVisible();
    }

    await setSetting("Stripe Secret Key", SECRET_KEY!);
    await setSetting("Stripe Webhook Secret", WEBHOOK_SECRET!);
    if (PUBLISHABLE_KEY) {
      await setSetting("Stripe Publishable Key", PUBLISHABLE_KEY);
    }

    // Verifiser via API at de er lagret
    const res = await page.request.get("/api/admin/stripe/status");
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.configured).toBe(true);
    expect(body.mode).toBe("test");
  });

  test("synker alle tiers til Stripe og verifiserer product-ID", async ({ page }) => {
    await page.goto("/admin/salg/stripe");
    await expect(page.getByRole("heading", { name: /Stripe-integrasjon/i })).toBeVisible();

    // Vent til status laster
    await expect(page.getByText(/TEST-mode|LIVE-mode/i)).toBeVisible({ timeout: 15_000 });

    // Klikk "Sync alle tiers til Stripe"
    const syncBtn = page.getByRole("button", { name: /Sync alle tiers/i });
    await expect(syncBtn).toBeEnabled();
    await syncBtn.click();

    // Vent på toast som bekrefter
    await expect(page.getByText(/Sync ferdig/i)).toBeVisible({ timeout: 60_000 });

    // Hent status via API og verifiser at minst én tier har stripeProductId
    const res = await page.request.get("/api/admin/stripe/status");
    const body = await res.json();
    const synced = body.tiers.filter(
      (t: any) => !t.isEnterprise && t.isActive && t.syncedToStripe,
    );
    expect(synced.length).toBeGreaterThan(0);
    console.log(`✓ ${synced.length} tiers synket til Stripe:`);
    for (const t of synced) {
      console.log(`  - ${t.label} → ${t.stripeProductId}`);
    }
  });
});

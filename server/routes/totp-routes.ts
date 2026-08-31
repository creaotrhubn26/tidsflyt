import type { Express, Request, Response } from "express";
import QRCode from "qrcode";
import { authenticator, generateRecoveryCodes, hashTotpRecoveryCode, hasTotpEnrolled, verifyTotpOrRecoveryCode, encryptTotpSecret } from "../lib/totp";
import { db } from "../db";
import { adminTotpCredentials } from "@shared/schema";
import { requireAuth } from "../middleware/auth";
import { canAccessVendorApiAdmin } from "@shared/roles";
import { authRateLimit } from "../rate-limit";

// Express 4 videresender IKKE avviste promises til feilhåndtereren: en kastet
// feil i en async handler etterlater requesten hengende for alltid. Det er
// spesielt ille her — /totp-challenge er den ene siden som står mellom en
// innrullert admin og resten av produktet. Derfor try/catch i alle fire.
export function registerTotpRoutes(app: Express) {
  app.get("/api/totp/status", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = req.user as any;
      const enrolled = await hasTotpEnrolled(user.id);
      res.json({ enrolled, required: canAccessVendorApiAdmin(user.role) });
    } catch (err) {
      console.error("[totp] status feilet:", err);
      res.status(500).json({ error: "Kunne ikke hente TOTP-status" });
    }
  });

  app.post("/api/totp/setup/start", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = req.user as any;
      const secret = authenticator.generateSecret();
      const otpauthUrl = authenticator.keyuri(user.email, "Tidum", secret);
      const qrDataUrl = await QRCode.toDataURL(otpauthUrl);
      (req.session as any).pendingTotpSecret = secret;
      res.json({ qrDataUrl, secret });
    } catch (err) {
      console.error("[totp] setup/start feilet:", err);
      res.status(500).json({ error: "Kunne ikke starte TOTP-oppsett" });
    }
  });

  app.post("/api/totp/setup/confirm", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = req.user as any;
      const pendingSecret = (req.session as any).pendingTotpSecret as string | undefined;
      const { code } = req.body as { code?: string };
      if (!pendingSecret || !code || !authenticator.verify({ token: code, secret: pendingSecret })) {
        return res.status(400).json({ error: "Ugyldig kode" });
      }
      // Sjekk innrullering FØR insert — unikhetsbruddet ville ellers blitt en
      // kastet feil (og dermed en hengende request før try/catch-en over).
      if (await hasTotpEnrolled(user.id)) {
        delete (req.session as any).pendingTotpSecret;
        return res.status(409).json({ error: "TOTP er allerede satt opp for denne brukeren" });
      }
      const recoveryCodes = generateRecoveryCodes();
      await db.insert(adminTotpCredentials).values({
        userId: user.id,
        totpSecretEncrypted: encryptTotpSecret(pendingSecret),
        recoveryCodesHashed: recoveryCodes.map(hashTotpRecoveryCode),
      });
      delete (req.session as any).pendingTotpSecret;
      res.json({ recoveryCodes }); // vist ÉN gang — hentbare aldri igjen
    } catch (err) {
      console.error("[totp] setup/confirm feilet:", err);
      res.status(500).json({ error: "Kunne ikke fullføre TOTP-oppsett" });
    }
  });

  app.post("/api/totp/verify", authRateLimit, requireAuth, async (req: Request, res: Response) => {
    try {
      const user = req.user as any;
      const { code } = req.body as { code?: string };
      if (!code || !(await verifyTotpOrRecoveryCode(user.id, code))) {
        return res.status(401).json({ error: "Ugyldig kode" });
      }
      (req.session as any).totpVerified = true;
      res.json({ ok: true });
    } catch (err) {
      console.error("[totp] verify feilet:", err);
      res.status(500).json({ error: "Kunne ikke verifisere koden" });
    }
  });
}

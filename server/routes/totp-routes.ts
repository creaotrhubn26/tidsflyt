import type { Express, Request, Response } from "express";
import QRCode from "qrcode";
import { authenticator, generateRecoveryCodes, hashTotpRecoveryCode, hasTotpEnrolled, verifyTotpOrRecoveryCode, encryptTotpSecret } from "../lib/totp";
import { db } from "../db";
import { adminTotpCredentials } from "@shared/schema";
import { requireAuth } from "../middleware/auth";
import { canAccessVendorApiAdmin } from "@shared/roles";

export function registerTotpRoutes(app: Express) {
  app.get("/api/totp/status", requireAuth, async (req: Request, res: Response) => {
    const user = req.user as any;
    const enrolled = await hasTotpEnrolled(user.id);
    res.json({ enrolled, required: canAccessVendorApiAdmin(user.role) });
  });

  app.post("/api/totp/setup/start", requireAuth, async (req: Request, res: Response) => {
    const user = req.user as any;
    const secret = authenticator.generateSecret();
    const otpauthUrl = authenticator.keyuri(user.email, "Tidum", secret);
    const qrDataUrl = await QRCode.toDataURL(otpauthUrl);
    (req.session as any).pendingTotpSecret = secret;
    res.json({ qrDataUrl, secret });
  });

  app.post("/api/totp/setup/confirm", requireAuth, async (req: Request, res: Response) => {
    const user = req.user as any;
    const pendingSecret = (req.session as any).pendingTotpSecret as string | undefined;
    const { code } = req.body as { code?: string };
    if (!pendingSecret || !code || !authenticator.verify({ token: code, secret: pendingSecret })) {
      return res.status(400).json({ error: "Ugyldig kode" });
    }
    const recoveryCodes = generateRecoveryCodes();
    await db.insert(adminTotpCredentials).values({
      userId: user.id,
      totpSecretEncrypted: encryptTotpSecret(pendingSecret),
      recoveryCodesHashed: recoveryCodes.map(hashTotpRecoveryCode),
    });
    delete (req.session as any).pendingTotpSecret;
    res.json({ recoveryCodes }); // vist ÉN gang — hentbare aldri igjen
  });

  app.post("/api/totp/verify", requireAuth, async (req: Request, res: Response) => {
    const user = req.user as any;
    const { code } = req.body as { code?: string };
    if (!code || !(await verifyTotpOrRecoveryCode(user.id, code))) {
      return res.status(401).json({ error: "Ugyldig kode" });
    }
    (req.session as any).totpVerified = true;
    res.json({ ok: true });
  });
}

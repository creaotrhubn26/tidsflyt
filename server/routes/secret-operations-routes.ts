import type { Express, Request, Response } from "express";
import { requireSuperAdmin } from "../custom-auth";
import {
  getSecretRotationInventory,
  PlatformSecretRotationError,
  runPlatformSecretRotation,
} from "../lib/platform-secret-rotation";
import { getSecretBoxRuntimeStatus } from "../lib/secret-box";

function actorId(req: Request): string | null {
  const id = (req.user as { id?: unknown } | undefined)?.id;
  return typeof id === "string" && id.length > 0 ? id : null;
}

export function registerSecretOperationsRoutes(app: Express): void {
  app.get("/api/admin/security/secret-runtime", requireSuperAdmin, async (_req, res) => {
    const runtime = getSecretBoxRuntimeStatus();
    try {
      const remaining = runtime.activeKeyId
        ? await getSecretRotationInventory(runtime.activeKeyId)
        : null;
      return res.json({ runtime, remaining });
    } catch (error) {
      console.error("[secret-rotation] inventory failed", error instanceof Error ? error.message : "unknown");
      return res.status(500).json({ error: "Kunne ikke kontrollere nøkkelrotasjon" });
    }
  });

  app.post("/api/admin/security/rotate-secrets", requireSuperAdmin, async (req: Request, res: Response) => {
    if (req.body?.confirm !== "ROTATE") {
      return res.status(400).json({ error: "Krever eksplisitt confirm=ROTATE" });
    }
    const requestedLimit = req.body?.limit == null ? 100 : Number(req.body.limit);
    if (!Number.isInteger(requestedLimit) || requestedLimit < 1 || requestedLimit > 500) {
      return res.status(400).json({ error: "limit må være et heltall mellom 1 og 500" });
    }
    const initiatedBy = actorId(req);
    if (!initiatedBy && process.env.NODE_ENV === "production") {
      return res.status(403).json({ error: "Mangler identifisert operatør" });
    }

    try {
      return res.json(await runPlatformSecretRotation({
        limit: requestedLimit,
        source: "manual",
        initiatedBy: initiatedBy ?? "development-bypass",
      }));
    } catch (error) {
      if (error instanceof PlatformSecretRotationError && error.code === "NOT_CONFIGURED") {
        return res.status(503).json({ error: "Sikker nøkkelring er ikke tilgjengelig" });
      }
      if (error instanceof PlatformSecretRotationError && error.code === "INVALID_OPERATOR") {
        return res.status(403).json({ error: "Mangler identifisert operatør" });
      }
      console.error("[secret-rotation] manual run failed", error instanceof Error ? error.message : "unknown");
      return res.status(500).json({ error: "Nøkkelrotasjonen kunne ikke fullføres" });
    }
  });
}

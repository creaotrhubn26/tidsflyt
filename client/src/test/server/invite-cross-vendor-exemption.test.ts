import { describe, it, expect, vi, beforeEach } from "vitest";
import { requestDbStorage } from "../../../../server/lib/request-db-context";

// Task 9 fix-runde 1: de to offentlige invite-rutene er tvers-vendor by design
// (en invitasjon knytter en bruker til en ANNEN vendor enn den de eventuelt
// allerede tilhører). En allerede innlogget bruker som løser inn lenken kjører
// inni withVendorScopedDb sin ALS-kontekst, så handleren må kjøre utenfor den.
// Testen beviser grensen ende-til-ende gjennom den ekte registrerings-koden,
// uten database: db er mocket og noterer hvilken ALS-kontekst som var aktiv da
// spørringen faktisk ble utført.

const seenStores: Array<unknown> = [];

vi.mock("../../../../server/db", () => {
  const chain: any = {
    from: () => chain,
    where: () => chain,
    limit: () => {
      seenStores.push(requestDbStorage.getStore());
      return Promise.resolve([]);
    },
  };
  return { db: { select: () => chain } };
});
vi.mock("../../../../server/lib/email-service", () => ({ emailService: {} }));
vi.mock("../../../../server/custom-auth", () => ({ buildEmailLoginUrl: () => "" }));
vi.mock("../../../../server/middleware/auth", () => ({ requireAuth: (_r: any, _s: any, n: any) => n() }));

function captureRoutes() {
  const routes = new Map<string, Function>();
  const record = (method: string) => (path: string, ...rest: Function[]) => {
    routes.set(`${method} ${path}`, rest[rest.length - 1]);
  };
  return {
    app: { get: record("GET"), post: record("POST"), patch: record("PATCH"), delete: record("DELETE") } as any,
    routes,
  };
}

function fakeRes() {
  const res: any = {
    statusCode: 200,
    body: undefined,
    status(code: number) { res.statusCode = code; return res; },
    json(payload: unknown) { res.body = payload; return res; },
  };
  return res;
}

describe("invite-innløsning kjører utenfor ALS-konteksten", () => {
  beforeEach(() => {
    seenStores.length = 0;
  });

  const scopedCtx = { db: { tag: "vendor-A" } as any, client: {} as any };

  it("GET /api/invite/:token slår opp lenken uten vendor-scoping", async () => {
    const { app, routes } = captureRoutes();
    const { registerInviteLinkRoutes } = await import("../../../../server/routes/invite-link-routes");
    registerInviteLinkRoutes(app);

    const handler = routes.get("GET /api/invite/:token")!;
    await requestDbStorage.run(scopedCtx, async () => {
      expect(requestDbStorage.getStore()).toBe(scopedCtx);
      await handler({ params: { token: "t" } } as any, fakeRes());
    });

    expect(seenStores).toHaveLength(1);
    expect(seenStores[0]).toBeUndefined();
  });

  it("POST /api/invite/:token/accept slår opp lenken uten vendor-scoping", async () => {
    const { app, routes } = captureRoutes();
    const { registerInviteLinkRoutes } = await import("../../../../server/routes/invite-link-routes");
    registerInviteLinkRoutes(app);

    const handler = routes.get("POST /api/invite/:token/accept")!;
    await requestDbStorage.run(scopedCtx, async () => {
      await handler(
        { params: { token: "t" }, body: { email: "ny@vendor-b.no" } } as any,
        fakeRes(),
      );
    });

    expect(seenStores).toHaveLength(1);
    expect(seenStores[0]).toBeUndefined();
  });

  it("gjenoppretter konteksten etter at handleren er ferdig", async () => {
    const { app, routes } = captureRoutes();
    const { registerInviteLinkRoutes } = await import("../../../../server/routes/invite-link-routes");
    registerInviteLinkRoutes(app);

    const handler = routes.get("GET /api/invite/:token")!;
    await requestDbStorage.run(scopedCtx, async () => {
      await handler({ params: { token: "t" } } as any, fakeRes());
      expect(requestDbStorage.getStore()).toBe(scopedCtx);
    });
  });
});

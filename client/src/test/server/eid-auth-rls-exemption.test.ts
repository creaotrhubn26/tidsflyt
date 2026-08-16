import { describe, it, expect } from "vitest";
import { requestDbStorage } from "../../../../server/lib/request-db-context";

// Task 9: eID-identitetsoppslaget (resolveUserByEidIdentity i
// server/eid-auth.ts) er bevisst tvers-vendor og kjøres via
// requestDbStorage.exit(). Testen dekker selve ALS-mekanismen — den delen
// som er reelt verifiserbar uten en Postgres med policyene aktive. Full
// ende-til-ende-oppførsel under RLS kan først verifiseres etter Task 10.
describe("requestDbStorage.exit() — RLS-unntaket i eID-flyten", () => {
  const fakeCtx = { db: { tag: "scoped" } as any, client: {} as any };

  it("tømmer konteksten for varigheten av kallet og gjenoppretter den etterpå", () => {
    requestDbStorage.run(fakeCtx, () => {
      expect(requestDbStorage.getStore()).toBe(fakeCtx);
      requestDbStorage.exit(() => {
        expect(requestDbStorage.getStore()).toBeUndefined();
      });
      expect(requestDbStorage.getStore()).toBe(fakeCtx);
    });
  });

  it("holder konteksten tom gjennom hele den asynkrone kjeden inne i exit()", async () => {
    // Dette er den egenskapen fiksen faktisk hviler på: resolveUserByEidIdentity
    // gjør flere await-ede db-kall inne i exit()-callbacken, og alle må se en
    // tom kontekst — ikke bare det første, synkrone steget.
    const seen: Array<unknown> = [];
    await new Promise<void>((resolve, reject) => {
      requestDbStorage.run(fakeCtx, async () => {
        try {
          const result = await requestDbStorage.exit(async () => {
            seen.push(requestDbStorage.getStore());
            await Promise.resolve();
            seen.push(requestDbStorage.getStore());
            await new Promise((r) => setTimeout(r, 0));
            seen.push(requestDbStorage.getStore());
            return "system-connection";
          });
          expect(result).toBe("system-connection");
          expect(seen).toEqual([undefined, undefined, undefined]);
          expect(requestDbStorage.getStore()).toBe(fakeCtx);
          resolve();
        } catch (err) {
          reject(err);
        }
      });
    });
  });
});

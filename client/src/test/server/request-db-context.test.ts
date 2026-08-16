import { describe, it, expect } from "vitest";
import { requestDbStorage } from "../../../../server/lib/request-db-context";

describe("requestDbStorage (AsyncLocalStorage)", () => {
  it("er tom (undefined) utenfor en .run()-kontekst", () => {
    expect(requestDbStorage.getStore()).toBeUndefined();
  });

  it("returnerer den satte konteksten inni .run()", async () => {
    const fakeCtx = { db: {} as any, client: {} as any };
    await new Promise<void>((resolve) => {
      requestDbStorage.run(fakeCtx, () => {
        expect(requestDbStorage.getStore()).toBe(fakeCtx);
        resolve();
      });
    });
  });

  it("to samtidige kontekster lekker aldri inn i hverandre", async () => {
    const ctxA = { db: { tag: "A" } as any, client: {} as any };
    const ctxB = { db: { tag: "B" } as any, client: {} as any };

    const resultA = new Promise<string>((resolve) => {
      requestDbStorage.run(ctxA, async () => {
        await new Promise((r) => setTimeout(r, 10));
        resolve((requestDbStorage.getStore()?.db as any).tag);
      });
    });
    const resultB = new Promise<string>((resolve) => {
      requestDbStorage.run(ctxB, async () => {
        resolve((requestDbStorage.getStore()?.db as any).tag);
      });
    });

    expect(await resultB).toBe("B");
    expect(await resultA).toBe("A");
  });

  it("konteksten er tilgjengelig dypt nede i en kallkjede uten å bli sendt som parameter", async () => {
    const fakeCtx = { db: { marker: "deep" } as any, client: {} as any };
    async function deeplyNestedHelper(): Promise<string | undefined> {
      await Promise.resolve();
      return (requestDbStorage.getStore()?.db as any)?.marker;
    }
    await new Promise<void>((resolve) => {
      requestDbStorage.run(fakeCtx, async () => {
        expect(await deeplyNestedHelper()).toBe("deep");
        resolve();
      });
    });
  });
});

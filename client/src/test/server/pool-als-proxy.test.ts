import { describe, it, expect, vi } from "vitest";
import { pool, dbPool } from "../../../../server/db";
import { requestDbStorage } from "../../../../server/lib/request-db-context";

// Task 9 fix-runde 1: `pool` var tidligere eksportert som systemPool UTEN
// proxy, slik at alle 24 rå-SQL-forbrukere kjørte på tidum_system (BYPASSRLS)
// og RLS ikke fikk noen effekt for dem — uansett FORCE. Disse testene dekker
// at `pool` nå er ALS-bevisst, og at pool.connect() ikke ødelegger
// middlewarens ytre transaksjon.
function fakeCtx() {
  const client = {
    query: vi.fn().mockResolvedValue({ rows: [] }),
    release: vi.fn(),
    marker: "request-client",
  };
  return { ctx: { db: {} as any, client: client as any }, client };
}

describe("pool-eksporten er ALS-bevisst", () => {
  it("pool og dbPool er samme proxy-objekt", () => {
    expect(dbPool).toBe(pool);
  });

  it("uten ALS-kontekst peker pool på system-poolen, ikke på en request-client", () => {
    expect(requestDbStorage.getStore()).toBeUndefined();
    // Ekte pg.Pool har totalCount; en PoolClient har det ikke.
    expect(typeof (pool as any).totalCount).toBe("number");
    expect((pool as any).marker).toBeUndefined();
  });

  it("inne i ALS-konteksten går pool.query() til request-clienten", async () => {
    const { ctx, client } = fakeCtx();
    await requestDbStorage.run(ctx, async () => {
      await pool.query("SELECT 1 FROM log_row WHERE user_id = $1", ["u1"]);
    });
    expect(client.query).toHaveBeenCalledWith("SELECT 1 FROM log_row WHERE user_id = $1", ["u1"]);
  });

  it("requestDbStorage.exit() sender pool tilbake til system-tilkoblingen", async () => {
    const { ctx, client } = fakeCtx();
    await requestDbStorage.run(ctx, async () => {
      await requestDbStorage.exit(async () => {
        expect((pool as any).marker).toBeUndefined();
        expect(typeof (pool as any).totalCount).toBe("number");
      });
    });
    expect(client.query).not.toHaveBeenCalled();
  });
});

describe("pool.connect() inne i en request ødelegger ikke den ytre transaksjonen", () => {
  it("oversetter BEGIN/COMMIT til SAVEPOINT og gjør release() til en no-op", async () => {
    const { ctx, client } = fakeCtx();
    await requestDbStorage.run(ctx, async () => {
      const c = await pool.connect();
      await c.query("BEGIN");
      await c.query("DELETE FROM company_users WHERE id = $1", [1]);
      await c.query("COMMIT");
      c.release();
    });

    const sql = client.query.mock.calls.map((c: any[]) => String(c[0]));
    expect(sql[0]).toMatch(/^SAVEPOINT sp_pool_/);
    expect(sql[1]).toBe("DELETE FROM company_users WHERE id = $1");
    expect(sql[2]).toMatch(/^RELEASE SAVEPOINT sp_pool_/);
    // Et ekte COMMIT her ville avsluttet middlewarens transaksjon og droppet
    // set_config-verdiene for resten av requesten.
    expect(sql).not.toContain("COMMIT");
    expect(sql).not.toContain("BEGIN");
    // Middlewaren eier livssyklusen — dobbel release ville kastet i pg.
    expect(client.release).not.toHaveBeenCalled();
  });

  it("oversetter ROLLBACK til ROLLBACK TO SAVEPOINT", async () => {
    const { ctx, client } = fakeCtx();
    await requestDbStorage.run(ctx, async () => {
      const c = await pool.connect();
      await c.query("BEGIN");
      await c.query("ROLLBACK");
    });
    const sql = client.query.mock.calls.map((c: any[]) => String(c[0]));
    expect(sql[1]).toMatch(/^ROLLBACK TO SAVEPOINT sp_pool_/);
  });

  it("gir hvert BEGIN sitt eget savepoint-navn", async () => {
    const { ctx, client } = fakeCtx();
    await requestDbStorage.run(ctx, async () => {
      const a = await pool.connect();
      await a.query("BEGIN");
      await a.query("COMMIT");
      const b = await pool.connect();
      await b.query("BEGIN");
      await b.query("COMMIT");
    });
    const names = client.query.mock.calls
      .map((c: any[]) => String(c[0]))
      .filter((s: string) => s.startsWith("SAVEPOINT "));
    expect(names).toHaveLength(2);
    expect(names[0]).not.toBe(names[1]);
  });
});

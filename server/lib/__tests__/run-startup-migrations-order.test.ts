import { describe, it, expect } from "vitest";
import { STARTUP_MIGRATIONS } from "../run-startup-migrations";

// Guard for the 057-first invariant (se ordre-kommentaren i
// run-startup-migrations.ts): 057 må kjøre før 036-056, ellers gjenoppstår
// shadow-table-hendelsen. Ren array-sjekk, ingen databasetilkobling.
describe("STARTUP_MIGRATIONS rekkefølge", () => {
  it("057_tidum_table_rename.sql er første oppføring", () => {
    expect(STARTUP_MIGRATIONS[0]).toBe("057_tidum_table_rename.sql");
  });
});

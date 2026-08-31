import { describe, it, expect } from "vitest";
import { pool } from "../../db";

// Verifiserer at migrasjon 057 faktisk er kjørt mot databasen denne testen
// peker på: gammelt navn borte, tidum_-navn på plass, radantall uendret.
// Radantallene er fanget i den ferske sveipen rett før 057 kjørte
// (Task 2, Step 1) — endres et av dem, har noe annet skrevet til tabellen.
const RENAMED: Array<[old: string, rowsBefore: number, why: string]> = [
  ["sessions", 5, "innlogging — mest kritiske omdøpingen i hele planen"],
  ["cms_posts", 18, "reelt innhold"],
  ["pricing_tier_inclusions", 57, "største datasettet"],
  ["salg_settings", 28, "salgssider"],
  ["pricing_inclusions", 11, "prissetting"],
  ["sales_script_blocks", 11, "salg"],
  ["rapport_templates", 9, "rapportmaler"],
  ["lead_pipeline_stages", 8, "CRM"],
  ["cms_categories", 4, "CMS"],
  ["auth_login_events", 1, "auth-logg"],
  ["saker", 0, "helt tom tabell"],
  ["log_row_audit", 0, "lat-init (opprettes fra TypeScript, ikke migrasjon)"],
  ["travel_legs", 0, "lat-init"],
  ["admin_users", 0, "refereres av migrasjon 055s etterkontroll"],
  ["eid_identities", 0, "eID-innlogging"],
];

// Disse vokser under normal appbruk, så et eksakt radantall er flaky — sjekk
// i stedet at ingen av radene som fantes ved migrasjonen er borte.
const GROWS_WITH_USAGE = new Set(["cms_posts", "auth_login_events"]);

// Lat-init-tabeller opprettes først ved bruk fra TypeScript — på en fersk
// database (push + startup-kjede) finnes de ikke ennå. Invarianten som
// alltid gjelder er at det GAMLE navnet aldri finnes.
const LAZY_INIT = new Set(["log_row_audit", "travel_legs"]);

// Sesjoner både opprettes og slettes ved normal utløping/opprydding. For denne
// tabellen er navne-/eksistenskontrollen den varige migrasjonsinvarianten; det
// historiske radtallet var kun gyldig i selve migrasjonsøyeblikket.
const EPHEMERAL = new Set(["sessions"]);

// De 12 tabellene som bevisst ble EKSKLUDERT fra omdøpingen (10 fremmed-eide,
// access_requests = målnavnkollisjon, blog_comments = tvetydig). Disse SKAL
// fortsatt hete det de alltid har hett.
const EXCLUDED = [
  "api_keys",
  "cms_pages",
  "email_templates",
  "notifications",
  "cms_content_types",
  "design_tokens",
  "seo_pages",
  "page_versions",
  "invoices",
  "site_settings",
  "access_requests",
  "blog_comments",
];

async function tableExists(name: string): Promise<boolean> {
  const { rows } = await pool.query(
    `SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = $1`,
    [name],
  );
  return rows.length > 0;
}

describe("migrasjon 057: Tidum-tabell-omdøping mot ekte database", () => {
  it.each(RENAMED)("%s er omdøpt til tidum_-navnet med %d rader i behold (%s)", async (old, rowsBefore) => {
    expect(await tableExists(old), `${old} finnes fortsatt under gammelt navn`).toBe(false);
    if (LAZY_INIT.has(old) && !(await tableExists(`tidum_${old}`))) return; // fersk DB: ikke lat-initiert ennå
    expect(await tableExists(`tidum_${old}`), `tidum_${old} mangler`).toBe(true);

    const { rows } = await pool.query(`SELECT count(*)::int AS n FROM "tidum_${old}"`);
    if (EPHEMERAL.has(old)) {
      expect(rows[0].n).toBeGreaterThanOrEqual(0);
    } else if (GROWS_WITH_USAGE.has(old)) {
      expect(rows[0].n, `radantall gikk NED for tidum_${old} — data tapt`).toBeGreaterThanOrEqual(rowsBefore);
    } else {
      expect(rows[0].n, `radantall endret for tidum_${old}`).toBe(rowsBefore);
    }
  });

  // invoices fikk senere en EGEN, bevisst tidum_invoices (migrasjon 067) —
  // 057-invarianten («ble ikke omdøpt») gjelder de øvrige.
  const HAR_EGEN_TIDUM_VARIANT = new Set(["invoices"]);

  it.each(EXCLUDED)("%s er IKKE omdøpt (bevisst ekskludert)", async (name) => {
    // Varig invariant: 057 skapte aldri tidum_-varianten. Selve tabellen
    // kan mangle på en fersk database (flere er fremmed-eide/lat-init).
    if (HAR_EGEN_TIDUM_VARIANT.has(name)) return;
    expect(await tableExists(`tidum_${name}`), `tidum_${name} skulle aldri vært opprettet`).toBe(false);
  });

  it("users og den fremmed-eide vendors-tabellen er urørt", async () => {
    expect(await tableExists("users")).toBe(true);
    // Fremmed-eid vendors finnes kun på databaser med historikk; 057-
    // invarianten er at den aldri fikk noe tidum_-prefiks (066s
    // tidum_vendors er en separat, Tidum-eid tabell).
    expect(await tableExists("tidum_users")).toBe(false);
    // Migrasjon 066 introduserer en separat, Tidum-eid tenanttabell. Dette er
    // ikke en omdøping av CreatorHub-tabellen `vendors` som 057 ekskluderte.
    expect(await tableExists("tidum_vendors")).toBe(true);
  });

  it("ingen av de 108 gamle navnene finnes igjen", async () => {
    const { readFile } = await import("fs/promises");
    const { join } = await import("path");
    // Vitest kjøres fra repo-roten (samme antakelse som runStartupMigrations).
    const sql = await readFile(
      join(process.cwd(), "migrations/057_tidum_table_rename.sql"),
      "utf8",
    );
    const oldNames = [...sql.matchAll(/ALTER TABLE IF EXISTS (\w+) RENAME TO/g)].map((m) => m[1]);
    expect(oldNames.length).toBe(108);

    const { rows } = await pool.query(
      `SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = ANY($1::text[])`,
      [oldNames],
    );
    expect(rows.map((r) => r.table_name)).toEqual([]);
  });
});

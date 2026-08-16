// scripts/audit-db-consumers.ts
//
// Første, mekaniske pass av RLS-klassifiseringen (Task 9 i
// docs/superpowers/plans/2026-08-15-g10-sikkerhetsherding.md).
//
// Output er et FORSLAG, ikke en fasit. Filer som snakker med databasen via rå
// SQL (pool.query / client.query / db.execute(sql`...`)) uten et treff på et
// navngitt Drizzle-tabellobjekt merkes eksplisitt "MANUELL GJENNOMGANG
// PÅKREVD" — de skal leses i sin helhet, ikke antas trygge.
//
// Kjør:
//   grep -rl "from ['\"].*/db['\"]" server/ \
//     | grep -v "\.test\.\|database-config\|/db\.ts$" | sort > /tmp/db-consumers.txt
//   npx tsx scripts/audit-db-consumers.ts /tmp/db-consumers.txt

import { readFileSync } from "fs";

// De 26 vendor-scopede tabellene med RLS-policy i
// migrations/052_rls_roles_and_policies.sql, som [drizzle-eksport, sql-navn].
// Hold denne listen i synk med migrasjonen.
const VENDOR_SCOPED_TABLES: Array<[string, string]> = [
  ["companies", "companies"],
  ["companyUsers", "company_users"],
  ["projectInfo", "project_info"],
  ["logRow", "log_row"],
  ["rapportTemplates", "rapport_templates"],
  ["vendorInstitutions", "vendor_institutions"],
  ["vendorIntegrations", "vendor_integrations"],
  ["imports", "imports"],
  ["vendorSeatLog", "vendor_seat_log"],
  ["apiKeys", "api_keys"],
  ["apiUsageLog", "api_usage_log"],
  ["caseReports", "case_reports"],
  ["feedbackRequests", "feedback_requests"],
  ["feedbackResponses", "feedback_responses"],
  ["timesheetSubmissions", "timesheet_submissions"],
  ["vendorInviteLinks", "vendor_invite_links"],
  ["rapportAvvik", "rapport_avvik"],
  ["vendorAvvikProtokoller", "vendor_avvik_protokoller"],
  ["vendorTemplates", "vendor_templates"],
  ["saker", "saker"],
  ["users", "users"],
  ["adminUsers", "admin_users"],
  ["accessRequests", "access_requests"],
  ["reportTemplates", "report_templates"],
  ["integrationInterestPrimary", "integration_interest_primary"],
  ["integrationInterestSignals", "integration_interest_signals"],
];

const listFile = process.argv[2] ?? "/tmp/db-consumers.txt";
const files = readFileSync(listFile, "utf8").trim().split("\n").filter(Boolean);

for (const file of files) {
  const content = readFileSync(file, "utf8");

  // Rå SQL: pool.query(...), client.query(...), db.execute(sql`...`)
  const usesRawSql = /\b(pool|client)\.query\(|\.execute\(\s*sql/.test(content);

  const namedHits = VENDOR_SCOPED_TABLES.filter(([ident]) =>
    new RegExp(`\\b${ident}\\b`).test(content),
  ).map(([ident]) => ident);
  // Rå snake_case-tabellnavn inne i SQL-strenger — fanger mønsteret som et
  // rent identifikator-søk bommer på (log-row-audit.ts, timesheet-lock.ts).
  const rawHits = VENDOR_SCOPED_TABLES.filter(([, sqlName]) =>
    new RegExp(`\\b${sqlName}\\b`).test(content),
  ).map(([, sqlName]) => sqlName);

  const touchesVendorTable = namedHits.length > 0 || rawHits.length > 0;
  const looksLikeAuthInfra =
    /mobile-auth|custom-auth|eid-auth|buypass-auth|replit_integrations\/auth/.test(file);
  const looksLikeBackgroundJob = /cron|seed|migration/.test(file);

  let verdict: string;
  if (usesRawSql && namedHits.length === 0) {
    verdict = "MANUELL GJENNOMGANG PÅKREVD (rå SQL, ingen navngitt tabell funnet)";
  } else if (looksLikeAuthInfra) {
    verdict = "FORVENTET: auth-infrastruktur (tidum_system)";
  } else if (looksLikeBackgroundJob) {
    verdict = "FORVENTET: bakgrunnsjobb (tidum_system, kjører aldri i request-kontekst)";
  } else if (!touchesVendorTable) {
    verdict = "FORVENTET: ingen vendor-scopet tabell (RLS irrelevant)";
  } else {
    verdict = "FORVENTET: forretningslogikk mot vendor-scopet tabell (automatisk RLS-håndhevet, ingen kodeendring)";
  }

  const hits = [...new Set([...namedHits, ...rawHits])].join(",") || "-";
  console.log(`${file}\t${verdict}\traw=${usesRawSql}\ttables=${hits}`);
}

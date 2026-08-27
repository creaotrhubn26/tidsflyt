// Bevisst uten kommuneId i denne runden. En fremtidig kommune-scopet
// autorisasjonssjekk MÅ hente kommuneId på nytt fra `users` via req.user.id
// (aldri stole på en verdi som kunne ligget her) og MÅ feile lukket
// (nekte, ikke tillate) hvis den mangler. Se
// .superpowers/sdd/2026-08-23-kommune-tenant-roller/progress.md, "Final
// whole-branch review: CRITICAL privilege escalation found", finding 3.
export interface AuthUser {
  id: string;
  email: string;
  name: string;
  profileImageUrl: string | null;
  provider: string;
  role: string;
  vendorId: number | null;
}

-- Migration 045: backfill company_users.vendor_id
--
-- Pre-T17 var det en eksisterende inkonsistens: import-flyten (T13) satt både
-- company_id og vendor_id, mens de eldre invite-endepunktene (POST /api/company/users,
-- /bulk, /api/vendors/:id/admins, syncApprovedPortalUser, prototype-tester convert)
-- bare satt company_id. Det betydde at processVendorSeatOverrun (som teller på
-- vendor_id) var blind for manuelt inviterte brukere — både i daglig cron og i
-- T17 insert-time-hooks.
--
-- Konvensjonen i kodebasen er at company_id == vendor_id (jf.
-- syncCompanyUserToPortalAccess som setter users.vendor_id = companyId).
-- Denne migrasjonen normaliserer eksisterende data slik at T13–T17 fungerer
-- helhetlig fra dag én etter deploy.

UPDATE company_users
SET vendor_id = company_id
WHERE vendor_id IS NULL;

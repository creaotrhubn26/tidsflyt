-- migrations/103_push_parity_secret_rotation.sql
-- Push-paritet for 082 og 067: bygges databasen med drizzle db:push først, lager
-- push-en tidum_secret_rotation_runs UTEN check-vaktene, og 082s
-- CREATE TABLE IF NOT EXISTS hopper da over dem. Legg vaktene idempotent
-- så begge byggeveier ender identisk (samme mønster som 099).

BEGIN;

ALTER TABLE tidum_secret_rotation_runs DROP CONSTRAINT IF EXISTS tidum_secret_rotation_runs_source_check;
ALTER TABLE tidum_secret_rotation_runs ADD CONSTRAINT tidum_secret_rotation_runs_source_check
  CHECK (rotation_source IN ('manual', 'scheduled'));

ALTER TABLE tidum_secret_rotation_runs DROP CONSTRAINT IF EXISTS tidum_secret_rotation_runs_status_check;
ALTER TABLE tidum_secret_rotation_runs ADD CONSTRAINT tidum_secret_rotation_runs_status_check
  CHECK (status IN ('completed', 'failed'));

ALTER TABLE tidum_secret_rotation_runs DROP CONSTRAINT IF EXISTS tidum_secret_rotation_runs_active_key_check;
ALTER TABLE tidum_secret_rotation_runs ADD CONSTRAINT tidum_secret_rotation_runs_active_key_check
  CHECK (active_key_id ~ '^[A-Za-z0-9._-]{1,64}$');

ALTER TABLE tidum_secret_rotation_runs DROP CONSTRAINT IF EXISTS tidum_secret_rotation_runs_counts_check;
ALTER TABLE tidum_secret_rotation_runs ADD CONSTRAINT tidum_secret_rotation_runs_counts_check
  CHECK (jsonb_typeof(rotated_counts) = 'object' AND jsonb_typeof(remaining_counts) = 'object');

ALTER TABLE tidum_secret_rotation_runs DROP CONSTRAINT IF EXISTS tidum_secret_rotation_runs_manual_actor_check;
ALTER TABLE tidum_secret_rotation_runs ADD CONSTRAINT tidum_secret_rotation_runs_manual_actor_check
  CHECK (rotation_source <> 'manual' OR initiated_by IS NOT NULL);

-- 067-paritet: push lagde tidum_invoice_items uten FK/checks. Rader som
-- peker på slettede fakturaer er nettopp skaden av den manglende
-- CASCADE-en — de er utilgjengelige for applikasjonen og fjernes før
-- FK-en kan legges på.
DELETE FROM tidum_invoice_items items
 WHERE NOT EXISTS (SELECT 1 FROM tidum_invoices inv WHERE inv.id = items.invoice_id);
ALTER TABLE tidum_invoice_items DROP CONSTRAINT IF EXISTS tidum_invoice_items_invoice_id_fkey;
ALTER TABLE tidum_invoice_items ADD CONSTRAINT tidum_invoice_items_invoice_id_fkey
  FOREIGN KEY (invoice_id) REFERENCES tidum_invoices(id) ON DELETE CASCADE;
ALTER TABLE tidum_invoice_items DROP CONSTRAINT IF EXISTS tidum_invoice_items_amounts_check;
ALTER TABLE tidum_invoice_items ADD CONSTRAINT tidum_invoice_items_amounts_check
  CHECK (quantity >= 0 AND unit_price >= 0 AND amount >= 0);

COMMIT;

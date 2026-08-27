import { randomUUID } from "crypto";
import type { PoolClient } from "pg";
import { hashSsn } from "./eid-hash";

export type ProvisionedSecurePartyIdentity = {
  portalUserId: string;
  ssnHash: string;
  alreadyEidLinked: boolean;
};

/**
 * Resolve or create the eID-only portal account for a verified future party.
 * The raw national identity number exists only in this call stack and is
 * immediately replaced by its HMAC. Email is deliberately not written to
 * users.email, so it can never become an authentication identifier.
 */
export async function provisionSecurePartyIdentity(
  client: PoolClient,
  input: { personnummer: string; displayName: string },
): Promise<ProvisionedSecurePartyIdentity> {
  const normalizedSsn = input.personnummer.replace(/\s+/g, "");
  if (!/^\d{11}$/.test(normalizedSsn)) throw new Error("INVALID_SSN");
  const ssnHash = hashSsn(normalizedSsn);

  // Serializes concurrent invitations for the same identity without ever
  // storing or locking on the raw identity number.
  await client.query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [ssnHash]);

  const linked = await client.query(
    `SELECT user_id
       FROM tidum_eid_identities
      WHERE ssn_hash = $1
      ORDER BY created_at
      LIMIT 1`,
    [ssnHash],
  );
  if (linked.rows[0]?.user_id) {
    return { portalUserId: String(linked.rows[0].user_id), ssnHash, alreadyEidLinked: true };
  }

  const expected = await client.query(
    `SELECT id FROM users WHERE expected_ssn_hash = $1 LIMIT 1`,
    [ssnHash],
  );
  if (expected.rows[0]?.id) {
    return { portalUserId: String(expected.rows[0].id), ssnHash, alreadyEidLinked: false };
  }

  const portalUserId = randomUUID();
  const names = input.displayName.trim().split(/\s+/);
  const firstName = names.shift() || "Innbygger";
  const lastName = names.join(" ") || null;
  await client.query(
    `INSERT INTO users
       (id, username, password, email, first_name, last_name, role, vendor_id, kommune_id, expected_ssn_hash)
     VALUES ($1, $2, 'unused-eid-only', NULL, $3, $4, 'innbygger', NULL, NULL, $5)`,
    [portalUserId, `portal-${portalUserId}`, firstName, lastName, ssnHash],
  );

  return { portalUserId, ssnHash, alreadyEidLinked: false };
}

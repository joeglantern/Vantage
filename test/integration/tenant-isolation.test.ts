/**
 * Row level security, verified with an actual cross-tenant read attempt.
 *
 * The org-scoped repository layer is the primary mechanism. This is the
 * backstop, and docs/05 is blunt about why it exists: application-only
 * isolation is one forgotten WHERE clause away from showing one NGO another
 * NGO's beneficiaries.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  assumeAppRole,
  inRolledBackTransaction,
  seed,
  setCurrentOrg,
  startTestDatabase,
  type Fixtures,
  type TestDatabase,
} from './support/database.js';

let db: TestDatabase;
let fixtures: Fixtures;

beforeAll(async () => {
  db = await startTestDatabase();
  const client = await db.pool.connect();
  try {
    fixtures = await seed(client);
    // A recipient belonging to the other tenant, so there is something to leak.
    await client.query(
      `INSERT INTO recipient (id, organisation_id, msisdn, full_name)
       VALUES (gen_random_uuid(), $1, '254722000001', 'Other Org Person')`,
      [fixtures.otherOrganisationId],
    );
  } finally {
    client.release();
  }
});

afterAll(async () => {
  await db?.stop();
});

describe('with a tenant set', () => {
  it('shows only that tenant’s recipients', async () => {
    await inRolledBackTransaction(db.pool, async (client) => {
      await setCurrentOrg(client, fixtures.organisationId);

      // Deliberately no WHERE clause. This is the forgotten-filter case.
      const rows = await client.query<{ organisation_id: string }>(
        'SELECT organisation_id FROM recipient',
      );

      expect(rows.rowCount).toBeGreaterThan(0);
      for (const row of rows.rows) {
        expect(row.organisation_id).toBe(fixtures.organisationId);
      }
    });
  });

  it('returns nothing when asked directly for another tenant’s rows', async () => {
    await inRolledBackTransaction(db.pool, async (client) => {
      await setCurrentOrg(client, fixtures.organisationId);
      const rows = await client.query(
        'SELECT * FROM recipient WHERE organisation_id = $1',
        [fixtures.otherOrganisationId],
      );
      expect(rows.rowCount).toBe(0);
    });
  });

  it('refuses to write a row belonging to another tenant', async () => {
    await inRolledBackTransaction(db.pool, async (client) => {
      await setCurrentOrg(client, fixtures.organisationId);
      // WITH CHECK on the policy: you cannot plant a row in someone else's
      // tenant either, which is the half people forget.
      await expect(
        client.query(
          `INSERT INTO recipient (id, organisation_id, msisdn, full_name)
           VALUES (gen_random_uuid(), $1, '254733000001', 'Planted')`,
          [fixtures.otherOrganisationId],
        ),
      ).rejects.toThrow(/row-level security/i);
    });
  });

  it('cannot see another tenant’s audit chain', async () => {
    await inRolledBackTransaction(db.pool, async (client) => {
      await setCurrentOrg(client, fixtures.otherOrganisationId);
      const rows = await client.query(
        'SELECT * FROM audit_event WHERE organisation_id = $1',
        [fixtures.organisationId],
      );
      expect(rows.rowCount).toBe(0);
    });
  });
});

describe('with no tenant set', () => {
  it('fails closed and shows nothing at all', async () => {
    await inRolledBackTransaction(db.pool, async (client) => {
      await assumeAppRole(client);

      // app.current_org unset. current_setting returns NULL, the predicate is
      // NULL, no row qualifies. An unscoped query returning everything would be
      // the breach; returning nothing is the correct failure.
      const tables = [
        'recipient',
        'payout_batch',
        'payout_item',
        'ledger_entry',
        'audit_event',
        'payout_channel',
      ];
      for (const table of tables) {
        const rows = await client.query(`SELECT * FROM ${table}`);
        expect(rows.rowCount, table).toBe(0);
      }
    });
  });
});

describe('coverage of the policy itself', () => {
  it('has RLS enabled and forced on every tenant-scoped table', async () => {
    // FORCE matters: without it the table owner bypasses its own policies, and
    // the application often connects as the owner.
    const expected = [
      'audit_checkpoint',
      'audit_event',
      'gateway_message',
      'ledger_entry',
      'membership',
      'payout_batch',
      'payout_channel',
      'payout_item',
      'programme',
      'recipient',
      'recipient_key',
      'reconciliation_pack',
    ];

    const rows = await db.pool.query<{ relname: string; relrowsecurity: boolean; relforcerowsecurity: boolean }>(
      `SELECT relname, relrowsecurity, relforcerowsecurity
         FROM pg_class
        WHERE relnamespace = 'public'::regnamespace
          AND relkind = 'r'
          AND relname = ANY($1)`,
      [expected],
    );

    expect(rows.rows).toHaveLength(expected.length);
    for (const row of rows.rows) {
      expect(row.relrowsecurity, `${row.relname} RLS enabled`).toBe(true);
      expect(row.relforcerowsecurity, `${row.relname} RLS forced`).toBe(true);
    }
  });

  it('leaves organisation and user unscoped, deliberately', async () => {
    // organisation has no organisation_id to filter on, and user is global:
    // one person can hold memberships in several organisations. Isolation for
    // both is by membership, not by row policy.
    const rows = await db.pool.query<{ relrowsecurity: boolean }>(
      `SELECT relrowsecurity FROM pg_class
        WHERE relnamespace = 'public'::regnamespace AND relname IN ('organisation', 'user')`,
    );
    for (const row of rows.rows) {
      expect(row.relrowsecurity).toBe(false);
    }
  });
});

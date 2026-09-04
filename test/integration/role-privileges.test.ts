/**
 * docs/05 asks for least-privilege database roles: the application role cannot
 * DROP, and RLS is enforced rather than bypassed by ownership.
 *
 * The point of these tests is that the guardrails cannot be removed by the role
 * that runs the application. An attacker who reaches the app's connection
 * should not be one ALTER TABLE away from turning the append-only triggers off.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  assumeAppRole,
  inRolledBackTransaction,
  seed,
  startTestDatabase,
  type TestDatabase,
} from './support/database.js';

let db: TestDatabase;

beforeAll(async () => {
  db = await startTestDatabase();
  const client = await db.pool.connect();
  try {
    await seed(client);
  } finally {
    client.release();
  }
});

afterAll(async () => {
  await db?.stop();
});

describe('the application role', () => {
  it('cannot drop a table', async () => {
    await inRolledBackTransaction(db.pool, async (client) => {
      await assumeAppRole(client);
      await expect(client.query('DROP TABLE payout_item')).rejects.toThrow(
        /must be owner|permission denied/i,
      );
    });
  });

  it('cannot disable the append-only triggers', async () => {
    await inRolledBackTransaction(db.pool, async (client) => {
      await assumeAppRole(client);
      await expect(
        client.query('ALTER TABLE audit_event DISABLE TRIGGER audit_event_append_only'),
      ).rejects.toThrow(/must be owner|permission denied/i);
    });
  });

  it('cannot turn off row level security', async () => {
    await inRolledBackTransaction(db.pool, async (client) => {
      await assumeAppRole(client);
      await expect(client.query('ALTER TABLE recipient DISABLE ROW LEVEL SECURITY')).rejects.toThrow(
        /must be owner|permission denied/i,
      );
    });
  });

  it('cannot drop a policy', async () => {
    await inRolledBackTransaction(db.pool, async (client) => {
      await assumeAppRole(client);
      await expect(
        client.query('DROP POLICY recipient_tenant_isolation ON recipient'),
      ).rejects.toThrow(/must be owner|permission denied/i);
    });
  });

  it('cannot read pg_authid', async () => {
    await inRolledBackTransaction(db.pool, async (client) => {
      await assumeAppRole(client);
      await expect(client.query('SELECT rolpassword FROM pg_authid')).rejects.toThrow(
        /permission denied/i,
      );
    });
  });

  it('holds no BYPASSRLS attribute and is not a superuser', async () => {
    const row = await db.pool.query<{ rolsuper: boolean; rolbypassrls: boolean }>(
      'SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = $1',
      ['vantage_app'],
    );
    expect(row.rows[0]?.rolsuper).toBe(false);
    expect(row.rows[0]?.rolbypassrls).toBe(false);
  });

  it('can still do the ordinary work of the application', async () => {
    // Least privilege that blocks the app from functioning is not a control,
    // it is an outage. DML must still work.
    await inRolledBackTransaction(db.pool, async (client) => {
      const org = await client.query<{ id: string }>(
        'SELECT id FROM organisation ORDER BY name LIMIT 1',
      );
      const organisationId = org.rows[0]?.id ?? '';

      await client.query('SELECT set_config($1, $2, true)', ['app.current_org', organisationId]);
      await assumeAppRole(client);

      const inserted = await client.query(
        `INSERT INTO recipient (id, organisation_id, msisdn, full_name)
         VALUES (gen_random_uuid(), $1, '254799000001', 'New Person')`,
        [organisationId],
      );
      expect(inserted.rowCount).toBe(1);

      const read = await client.query('SELECT id FROM recipient');
      expect(read.rowCount).toBeGreaterThan(0);
    });
  });
});

describe('the migrator role', () => {
  it('exists and may bypass RLS, which is the named exemption', async () => {
    // The nightly chain verifier and the migrations legitimately read across
    // tenants. That is deliberate and auditable, unlike bypassing by accident
    // because the app happened to connect as the owner.
    const row = await db.pool.query<{ rolbypassrls: boolean; rolcanlogin: boolean }>(
      'SELECT rolbypassrls, rolcanlogin FROM pg_roles WHERE rolname = $1',
      ['vantage_migrator'],
    );
    expect(row.rows[0]?.rolbypassrls).toBe(true);
    // NOLOGIN and password-less: granting LOGIN is a per-environment operator
    // step, so no credential is ever committed.
    expect(row.rows[0]?.rolcanlogin).toBe(false);
  });
});

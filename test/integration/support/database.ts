/**
 * A real PostgreSQL, started per test file, with the real migration applied.
 *
 * These tests exist to prove that the constraints actually bite. Mocking the
 * database would prove only that the mock agrees with the test, which is not
 * the question. Every assertion here is about what Postgres refuses to do.
 */
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const MIGRATIONS_DIR = fileURLToPath(new URL('../../../prisma/migrations', import.meta.url));

/**
 * Every migration, in the order prisma migrate deploy would apply them.
 *
 * Reading the directory rather than naming a file matters: a hardcoded path
 * silently stops covering the schema the moment somebody adds a migration, and
 * the tests keep passing against a database that no longer resembles
 * production. Timestamp-prefixed directory names sort lexicographically into
 * chronological order, which is the whole point of the naming convention.
 */
function migrationsInOrder(): string[] {
  return readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
    .map((name) => readFileSync(join(MIGRATIONS_DIR, name, 'migration.sql'), 'utf8'));
}

/** A checked-out connection. Named so tests do not have to unwrap pg overloads. */
export type DbClient = pg.PoolClient;

export interface TestDatabase {
  readonly pool: pg.Pool;
  readonly url: string;
  stop(): Promise<void>;
}

export async function startTestDatabase(): Promise<TestDatabase> {
  const container: StartedPostgreSqlContainer = await new PostgreSqlContainer('postgres:17-alpine')
    .withDatabase('vantage_test')
    .withUsername('vantage')
    .withPassword('vantage')
    .start();

  const url = container.getConnectionUri();
  const pool = new pg.Pool({ connectionString: url, max: 8 });

  for (const migration of migrationsInOrder()) {
    await pool.query(migration);
  }

  return {
    pool,
    url,
    async stop() {
      await pool.end();
      await container.stop();
    },
  };
}

/** Runs a callback inside a transaction that is always rolled back. */
export async function inRolledBackTransaction<T>(
  pool: pg.Pool,
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    return await fn(client);
  } finally {
    await client.query('ROLLBACK');
    client.release();
  }
}

/**
 * Drops to the least-privilege application role for the rest of the
 * transaction.
 *
 * This matters more than it looks. A superuser, and any role holding BYPASSRLS,
 * ignores row level security entirely no matter what FORCE says on the table.
 * Testing isolation while connected as the container superuser would prove
 * nothing at all, so the tests connect the way production must: as vantage_app,
 * which can run DML and nothing else.
 */
export async function assumeAppRole(client: pg.PoolClient): Promise<void> {
  await client.query('SET LOCAL ROLE vantage_app');
}

/**
 * Sets the tenant for the current transaction, which is what the RLS policies
 * read, and drops to the application role so those policies actually apply.
 * Unset means no rows are visible, by design.
 */
export async function setCurrentOrg(client: pg.PoolClient, organisationId: string): Promise<void> {
  await client.query('SELECT set_config($1, $2, true)', ['app.current_org', organisationId]);
  await assumeAppRole(client);
}

export interface Fixtures {
  organisationId: string;
  otherOrganisationId: string;
  preparerId: string;
  approverId: string;
  programmeId: string;
  channelId: string;
  recipientId: string;
  otherRecipientId: string;
}

/**
 * Inserts a minimal working world. Runs with RLS bypassed, the way a migration
 * or a seed script would; the tests then re-enter as a tenant.
 */
export async function seed(client: pg.PoolClient): Promise<Fixtures> {
  const rows = await client.query<{ id: string }>(
    `INSERT INTO organisation (id, name) VALUES
       (gen_random_uuid(), 'Youth Network'),
       (gen_random_uuid(), 'Other NGO')
     RETURNING id`,
  );
  const organisationId = rows.rows[0]?.id ?? '';
  const otherOrganisationId = rows.rows[1]?.id ?? '';

  const users = await client.query<{ id: string }>(
    `INSERT INTO "user" (id, email, password_hash) VALUES
       (gen_random_uuid(), 'preparer@example.test', 'argon2id$dummy'),
       (gen_random_uuid(), 'approver@example.test', 'argon2id$dummy')
     RETURNING id`,
  );
  const preparerId = users.rows[0]?.id ?? '';
  const approverId = users.rows[1]?.id ?? '';

  const programme = await client.query<{ id: string }>(
    `INSERT INTO programme (id, organisation_id, name)
     VALUES (gen_random_uuid(), $1, 'Cohort 3 stipends') RETURNING id`,
    [organisationId],
  );

  const channel = await client.query<{ id: string }>(
    `INSERT INTO payout_channel
       (id, organisation_id, label, kind, shortcode, initiator_name,
        credentials_ciphertext, credentials_key_id, callback_secret)
     VALUES (gen_random_uuid(), $1, 'Main shortcode', 'mpesa_b2c', '000000',
             'api_initiator', '\\x00'::bytea, 'local-dev-1', 'unguessable')
     RETURNING id`,
    [organisationId],
  );

  const recipients = await client.query<{ id: string }>(
    `INSERT INTO recipient (id, organisation_id, msisdn, full_name) VALUES
       (gen_random_uuid(), $1, '254712345678', 'Amina Wanjiru'),
       (gen_random_uuid(), $1, '254712345679', 'Peter Kimani')
     RETURNING id`,
    [organisationId],
  );

  return {
    organisationId,
    otherOrganisationId,
    preparerId,
    approverId,
    programmeId: programme.rows[0]?.id ?? '',
    channelId: channel.rows[0]?.id ?? '',
    recipientId: recipients.rows[0]?.id ?? '',
    otherRecipientId: recipients.rows[1]?.id ?? '',
  };
}

export async function insertBatch(
  client: pg.PoolClient,
  fixtures: Fixtures,
  overrides: { status?: string; reference?: string; approvedBy?: string | null } = {},
): Promise<string> {
  const result = await client.query<{ id: string }>(
    `INSERT INTO payout_batch
       (id, organisation_id, programme_id, payout_channel_id, reference, status,
        prepared_by, approved_by, approved_at,
        per_item_limit_minor, per_batch_limit_minor)
     VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7,
             CASE WHEN $7::uuid IS NULL THEN NULL ELSE now() END,
             -- Frozen at approval, copied from the organisation, exactly as the
             -- real approval transaction will do it.
             CASE WHEN $7::uuid IS NULL THEN NULL ELSE 2000000 END,
             CASE WHEN $7::uuid IS NULL THEN NULL ELSE 50000000 END)
     RETURNING id`,
    [
      fixtures.organisationId,
      fixtures.programmeId,
      fixtures.channelId,
      overrides.reference ?? 'YCIC-2026-03',
      overrides.status ?? 'draft',
      fixtures.preparerId,
      overrides.approvedBy ?? null,
    ],
  );
  return result.rows[0]?.id ?? '';
}

export async function insertItem(
  client: pg.PoolClient,
  fixtures: Fixtures,
  batchId: string,
  overrides: { amountMinor?: bigint; status?: string; recipientId?: string; ocid?: string } = {},
): Promise<string> {
  const result = await client.query<{ id: string }>(
    `INSERT INTO payout_item
       (id, organisation_id, batch_id, recipient_id, amount_minor, status,
        originator_conversation_id)
     VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, COALESCE($6::uuid, gen_random_uuid()))
     RETURNING id`,
    [
      fixtures.organisationId,
      batchId,
      overrides.recipientId ?? fixtures.recipientId,
      (overrides.amountMinor ?? 150000n).toString(),
      overrides.status ?? 'queued',
      overrides.ocid ?? null,
    ],
  );
  return result.rows[0]?.id ?? '';
}

/** Asserts a query fails, and returns the Postgres error for inspection. */
export async function expectRejection(promise: Promise<unknown>): Promise<pg.DatabaseError> {
  try {
    await promise;
  } catch (error) {
    return error as pg.DatabaseError;
  }
  throw new Error('Expected the database to reject this, but it succeeded');
}

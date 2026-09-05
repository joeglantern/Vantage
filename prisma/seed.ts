/**
 * A local development organisation with enough history to be worth looking at.
 *
 * This is not fixture data pretending to be real. It is real rows in a real
 * database, subject to every constraint, trigger and policy in the migrations,
 * which is the point: seeding is the cheapest way to find out that a constraint
 * you wrote makes ordinary data impossible to insert.
 *
 * Runs as the migrator role, which is the only thing here that may bypass RLS.
 * The server never does.
 *
 * Idempotent. Running it twice leaves one organisation, not two.
 */
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { loadConfig } from '../src/platform/config.js';
import { encrypt } from '../src/platform/crypto.js';

const KES = 'KES';

interface SeedBatch {
  readonly reference: string;
  readonly programme: string;
  readonly status: string;
  readonly approved: boolean;
  readonly daysAgo: number;
  readonly items: readonly { name: string; msisdn: string; amountMinor: bigint; status: string }[];
}

/** Four names and a handful of amounts. Small enough to read in psql. */
function cohort(prefix: string, count: number, amountMinor: bigint, status: string) {
  const names = ['Amina Wanjiru', 'Peter Kimani Mwangi', 'Brian Odhiambo', 'Faith Njeri', 'Kevin Otieno'];
  return Array.from({ length: count }, (_, i) => ({
    name: `${names[i % names.length]!} ${prefix}${i + 1}`,
    // 2547xxxxxxxx, distinct per row so the recipient uniqueness constraint is
    // actually exercised rather than dodged.
    msisdn: `2547${String(10_000_000 + i + prefix.length * 1000).slice(0, 8)}`,
    amountMinor,
    status,
  }));
}

const BATCHES: readonly SeedBatch[] = [
  {
    reference: 'YCIC-2026-01',
    programme: 'YCIC stipend',
    status: 'closed',
    approved: true,
    daysAgo: 60,
    items: cohort('a', 5, 150_000n, 'confirmed'),
  },
  {
    reference: 'CHP-2026-02',
    programme: 'Community health promoters',
    status: 'closed',
    approved: true,
    daysAgo: 20,
    items: cohort('b', 4, 200_000n, 'confirmed'),
  },
  {
    reference: 'YCIC-2026-03',
    programme: 'YCIC stipend',
    status: 'pending_approval',
    approved: false,
    daysAgo: 1,
    items: cohort('c', 3, 150_000n, 'queued'),
  },
];

async function main(): Promise<void> {
  const config = loadConfig(process.env);
  const client = new pg.Client({ connectionString: config.database.url });
  await client.connect();

  try {
    await client.query('BEGIN');

    const orgId = await upsertOrganisation(client);
    const preparerId = await upsertUser(client, orgId, 'wanjiku@example.org', 'preparer');
    const approverId = await upsertUser(client, orgId, 'david@example.org', 'approver');
    const channelId = await upsertChannel(client, orgId, config);

    for (const batch of BATCHES) {
      await upsertBatch(client, orgId, channelId, preparerId, approverId, batch);
    }

    await client.query('COMMIT');

    process.stdout.write(
      [
        '',
        'Seeded.',
        '',
        `  organisation  ${orgId}`,
        `  preparer      wanjiku@example.org`,
        `  approver      david@example.org`,
        `  batches       ${BATCHES.length}`,
        '',
        'Put this in your .env so the server knows which organisation it serves:',
        '',
        `  VANTAGE_ORGANISATION_ID="${orgId}"`,
        '',
      ].join('\n'),
    );
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}

async function upsertOrganisation(client: pg.Client): Promise<string> {
  const existing = await client.query<{ id: string }>(
    'SELECT id FROM organisation WHERE name = $1',
    ['Tumaini Youth Trust'],
  );
  if (existing.rows[0] !== undefined) return existing.rows[0].id;

  const id = randomUUID();
  await client.query(
    `INSERT INTO organisation (id, name, odpc_reg_no, retention_days,
       per_item_limit_minor, per_batch_limit_minor, deviation_warning_bps)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [id, 'Tumaini Youth Trust', 'ODPC-DEV-0001', 2555, 2_000_000, 50_000_000, 5000],
  );
  return id;
}

async function upsertUser(
  client: pg.Client,
  orgId: string,
  email: string,
  role: string,
): Promise<string> {
  const existing = await client.query<{ id: string }>('SELECT id FROM "user" WHERE email = $1', [
    email,
  ]);
  const id = existing.rows[0]?.id ?? randomUUID();

  if (existing.rows[0] === undefined) {
    // Not a usable credential. There is no sign-in yet, and a seed that put a
    // guessable working password in a database would be a gift to whoever finds
    // this running on a laptop on a shared network.
    await client.query(
      `INSERT INTO "user" (id, email, password_hash, mfa_enabled) VALUES ($1, $2, $3, $4)`,
      [id, email, 'x-no-login-seed-account', false],
    );
  }

  await client.query(
    `INSERT INTO membership (id, organisation_id, user_id, role)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (organisation_id, user_id) DO UPDATE SET role = EXCLUDED.role`,
    [randomUUID(), orgId, id, role],
  );

  return id;
}

async function upsertChannel(
  client: pg.Client,
  orgId: string,
  config: ReturnType<typeof loadConfig>,
): Promise<string> {
  const existing = await client.query<{ id: string }>(
    'SELECT id FROM payout_channel WHERE organisation_id = $1 AND label = $2',
    [orgId, 'Sandbox B2C'],
  );
  if (existing.rows[0] !== undefined) return existing.rows[0].id;

  // Encrypted with the real envelope, under the real master key from the
  // environment, so a decrypt path has something genuine to read back.
  const credentials = encrypt(
    config.masterKey,
    JSON.stringify({
      consumerKey: config.daraja?.consumerKey ?? '',
      consumerSecret: config.daraja?.consumerSecret ?? '',
    }),
  );

  const id = randomUUID();
  await client.query(
    `INSERT INTO payout_channel (id, organisation_id, label, kind, shortcode,
       initiator_name, credentials_ciphertext, credentials_key_id, callback_secret, is_active)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      id,
      orgId,
      'Sandbox B2C',
      'mpesa_b2c',
      '600000',
      'testapi',
      credentials,
      config.masterKey.id,
      randomUUID(),
      true,
    ],
  );
  return id;
}

async function upsertProgramme(client: pg.Client, orgId: string, name: string): Promise<string> {
  const existing = await client.query<{ id: string }>(
    'SELECT id FROM programme WHERE organisation_id = $1 AND name = $2',
    [orgId, name],
  );
  if (existing.rows[0] !== undefined) return existing.rows[0].id;

  const id = randomUUID();
  await client.query('INSERT INTO programme (id, organisation_id, name) VALUES ($1, $2, $3)', [
    id,
    orgId,
    name,
  ]);
  return id;
}

async function upsertRecipient(
  client: pg.Client,
  orgId: string,
  msisdn: string,
  fullName: string,
): Promise<string> {
  const existing = await client.query<{ id: string }>(
    'SELECT id FROM recipient WHERE organisation_id = $1 AND msisdn = $2',
    [orgId, msisdn],
  );
  if (existing.rows[0] !== undefined) return existing.rows[0].id;

  const id = randomUUID();
  await client.query(
    'INSERT INTO recipient (id, organisation_id, msisdn, full_name) VALUES ($1, $2, $3, $4)',
    [id, orgId, msisdn, fullName],
  );
  return id;
}

async function upsertBatch(
  client: pg.Client,
  orgId: string,
  channelId: string,
  preparerId: string,
  approverId: string,
  batch: SeedBatch,
): Promise<void> {
  const existing = await client.query(
    'SELECT id FROM payout_batch WHERE organisation_id = $1 AND reference = $2',
    [orgId, batch.reference],
  );
  if (existing.rowCount !== null && existing.rowCount > 0) return;

  const programmeId = await upsertProgramme(client, orgId, batch.programme);
  const id = randomUUID();
  const at = new Date(Date.now() - batch.daysAgo * 24 * 60 * 60 * 1000);

  await client.query(
    `INSERT INTO payout_batch (id, organisation_id, programme_id, payout_channel_id, reference,
       status, currency, prepared_by, approved_by, approved_at,
       per_item_limit_minor, per_batch_limit_minor, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$13)`,
    [
      id,
      orgId,
      programmeId,
      channelId,
      batch.reference,
      batch.status,
      KES,
      preparerId,
      // The maker-checker constraint is `approved_by <> prepared_by`, enforced
      // by the database. Seeding both from one user would fail here, which is
      // exactly what it is for.
      batch.approved ? approverId : null,
      batch.approved ? at : null,
      2_000_000,
      50_000_000,
      at,
    ],
  );

  for (const item of batch.items) {
    const recipientId = await upsertRecipient(client, orgId, item.msisdn, item.name);
    await client.query(
      `INSERT INTO payout_item (id, organisation_id, batch_id, recipient_id, amount_minor,
         status, originator_conversation_id, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8)`,
      [randomUUID(), orgId, id, recipientId, item.amountMinor.toString(), item.status, randomUUID(), at],
    );
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`\nSeed failed.\n${String(error)}\n\n`);
  process.exitCode = 1;
});

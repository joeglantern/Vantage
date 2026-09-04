/**
 * audit_event, gateway_message and ledger_entry are evidence. An UPDATE or a
 * DELETE against them is an attempt to edit history, and the database refuses.
 *
 * docs/09 asks specifically for a test that mutates a row directly and shows
 * verification failing. These tests do the stronger version: the mutation never
 * lands at all.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  expectRejection,
  inRolledBackTransaction,
  insertBatch,
  insertItem,
  seed,
  startTestDatabase,
  type DbClient,
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
  } finally {
    client.release();
  }
});

afterAll(async () => {
  await db?.stop();
});

async function insertAuditEvent(
  client: DbClient,
  organisationId: string,
): Promise<string> {
  const result = await client.query<{ id: string }>(
    `INSERT INTO audit_event
       (organisation_id, chain_seq, action, subject_type, subject_id, prev_hash, hash)
     VALUES ($1, 1, 'batch.approved', 'payout_batch', gen_random_uuid(), NULL,
             decode(repeat('ab', 32), 'hex'))
     RETURNING id::text`,
    [organisationId],
  );
  return result.rows[0]?.id ?? '';
}

describe('audit_event is append-only', () => {
  it('refuses an UPDATE', async () => {
    await inRolledBackTransaction(db.pool, async (client) => {
      const id = await insertAuditEvent(client, fixtures.organisationId);
      const error = await expectRejection(
        client.query('UPDATE audit_event SET action = $1 WHERE id = $2', ['batch.cancelled', id]),
      );
      expect(error.message).toContain('append-only');
      expect(error.code).toBe('23001');
    });
  });

  it('refuses a DELETE', async () => {
    await inRolledBackTransaction(db.pool, async (client) => {
      const id = await insertAuditEvent(client, fixtures.organisationId);
      const error = await expectRejection(
        client.query('DELETE FROM audit_event WHERE id = $1', [id]),
      );
      expect(error.message).toContain('append-only');
    });
  });

  it('refuses a TRUNCATE, which row triggers would miss', async () => {
    await inRolledBackTransaction(db.pool, async (client) => {
      const error = await expectRejection(client.query('TRUNCATE audit_event'));
      expect(error.message).toContain('append-only');
    });
  });

  it('refuses an UPDATE that touches no column, which is still an edit attempt', async () => {
    await inRolledBackTransaction(db.pool, async (client) => {
      const id = await insertAuditEvent(client, fixtures.organisationId);
      const error = await expectRejection(
        client.query('UPDATE audit_event SET hash = hash WHERE id = $1', [id]),
      );
      expect(error.message).toContain('append-only');
    });
  });

  it('still allows an INSERT, which is the only supported write', async () => {
    await inRolledBackTransaction(db.pool, async (client) => {
      const id = await insertAuditEvent(client, fixtures.organisationId);
      expect(id).not.toBe('');
    });
  });
});

describe('gateway_message is append-only', () => {
  async function insertMessage(
    client: DbClient,
  ): Promise<string> {
    const batchId = await insertBatch(client, fixtures, { reference: `GM-${Date.now()}` });
    const itemId = await insertItem(client, fixtures, batchId);
    const result = await client.query<{ id: string }>(
      `INSERT INTO gateway_message
         (id, organisation_id, payout_item_id, recipient_id, direction, kind, payload_enc)
       VALUES (gen_random_uuid(), $1, $2, $3, 'inbound', 'result_callback', '\\xdeadbeef'::bytea)
       RETURNING id`,
      [fixtures.organisationId, itemId, fixtures.recipientId],
    );
    return result.rows[0]?.id ?? '';
  }

  it('refuses an UPDATE to the stored payload', async () => {
    await inRolledBackTransaction(db.pool, async (client) => {
      const id = await insertMessage(client);
      // Rewriting what Safaricom actually said is the thing this table exists
      // to make impossible.
      const error = await expectRejection(
        client.query('UPDATE gateway_message SET payload_enc = $1 WHERE id = $2', [
          Buffer.from('cafebabe', 'hex'),
          id,
        ]),
      );
      expect(error.message).toContain('append-only');
    });
  });

  it('refuses a DELETE', async () => {
    await inRolledBackTransaction(db.pool, async (client) => {
      const id = await insertMessage(client);
      const error = await expectRejection(
        client.query('DELETE FROM gateway_message WHERE id = $1', [id]),
      );
      expect(error.message).toContain('append-only');
    });
  });
});

describe('ledger_entry is append-only', () => {
  async function insertEntry(
    client: DbClient,
    entryType: string,
    amountMinor: bigint,
  ): Promise<string> {
    const batchId = await insertBatch(client, fixtures, { reference: `LE-${Math.random()}` });
    const result = await client.query<{ id: string }>(
      `INSERT INTO ledger_entry (id, organisation_id, batch_id, entry_type, amount_minor)
       VALUES (gen_random_uuid(), $1, $2, $3, $4) RETURNING id`,
      [fixtures.organisationId, batchId, entryType, amountMinor.toString()],
    );
    return result.rows[0]?.id ?? '';
  }

  it('refuses an UPDATE to an amount', async () => {
    await inRolledBackTransaction(db.pool, async (client) => {
      const id = await insertEntry(client, 'disbursed', 150000n);
      const error = await expectRejection(
        client.query('UPDATE ledger_entry SET amount_minor = 1 WHERE id = $1', [id]),
      );
      expect(error.message).toContain('append-only');
    });
  });

  it('takes a correction as a new compensating row instead', async () => {
    await inRolledBackTransaction(db.pool, async (client) => {
      const batchId = await insertBatch(client, fixtures, { reference: 'COMPENSATE' });
      await client.query(
        `INSERT INTO ledger_entry (id, organisation_id, batch_id, entry_type, amount_minor)
         VALUES (gen_random_uuid(), $1, $2, 'disbursed', 150000),
                (gen_random_uuid(), $1, $2, 'reversed', -150000)`,
        [fixtures.organisationId, batchId],
      );

      const total = await client.query<{ total: string }>(
        'SELECT sum(amount_minor)::text AS total FROM ledger_entry WHERE batch_id = $1',
        [batchId],
      );
      expect(total.rows[0]?.total).toBe('0');
    });
  });

  it('refuses a zero-amount entry, which records nothing', async () => {
    await inRolledBackTransaction(db.pool, async (client) => {
      const error = await expectRejection(insertEntry(client, 'disbursed', 0n));
      expect(error.constraint).toBe('ledger_entry_amount_nonzero_check');
    });
  });
});

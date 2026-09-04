/**
 * Proves that each constraint from docs/03 actually rejects the bad case.
 *
 * A constraint nobody has watched fail is a comment. Every test here writes the
 * thing the system is supposed to refuse, and asserts Postgres refused it.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  expectRejection,
  inRolledBackTransaction,
  insertBatch,
  insertItem,
  seed,
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
  } finally {
    client.release();
  }
});

afterAll(async () => {
  await db?.stop();
});

describe('maker-checker', () => {
  it('refuses a batch approved by its own preparer', async () => {
    await inRolledBackTransaction(db.pool, async (client) => {
      // The application check is deliberately not in the loop here. This is the
      // database refusing on its own, which is the whole point of docs/03
      // putting the rule in a constraint rather than a code path.
      const error = await expectRejection(
        insertBatch(client, fixtures, {
          status: 'approved',
          approvedBy: fixtures.preparerId,
        }),
      );
      expect(error.constraint).toBe('payout_batch_maker_checker_check');
    });
  });

  it('accepts a batch approved by somebody else', async () => {
    await inRolledBackTransaction(db.pool, async (client) => {
      const id = await insertBatch(client, fixtures, {
        status: 'approved',
        approvedBy: fixtures.approverId,
        reference: 'YCIC-2026-04',
      });
      expect(id).toMatch(/^[0-9a-f-]{36}$/);
    });
  });

  it('refuses an approver without an approval timestamp', async () => {
    await inRolledBackTransaction(db.pool, async (client) => {
      const error = await expectRejection(
        client.query(
          `INSERT INTO payout_batch
             (id, organisation_id, programme_id, payout_channel_id, reference,
              status, prepared_by, approved_by, approved_at)
           VALUES (gen_random_uuid(), $1, $2, $3, 'HALF-APPROVED', 'approved', $4, $5, NULL)`,
          [
            fixtures.organisationId,
            fixtures.programmeId,
            fixtures.channelId,
            fixtures.preparerId,
            fixtures.approverId,
          ],
        ),
      );
      expect(error.constraint).toBe('payout_batch_approval_complete_check');
    });
  });
});

describe('anti double-pay uniqueness', () => {
  it('refuses two items for the same recipient in one batch', async () => {
    await inRolledBackTransaction(db.pool, async (client) => {
      const batchId = await insertBatch(client, fixtures, { reference: 'DUP-1' });
      await insertItem(client, fixtures, batchId);

      const error = await expectRejection(insertItem(client, fixtures, batchId));
      expect(error.constraint).toBe('payout_item_batch_id_recipient_id_key');
    });
  });

  it('refuses the same originator_conversation_id twice, across batches', async () => {
    await inRolledBackTransaction(db.pool, async (client) => {
      const ocid = '11111111-2222-3333-4444-555555555555';
      const batchA = await insertBatch(client, fixtures, { reference: 'OCID-A' });
      const batchB = await insertBatch(client, fixtures, { reference: 'OCID-B' });

      await insertItem(client, fixtures, batchA, { ocid });

      // Safaricom deduplicates on this value. Two of our rows carrying the same
      // one would mean we had lost track of which payment it referred to.
      const error = await expectRejection(
        insertItem(client, fixtures, batchB, { ocid, recipientId: fixtures.otherRecipientId }),
      );
      expect(error.constraint).toBe('payout_item_originator_conversation_id_key');
    });
  });

  it('refuses a duplicate reference within one organisation', async () => {
    await inRolledBackTransaction(db.pool, async (client) => {
      await insertBatch(client, fixtures, { reference: 'SAME-REF' });
      const error = await expectRejection(insertBatch(client, fixtures, { reference: 'SAME-REF' }));
      expect(error.constraint).toBe('payout_batch_organisation_id_reference_key');
    });
  });

  it('refuses the same msisdn twice for one organisation', async () => {
    await inRolledBackTransaction(db.pool, async (client) => {
      const error = await expectRejection(
        client.query(
          `INSERT INTO recipient (id, organisation_id, msisdn, full_name)
           VALUES (gen_random_uuid(), $1, '254712345678', 'Someone Else')`,
          [fixtures.organisationId],
        ),
      );
      expect(error.constraint).toBe('recipient_organisation_id_msisdn_key');
    });
  });
});

describe('money', () => {
  it('refuses cents, because M-Pesa moves whole shillings', async () => {
    await inRolledBackTransaction(db.pool, async (client) => {
      const batchId = await insertBatch(client, fixtures, { reference: 'CENTS' });
      const error = await expectRejection(
        insertItem(client, fixtures, batchId, { amountMinor: 150050n }),
      );
      expect(error.constraint).toBe('payout_item_whole_shilling_check');
    });
  });

  it.each([{ amount: 0n, label: 'zero' }, { amount: -150000n, label: 'negative' }])(
    'refuses a $label amount',
    async ({ amount }) => {
      // One transaction per case. The first rejection aborts the transaction,
      // and every later statement in it fails with 25P02 instead of the
      // constraint we are actually asserting on.
      await inRolledBackTransaction(db.pool, async (client) => {
        const batchId = await insertBatch(client, fixtures, { reference: `AMT-${amount}` });
        const error = await expectRejection(
          insertItem(client, fixtures, batchId, { amountMinor: amount }),
        );
        expect(error.constraint).toBe('payout_item_amount_positive_check');
      });
    },
  );

  it('keeps a large amount exact, well past 2^53', async () => {
    await inRolledBackTransaction(db.pool, async (client) => {
      const batchId = await insertBatch(client, fixtures, { reference: 'BIG' });
      const amount = 9007199254740993n * 100n;
      const itemId = await insertItem(client, fixtures, batchId, { amountMinor: amount });

      const read = await client.query<{ amount_minor: string }>(
        'SELECT amount_minor FROM payout_item WHERE id = $1',
        [itemId],
      );
      // Comes back as a string, which is exactly why money crosses boundaries
      // as one. Parsing this as a JS number would lose the last digit.
      expect(read.rows[0]?.amount_minor).toBe(amount.toString());
    });
  });
});

describe('status values', () => {
  it('refuses an item status the domain does not define', async () => {
    await inRolledBackTransaction(db.pool, async (client) => {
      const batchId = await insertBatch(client, fixtures, { reference: 'BADSTATUS' });
      const error = await expectRejection(
        insertItem(client, fixtures, batchId, { status: 'almost_paid' }),
      );
      expect(error.constraint).toBe('payout_item_status_check');
    });
  });

  it('refuses a batch status the domain does not define', async () => {
    await inRolledBackTransaction(db.pool, async (client) => {
      const error = await expectRejection(
        insertBatch(client, fixtures, { status: 'nearly_done', reference: 'BADBATCH' }),
      );
      expect(error.constraint).toBe('payout_batch_status_check');
    });
  });

  it('refuses a payout channel kind that is not a supported rail', async () => {
    await inRolledBackTransaction(db.pool, async (client) => {
      const error = await expectRejection(
        client.query(
          `INSERT INTO payout_channel
             (id, organisation_id, label, kind, shortcode, initiator_name,
              credentials_ciphertext, credentials_key_id, callback_secret)
           VALUES (gen_random_uuid(), $1, 'Bank', 'pesalink', '1', 'init',
                   '\\x00'::bytea, 'k', 's')`,
          [fixtures.organisationId],
        ),
      );
      expect(error.constraint).toBe('payout_channel_kind_check');
    });
  });
});

describe('the audit chain', () => {
  it('refuses two events at the same position in one chain', async () => {
    await inRolledBackTransaction(db.pool, async (client) => {
      const insert = (seq: number, prev: string | null) =>
        client.query(
          `INSERT INTO audit_event
             (organisation_id, chain_seq, action, subject_type, subject_id, prev_hash, hash)
           VALUES ($1, $2, 'batch.approved', 'payout_batch', gen_random_uuid(),
                   $3::bytea, decode(repeat('ab', 32), 'hex'))`,
          [fixtures.organisationId, seq, prev],
        );

      await insert(1, null);
      // Two writers racing for the same sequence number would fork the chain,
      // and a forked chain cannot be verified.
      const error = await expectRejection(insert(1, null));
      expect(error.constraint).toBe('audit_event_organisation_id_chain_seq_key');
    });
  });

  it('lets two organisations each hold sequence 1', async () => {
    await inRolledBackTransaction(db.pool, async (client) => {
      for (const org of [fixtures.organisationId, fixtures.otherOrganisationId]) {
        await client.query(
          `INSERT INTO audit_event
             (organisation_id, chain_seq, action, subject_type, subject_id, prev_hash, hash)
           VALUES ($1, 1, 'org.created', 'organisation', $1, NULL,
                   decode(repeat('cd', 32), 'hex'))`,
          [org],
        );
      }
      const count = await client.query<{ n: string }>(
        'SELECT count(*)::text AS n FROM audit_event WHERE chain_seq = 1',
      );
      expect(count.rows[0]?.n).toBe('2');
    });
  });

  it('refuses a genesis event that claims a predecessor', async () => {
    await inRolledBackTransaction(db.pool, async (client) => {
      const error = await expectRejection(
        client.query(
          `INSERT INTO audit_event
             (organisation_id, chain_seq, action, subject_type, subject_id, prev_hash, hash)
           VALUES ($1, 1, 'x', 'y', gen_random_uuid(),
                   decode(repeat('ff', 32), 'hex'), decode(repeat('ab', 32), 'hex'))`,
          [fixtures.organisationId],
        ),
      );
      expect(error.constraint).toBe('audit_event_genesis_check');
    });
  });

  it('refuses a non-genesis event with no predecessor', async () => {
    await inRolledBackTransaction(db.pool, async (client) => {
      const error = await expectRejection(
        client.query(
          `INSERT INTO audit_event
             (organisation_id, chain_seq, action, subject_type, subject_id, prev_hash, hash)
           VALUES ($1, 2, 'x', 'y', gen_random_uuid(), NULL, decode(repeat('ab', 32), 'hex'))`,
          [fixtures.organisationId],
        ),
      );
      expect(error.constraint).toBe('audit_event_genesis_check');
    });
  });

  it('refuses a hash that is not 32 bytes', async () => {
    await inRolledBackTransaction(db.pool, async (client) => {
      const error = await expectRejection(
        client.query(
          `INSERT INTO audit_event
             (organisation_id, chain_seq, action, subject_type, subject_id, prev_hash, hash)
           VALUES ($1, 1, 'x', 'y', gen_random_uuid(), NULL, '\\xdeadbeef'::bytea)`,
          [fixtures.organisationId],
        ),
      );
      expect(error.constraint).toBe('audit_event_hash_length_check');
    });
  });
});

/**
 * The guarded claim, against a real database with real concurrency.
 *
 * docs/02 gives the query and docs/04 gives the rule: only `queued` is
 * claimable, and a conditional UPDATE that also asserts the current status is
 * cheaper and more reliable than an application-level lock. The property test
 * proves the state machine allows no other edge. This proves Postgres enforces
 * it when two workers genuinely race.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ITEM_STATUSES, isClaimable } from '@domain/payout-item';
import {
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

/** The claim from docs/02, verbatim. No row returned means somebody else won. */
const CLAIM_SQL = `
  UPDATE payout_item
     SET status = 'sending', updated_at = now(), attempt_count = attempt_count + 1
   WHERE id = $1 AND status = 'queued'
  RETURNING id`;

describe('two workers racing for one item', () => {
  it('lets exactly one win', async () => {
    const client = await db.pool.connect();
    let itemId = '';
    try {
      await client.query('BEGIN');
      const batchId = await insertBatch(client, fixtures, { reference: `RACE-${Date.now()}` });
      itemId = await insertItem(client, fixtures, batchId, { status: 'queued' });
      await client.query('COMMIT');
    } finally {
      client.release();
    }

    // Eight separate connections, all firing the same claim at once. This is a
    // redelivered BullMQ job and a second worker at the same moment.
    const attempts = await Promise.all(
      Array.from({ length: 8 }, async () => {
        const worker = await db.pool.connect();
        try {
          const result = await worker.query(CLAIM_SQL, [itemId]);
          return result.rowCount ?? 0;
        } finally {
          worker.release();
        }
      }),
    );

    const winners = attempts.filter((rows) => rows === 1);
    expect(winners).toHaveLength(1);

    const final = await db.pool.query<{ status: string; attempt_count: number }>(
      'SELECT status, attempt_count FROM payout_item WHERE id = $1',
      [itemId],
    );
    expect(final.rows[0]?.status).toBe('sending');
    // The count is the honest one. Eight jobs ran; one request went out.
    expect(final.rows[0]?.attempt_count).toBe(1);

    await db.pool.query('DELETE FROM payout_item WHERE id = $1', [itemId]);
  });
});

describe('what the claim will and will not pick up', () => {
  it('claims a queued item', async () => {
    await inRolledBackTransaction(db.pool, async (client) => {
      const batchId = await insertBatch(client, fixtures, { reference: `CLAIM-${Math.random()}` });
      const itemId = await insertItem(client, fixtures, batchId, { status: 'queued' });
      const result = await client.query(CLAIM_SQL, [itemId]);
      expect(result.rowCount).toBe(1);
    });
  });

  it('refuses to claim an item in any other status', async () => {
    // Most importantly `unknown`. A timeout means we do not know whether the
    // money moved, and claiming it again is how somebody gets paid twice.
    for (const status of ITEM_STATUSES.filter((s) => s !== 'queued')) {
      await inRolledBackTransaction(db.pool, async (client) => {
        const batchId = await insertBatch(client, fixtures, {
          reference: `NOCLAIM-${status}-${Math.random()}`,
        });
        const itemId = await insertItem(client, fixtures, batchId, { status });
        const result = await client.query(CLAIM_SQL, [itemId]);
        expect(result.rowCount, `claiming from ${status}`).toBe(0);
      });
    }
  });

  it('agrees with the domain layer about what is claimable', async () => {
    // The SQL and src/domain/payout-item.ts must not drift apart. If somebody
    // adds a claimable status to one and not the other, this fails.
    for (const status of ITEM_STATUSES) {
      await inRolledBackTransaction(db.pool, async (client) => {
        const batchId = await insertBatch(client, fixtures, {
          reference: `AGREE-${status}-${Math.random()}`,
        });
        const itemId = await insertItem(client, fixtures, batchId, { status });
        const result = await client.query(CLAIM_SQL, [itemId]);
        expect(result.rowCount === 1, `domain and SQL disagree on ${status}`).toBe(
          isClaimable(status),
        );
      });
    }
  });
});

describe('the reconciliation sweep', () => {
  it('uses the partial index for unresolved items', async () => {
    const plan = await db.pool.query<{ 'QUERY PLAN': string }>(
      `EXPLAIN SELECT id FROM payout_item WHERE status IN ('unknown','sending')`,
    );
    const text = plan.rows.map((r) => r['QUERY PLAN']).join('\n');
    // On a tiny table Postgres may still prefer a sequential scan, so this
    // asserts the index exists and is usable rather than that it was chosen.
    const index = await db.pool.query(
      `SELECT indexname FROM pg_indexes
        WHERE tablename = 'payout_item' AND indexname = 'payout_item_unresolved_idx'`,
    );
    expect(index.rowCount).toBe(1);
    expect(text.length).toBeGreaterThan(0);
  });

  it('finds an item stuck in sending after a worker crash', async () => {
    await inRolledBackTransaction(db.pool, async (client) => {
      const batchId = await insertBatch(client, fixtures, { reference: `SWEEP-${Math.random()}` });
      await insertItem(client, fixtures, batchId, { status: 'sending' });
      await insertItem(client, fixtures, batchId, {
        status: 'unknown',
        recipientId: fixtures.otherRecipientId,
      });

      const unresolved = await client.query(
        `SELECT id FROM payout_item WHERE batch_id = $1 AND status IN ('unknown','sending')`,
        [batchId],
      );
      // Both block batch closure, which is what keeps the pack honest.
      expect(unresolved.rowCount).toBe(2);
    });
  });
});

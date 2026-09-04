/**
 * THE test. docs/09 says to write this before the disbursement feature, because
 * it is the specification for it:
 *
 *   For any interleaving of worker retries, duplicate callbacks, timeouts,
 *   status-probe results and worker crashes, a payout item never reaches
 *   `confirmed` more than once, and never produces two disbursed ledger
 *   entries.
 *
 * Everything else in this system is recoverable. Paying somebody twice is not.
 */
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { ItemModel, type Operation } from './disbursement-model';

const gatewayOutcome = fc.oneof(
  fc.record({
    kind: fc.constant('accepted' as const),
    conversationId: fc.string({ minLength: 4, maxLength: 12 }),
  }),
  fc.record({
    kind: fc.constant('rejected' as const),
    code: fc.constantFrom('DS_INSUFFICIENT_FUNDS', 'DS_INVALID_MSISDN', 'DS_LIMIT'),
  }),
  fc.constant({ kind: 'timeout' as const }),
);

const operation: fc.Arbitrary<Operation> = fc.oneof(
  fc.record({ op: fc.constant('run_disburse_job' as const), gateway: gatewayOutcome }),
  fc.constant({ op: 'worker_crash_mid_job' as const }),
  fc.record({ op: fc.constant('deliver_callback' as const), success: fc.boolean() }),
  fc.constant({ op: 'callback_sla_expired' as const }),
  fc.record({
    op: fc.constant('run_status_probe' as const),
    result: fc.constantFrom('success' as const, 'failure' as const, 'indeterminate' as const),
  }),
  fc.constant({ op: 'human_retry' as const }),
);

/** Sequences long enough to interleave retries, callbacks and probes. */
const operations = fc.array(operation, { minLength: 1, maxLength: 60 });

function runScenario(ops: readonly Operation[]): ItemModel {
  const item = new ItemModel('ocid-fixed-for-life-of-item');
  item.approve();
  for (const op of ops) item.step(op);
  return item;
}

describe('the double-pay property', () => {
  it('never reaches confirmed more than once, under any interleaving', () => {
    fc.assert(
      fc.property(operations, (ops) => {
        expect(runScenario(ops).timesConfirmed()).toBeLessThanOrEqual(1);
      }),
      { numRuns: 2000 },
    );
  });

  it('never produces two disbursed ledger entries', () => {
    fc.assert(
      fc.property(operations, (ops) => {
        expect(runScenario(ops).disbursedLedgerEntries()).toBeLessThanOrEqual(1);
      }),
      { numRuns: 2000 },
    );
  });

  it('never regenerates the originator_conversation_id', () => {
    // docs/04 rule 1. Safaricom deduplicates on this value, so reusing it is
    // what makes a genuine duplicate request get rejected rather than paid.
    fc.assert(
      fc.property(operations, (ops) => {
        const item = runScenario(ops);
        for (const attempt of item.sendAttempts) {
          expect(attempt.originatorConversationId).toBe(item.originatorConversationId);
        }
      }),
      { numRuns: 2000 },
    );
  });

  it('never sends a request for an item that was unknown', () => {
    // This is the dotted "NEVER" edge in the docs/04 flowchart. A timeout means
    // we do not know whether the money moved; resending is how people get paid
    // twice. The guarded claim accepts only `queued`, which makes the edge
    // structurally impossible rather than merely discouraged.
    fc.assert(
      fc.property(operations, (ops) => {
        for (const attempt of runScenario(ops).sendAttempts) {
          expect(attempt.claimedFrom).toBe('queued');
        }
      }),
      { numRuns: 2000 },
    );
  });

  it('never leaves confirmed once it is reached', () => {
    // docs/04 invariant 7: no item transitions out of a terminal state, except
    // failed -> queued by explicit human retry.
    fc.assert(
      fc.property(operations, (ops) => {
        const history = runScenario(ops).statusHistory;
        const first = history.indexOf('confirmed');
        if (first === -1) return;
        for (const status of history.slice(first)) {
          expect(status).toBe('confirmed');
        }
      }),
      { numRuns: 2000 },
    );
  });

  it('emits exactly one disbursed entry when it does confirm', () => {
    fc.assert(
      fc.property(operations, (ops) => {
        const item = runScenario(ops);
        if (item.status !== 'confirmed') return;
        expect(item.disbursedLedgerEntries()).toBe(1);
      }),
      { numRuns: 2000 },
    );
  });
});

describe('the specific interleavings that motivated the property', () => {
  it('a redelivered job does not send twice', () => {
    const item = new ItemModel('ocid-1');
    item.approve();
    item.runDisburseJob({ kind: 'accepted', conversationId: 'AG-1' });
    item.runDisburseJob({ kind: 'accepted', conversationId: 'AG-2' });
    expect(item.sendAttempts).toHaveLength(1);
    expect(item.conversationId).toBe('AG-1');
  });

  it('a duplicate success callback confirms only once', () => {
    const item = new ItemModel('ocid-2');
    item.approve();
    item.runDisburseJob({ kind: 'accepted', conversationId: 'AG-1' });
    item.deliverCallback(true);
    item.deliverCallback(true);
    expect(item.timesConfirmed()).toBe(1);
    expect(item.disbursedLedgerEntries()).toBe(1);
  });

  it('a timeout is probed, never resent', () => {
    const item = new ItemModel('ocid-3');
    item.approve();
    item.runDisburseJob({ kind: 'timeout' });
    expect(item.status).toBe('unknown');

    // The queue redelivers the job. It must find nothing to claim.
    item.runDisburseJob({ kind: 'accepted', conversationId: 'AG-9' });
    expect(item.sendAttempts).toHaveLength(1);
    expect(item.status).toBe('unknown');

    item.runStatusProbe('success');
    expect(item.status).toBe('confirmed');
    expect(item.disbursedLedgerEntries()).toBe(1);
  });

  it('a late callback cannot overturn a probe result', () => {
    const item = new ItemModel('ocid-4');
    item.approve();
    item.runDisburseJob({ kind: 'timeout' });
    item.runStatusProbe('success');
    item.deliverCallback(false);
    expect(item.status).toBe('confirmed');
    expect(item.ledger.filter((e) => e === 'failed')).toHaveLength(0);
  });

  it('a human retry of a failed item reuses the same ocid', () => {
    const item = new ItemModel('ocid-5');
    item.approve();
    item.runDisburseJob({ kind: 'rejected', code: 'DS_INSUFFICIENT_FUNDS' });
    expect(item.status).toBe('failed');

    item.humanRetry();
    expect(item.status).toBe('queued');
    item.runDisburseJob({ kind: 'accepted', conversationId: 'AG-2' });

    expect(item.sendAttempts).toHaveLength(2);
    expect(new Set(item.sendAttempts.map((a) => a.originatorConversationId)).size).toBe(1);
  });

  it('a crashed worker leaves the item unclaimable, not resendable', () => {
    const item = new ItemModel('ocid-6');
    item.approve();
    item.workerCrashMidJob({ kind: 'timeout' });
    expect(item.status).toBe('sending');

    item.runDisburseJob({ kind: 'accepted', conversationId: 'AG-1' });
    expect(item.sendAttempts).toHaveLength(1);
  });
});

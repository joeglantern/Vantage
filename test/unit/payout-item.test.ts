import { describe, expect, it } from 'vitest';
import {
  ITEM_STATUSES,
  isClaimable,
  isTerminal,
  isUnresolved,
  transitionItem,
  type ItemEvent,
  type ItemStatus,
} from '@domain/payout-item';

const ALL_EVENTS: ItemEvent[] = [
  { kind: 'batch_approved' },
  { kind: 'worker_claimed' },
  { kind: 'gateway_accepted' },
  { kind: 'gateway_rejected', code: 'DS_X' },
  { kind: 'gateway_timeout' },
  { kind: 'callback_success' },
  { kind: 'callback_failure', code: 'DS_X' },
  { kind: 'callback_sla_expired' },
  { kind: 'probe_success' },
  { kind: 'probe_failure', code: 'DS_X' },
  { kind: 'probe_indeterminate' },
  { kind: 'human_retry' },
];

describe('the item state machine', () => {
  it('walks the happy path', () => {
    let status: ItemStatus = 'pending';
    const path: Array<[ItemEvent, ItemStatus]> = [
      [{ kind: 'batch_approved' }, 'queued'],
      [{ kind: 'worker_claimed' }, 'sending'],
      [{ kind: 'gateway_accepted' }, 'sent'],
      [{ kind: 'callback_success' }, 'confirmed'],
    ];
    for (const [event, expected] of path) {
      const result = transitionItem(status, event);
      expect(result.ok).toBe(true);
      if (result.ok) status = result.to;
      expect(status).toBe(expected);
    }
  });

  it('only ever claims from queued', () => {
    // The guard that makes the double-send structurally impossible.
    for (const status of ITEM_STATUSES) {
      expect(isClaimable(status), status).toBe(status === 'queued');
      const result = transitionItem(status, { kind: 'worker_claimed' });
      expect(result.ok, status).toBe(status === 'queued');
    }
  });

  it('has no edge out of confirmed at all', () => {
    for (const event of ALL_EVENTS) {
      expect(transitionItem('confirmed', event).ok, event.kind).toBe(false);
    }
  });

  it('lets a human, and only a human, move failed back to queued', () => {
    const retry = transitionItem('failed', { kind: 'human_retry' });
    expect(retry.ok).toBe(true);
    if (retry.ok) expect(retry.to).toBe('queued');

    for (const event of ALL_EVENTS.filter((e) => e.kind !== 'human_retry')) {
      expect(transitionItem('failed', event).ok, event.kind).toBe(false);
    }
  });

  it('turns a timeout into unknown, never into failed', () => {
    const result = transitionItem('sending', { kind: 'gateway_timeout' });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.to).toBe('unknown');
  });

  it('keeps an indeterminate probe in unknown', () => {
    const result = transitionItem('unknown', { kind: 'probe_indeterminate' });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.to).toBe('unknown');
  });

  it('rejects every transition not in the table', () => {
    // An exhaustive sweep: legal edges are counted, everything else must fail.
    let legal = 0;
    for (const status of ITEM_STATUSES) {
      for (const event of ALL_EVENTS) {
        if (transitionItem(status, event).ok) legal += 1;
      }
    }
    // pending:1 queued:1 sending:3 sent:3 unknown:3 confirmed:0 failed:1
    expect(legal).toBe(12);
  });
});

describe('status predicates', () => {
  it('treats confirmed and failed as terminal', () => {
    expect(isTerminal('confirmed')).toBe(true);
    expect(isTerminal('failed')).toBe(true);
    expect(isTerminal('unknown')).toBe(false);
    expect(isTerminal('sent')).toBe(false);
  });

  it('treats unknown and sending as unresolved, which blocks closure', () => {
    expect(isUnresolved('unknown')).toBe(true);
    expect(isUnresolved('sending')).toBe(true);
    expect(isUnresolved('confirmed')).toBe(false);
    expect(isUnresolved('failed')).toBe(false);
  });
});

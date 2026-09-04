/**
 * The payout item state machine, exactly as drawn in docs/03.
 *
 * This is the file the double-pay property test drives. Two rules are load
 * bearing and are expressed as structure rather than as advice:
 *
 *   1. `queued` is the ONLY status a worker may claim from. An item in
 *      `unknown` therefore cannot be sent again. The dotted NEVER edge in the
 *      docs/04 flowchart has no representation here.
 *   2. `confirmed` has no outgoing transitions at all.
 */
import { err, type Result } from './result.js';

export const ITEM_STATUSES = [
  'pending',
  'queued',
  'sending',
  'sent',
  'unknown',
  'confirmed',
  'failed',
] as const;
export type ItemStatus = (typeof ITEM_STATUSES)[number];

export type ItemEvent =
  | { kind: 'batch_approved' }
  | { kind: 'worker_claimed' }
  | { kind: 'gateway_accepted' }
  | { kind: 'gateway_rejected'; code: string }
  | { kind: 'gateway_timeout' }
  | { kind: 'callback_success' }
  | { kind: 'callback_failure'; code: string }
  | { kind: 'callback_sla_expired' }
  | { kind: 'probe_success' }
  | { kind: 'probe_failure'; code: string }
  | { kind: 'probe_indeterminate' }
  | { kind: 'human_retry' };

export type ItemEventKind = ItemEvent['kind'];

export type TransitionError = 'illegal_transition';

/**
 * The complete transition table. Anything absent is illegal, which is what
 * makes "no other edges exist" a property of the data rather than a claim in a
 * comment.
 */
const TRANSITIONS: Readonly<
  Record<ItemStatus, Partial<Record<ItemEventKind, ItemStatus>>>
> = {
  pending: { batch_approved: 'queued' },

  // The guarded claim. Only from here.
  queued: { worker_claimed: 'sending' },

  sending: {
    gateway_accepted: 'sent',
    gateway_rejected: 'failed',
    // A timeout is not a failure. We do not know whether the money moved.
    gateway_timeout: 'unknown',
  },

  sent: {
    callback_success: 'confirmed',
    callback_failure: 'failed',
    callback_sla_expired: 'unknown',
  },

  unknown: {
    probe_success: 'confirmed',
    probe_failure: 'failed',
    // Still indeterminate. Back off and ask again. Never send again.
    probe_indeterminate: 'unknown',
  },

  // Terminal, absolutely. docs/04 invariant 7.
  confirmed: {},

  // Terminal, but a human may put it back in the queue with the same
  // originator_conversation_id. It re-enters through the one door.
  failed: { human_retry: 'queued' },
};

export function transitionItem(
  from: ItemStatus,
  event: ItemEvent,
): Result<{ to: ItemStatus }, TransitionError> {
  const to = TRANSITIONS[from][event.kind];
  if (to === undefined) return err('illegal_transition');
  return { ok: true, to };
}

/** The statuses from which no further progress happens on its own. */
export function isTerminal(status: ItemStatus): boolean {
  return status === 'confirmed' || status === 'failed';
}

/**
 * An item whose outcome nobody knows. A batch cannot close while any item is
 * here, and that guarantee is what makes the reconciliation pack honest.
 */
export function isUnresolved(status: ItemStatus): boolean {
  return status === 'unknown' || status === 'sending';
}

/**
 * Whether a worker may claim this item. The single source of truth for the
 * guarded UPDATE in the disbursement worker, so the SQL and the state machine
 * cannot drift apart.
 */
export function isClaimable(status: ItemStatus): boolean {
  return TRANSITIONS[status].worker_claimed !== undefined;
}

export function isItemStatus(value: string): value is ItemStatus {
  return (ITEM_STATUSES as readonly string[]).includes(value);
}

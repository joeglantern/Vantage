/**
 * Ledger entries are append-only. A correction is a new compensating row, never
 * an update. See docs/03.
 */
import type { ItemStatus } from './payout-item.js';

export const LEDGER_ENTRY_TYPES = ['obligation', 'disbursed', 'reversed', 'failed'] as const;
export type LedgerEntryType = (typeof LEDGER_ENTRY_TYPES)[number];

/**
 * Which ledger entry, if any, an item state transition produces.
 *
 * `disbursed` is emitted on entry to `confirmed`, and `confirmed` is terminal
 * with no outgoing edges, so an item can produce at most one `disbursed` entry
 * for as long as the state machine holds. That is the second half of the
 * double-pay property.
 *
 * `obligation` is not here: it is written once per item at batch approval, in
 * the same transaction that freezes the snapshot (docs/04 section 4).
 */
export function ledgerEntryForTransition(
  from: ItemStatus,
  to: ItemStatus,
): LedgerEntryType | null {
  if (from === to) return null;
  if (to === 'confirmed') return 'disbursed';
  if (to === 'failed') return 'failed';
  return null;
}

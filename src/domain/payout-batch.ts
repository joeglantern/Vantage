/**
 * The batch state machine from docs/03, plus the one guard that keeps the
 * reconciliation pack honest: a batch cannot leave `disbursing` while any item
 * is unresolved.
 */
import { err, type Result } from './result.js';
import { isUnresolved, type ItemStatus } from './payout-item.js';

export const BATCH_STATUSES = [
  'draft',
  'validating',
  'needs_fixes',
  'pending_approval',
  'approved',
  'disbursing',
  'completed',
  'completed_with_failures',
  'closed',
  'cancelled',
] as const;
export type BatchStatus = (typeof BATCH_STATUSES)[number];

export type BatchEvent =
  | { kind: 'import_complete' }
  | { kind: 'errors_found' }
  | { kind: 'corrected' }
  | { kind: 'validated_clean' }
  | { kind: 'approved' }
  | { kind: 'sent_back' }
  | { kind: 'jobs_enqueued' }
  | { kind: 'all_items_terminal'; anyFailed: boolean }
  | { kind: 'pack_generated' }
  | { kind: 'cancelled' };

export type BatchEventKind = BatchEvent['kind'];

export type BatchTransitionError =
  | 'illegal_transition'
  | 'unresolved_items_remain'
  | 'approver_is_preparer';

const TRANSITIONS: Readonly<
  Record<BatchStatus, Partial<Record<BatchEventKind, BatchStatus>>>
> = {
  draft: { import_complete: 'validating', cancelled: 'cancelled' },
  validating: { errors_found: 'needs_fixes', validated_clean: 'pending_approval' },
  needs_fixes: { corrected: 'validating', cancelled: 'cancelled' },
  pending_approval: { approved: 'approved', sent_back: 'draft', cancelled: 'cancelled' },
  approved: { jobs_enqueued: 'disbursing' },
  // `all_items_terminal` resolves to one of two statuses; see below.
  disbursing: { all_items_terminal: 'completed' },
  completed: { pack_generated: 'closed' },
  completed_with_failures: { pack_generated: 'closed' },
  closed: {},
  cancelled: {},
};

export interface BatchTransitionContext {
  /** Every item's status. Checked before leaving `disbursing`. */
  readonly itemStatuses?: readonly ItemStatus[];
  /** Who prepared the batch, and who is approving it. Maker-checker. */
  readonly preparedBy?: string;
  readonly approvedBy?: string;
}

export function transitionBatch(
  from: BatchStatus,
  event: BatchEvent,
  context: BatchTransitionContext = {},
): Result<{ to: BatchStatus }, BatchTransitionError> {
  const mapped = TRANSITIONS[from][event.kind];
  if (mapped === undefined) return err('illegal_transition');

  // Maker-checker. The database constraint is the authority. This is here so
  // the failure surfaces as a domain error rather than a constraint violation.
  if (event.kind === 'approved') {
    const { preparedBy, approvedBy } = context;
    if (preparedBy !== undefined && approvedBy !== undefined && preparedBy === approvedBy) {
      return err('approver_is_preparer');
    }
  }

  if (event.kind === 'all_items_terminal') {
    // The guard. An item whose outcome nobody knows must not be rounded away
    // into a batch summary a donor will read as complete.
    const statuses = context.itemStatuses ?? [];
    if (statuses.some(isUnresolved)) return err('unresolved_items_remain');
    return { ok: true, to: event.anyFailed ? 'completed_with_failures' : 'completed' };
  }

  return { ok: true, to: mapped };
}

/** A batch may only be closed once every item has a known outcome. */
export function canClose(itemStatuses: readonly ItemStatus[]): boolean {
  return !itemStatuses.some(isUnresolved);
}

export function isBatchStatus(value: string): value is BatchStatus {
  return (BATCH_STATUSES as readonly string[]).includes(value);
}

/**
 * The mapping from a domain status to its visual treatment.
 *
 * The status lists are imported from the domain layer rather than retyped, so a
 * status added to the state machine and not given a treatment here is a compile
 * error rather than a blank pill discovered in production.
 *
 * `unresolved` is deliberately not a sixth colour. It has no fill, a dashed
 * border and neutral ink, because `unknown` is an open question and not an
 * outcome. It stays distinct in greyscale, in print, and for anyone who cannot
 * separate red from green. See design/03-tokens.md.
 */
import { ITEM_STATUSES, type ItemStatus } from '@domain/payout-item';
import { BATCH_STATUSES, type BatchStatus } from '@domain/payout-batch';
import type { Severity } from '@domain/validation';

export type Tone = 'pending' | 'progress' | 'ok' | 'warn' | 'fail' | 'unresolved';

export interface Treatment {
  readonly tone: Tone;
  readonly label: string;
}

const ITEM_TREATMENTS: Readonly<Record<ItemStatus, Treatment>> = {
  pending: { tone: 'pending', label: 'Pending' },
  queued: { tone: 'pending', label: 'Queued' },
  sending: { tone: 'progress', label: 'Sending' },
  sent: { tone: 'progress', label: 'Sent' },
  unknown: { tone: 'unresolved', label: 'Unresolved' },
  confirmed: { tone: 'ok', label: 'Confirmed' },
  failed: { tone: 'fail', label: 'Failed' },
};

const BATCH_TREATMENTS: Readonly<Record<BatchStatus, Treatment>> = {
  draft: { tone: 'pending', label: 'Draft' },
  validating: { tone: 'pending', label: 'Validating' },
  needs_fixes: { tone: 'warn', label: 'Needs fixes' },
  pending_approval: { tone: 'warn', label: 'Pending approval' },
  approved: { tone: 'progress', label: 'Approved' },
  disbursing: { tone: 'progress', label: 'Disbursing' },
  completed: { tone: 'ok', label: 'Completed' },
  completed_with_failures: { tone: 'warn', label: 'Completed with failures' },
  closed: { tone: 'ok', label: 'Closed' },
  cancelled: { tone: 'fail', label: 'Cancelled' },
};

/**
 * A finding's severity, on the exception queue. Blocking stops approval and
 * borrows the failure hue; a warning is accepted by a named person and borrows
 * the warning hue. Keyed by the domain type, so a third severity is a compile
 * error here before it is a blank mark on a row.
 */
const SEVERITY_TREATMENTS: Readonly<Record<Severity, Treatment>> = {
  blocking: { tone: 'fail', label: 'Must fix' },
  warning: { tone: 'warn', label: 'Warning' },
};

export function severityTreatment(severity: Severity): Treatment {
  return SEVERITY_TREATMENTS[severity];
}

export function itemTreatment(status: ItemStatus): Treatment {
  return ITEM_TREATMENTS[status];
}

export function batchTreatment(status: BatchStatus): Treatment {
  return BATCH_TREATMENTS[status];
}

/** Exported so a test can assert every domain status has a treatment. */
export const ALL_ITEM_STATUSES = ITEM_STATUSES;
export const ALL_BATCH_STATUSES = BATCH_STATUSES;

/**
 * The batch validation rules table from docs/04, section 2.
 *
 * Blocking issues stop approval. Warnings must each be acknowledged by a named
 * human, and the acknowledgement is itself an audit event.
 *
 * The most expensive mistake in this domain is a misplaced decimal: 5000 typed
 * as 50000 sends ten times the intended amount to somebody with no obligation
 * to give it back. Three separate rules exist to catch it.
 */
import { compareMoney, isWholeMajorUnit, type Currency, type Money } from './money.js';
import { normaliseMsisdn, type Msisdn, type MsisdnError } from './msisdn.js';

export type Severity = 'blocking' | 'warning';

export type FindingCode =
  // Blocking
  | 'msisdn_invalid'
  | 'amount_not_positive'
  | 'amount_not_whole_shilling'
  | 'duplicate_recipient_in_batch'
  | 'amount_exceeds_item_limit'
  | 'batch_exceeds_batch_limit'
  // Warning
  | 'name_differs_from_stored'
  | 'recipient_new_to_organisation'
  | 'amount_deviates_from_usual'
  | 'duplicate_msisdn_different_name';

export interface Finding {
  readonly code: FindingCode;
  readonly severity: Severity;
  /** Row index in the uploaded file, or null for batch-level findings. */
  readonly row: number | null;
  readonly message: string;
}

/** One row as it came out of the spreadsheet, before any interpretation. */
export interface ImportedRow {
  readonly row: number;
  readonly externalRef: string | null;
  readonly fullName: string;
  readonly rawMsisdn: string;
  readonly amount: Money;
}

/** What the organisation already knows about a recipient. */
export interface KnownRecipient {
  readonly msisdn: Msisdn;
  readonly fullName: string;
  /** Median of this recipient's previous amounts, if there are any. */
  readonly usualAmountMinor: bigint | null;
}

/** Configured once per organisation, and raised by someone other than the preparer. */
export interface BatchPolicy {
  readonly currency: Currency;
  readonly perItemLimit: Money;
  readonly perBatchLimit: Money;
  /** Fraction, e.g. 0.5 for the greater-than-50% rule in docs/04. */
  readonly deviationWarningRatio: number;
}

export interface ValidatedRow {
  readonly row: number;
  readonly msisdn: Msisdn | null;
  readonly amount: Money;
  readonly fullName: string;
  readonly externalRef: string | null;
}

export interface ValidationOutcome {
  readonly rows: readonly ValidatedRow[];
  readonly findings: readonly Finding[];
  readonly blockingCount: number;
  readonly warningCount: number;
  readonly totalMinor: bigint;
}

/**
 * What to tell a programme officer when a number cannot be read.
 *
 * These used to be the raw error code interpolated into a sentence, so the
 * exception queue showed somebody the word `contains_letters`. A finding is
 * read by a person under time pressure who has to fix it, so each message says
 * what is wrong and what to do about it.
 *
 * Keyed by MsisdnError, so a new failure mode in the normaliser is a compile
 * error here rather than a bare token appearing on screen.
 */
const MSISDN_MESSAGES: Readonly<Record<MsisdnError, string>> = {
  empty: 'No phone number in this row. Add one, or remove the row.',
  contains_letters:
    'The phone number contains letters or symbols. Correct it to digits only.',
  not_a_kenyan_mobile:
    'Not a Kenyan mobile number. It should start 07 or 01, or 254 with the country code.',
  wrong_length:
    'The phone number has the wrong number of digits. A Kenyan mobile has nine after the country code.',
};

export function validateBatch(
  rows: readonly ImportedRow[],
  policy: BatchPolicy,
  known: ReadonlyMap<string, KnownRecipient>,
): ValidationOutcome {
  const findings: Finding[] = [];
  const validated: ValidatedRow[] = [];

  const seenMsisdnRows = new Map<string, number>();
  const seenMsisdnNames = new Map<string, string>();
  let totalMinor = 0n;

  for (const row of rows) {
    const normalised = normaliseMsisdn(row.rawMsisdn);
    const msisdn = normalised.ok ? normalised.msisdn : null;

    if (!normalised.ok) {
      findings.push({
        code: 'msisdn_invalid',
        severity: 'blocking',
        row: row.row,
        message: MSISDN_MESSAGES[normalised.reason],
      });
    }

    if (row.amount.amountMinor <= 0n) {
      findings.push({
        code: 'amount_not_positive',
        severity: 'blocking',
        row: row.row,
        message: 'Amount must be greater than zero. Correct it, or remove the row.',
      });
    } else if (!isWholeMajorUnit(row.amount)) {
      findings.push({
        code: 'amount_not_whole_shilling',
        severity: 'blocking',
        row: row.row,
        message: 'M-Pesa moves whole shillings and this amount has cents. Round it to a whole shilling.',
      });
    }

    if (compareMoney(row.amount, policy.perItemLimit) > 0) {
      findings.push({
        code: 'amount_exceeds_item_limit',
        severity: 'blocking',
        row: row.row,
        message:
          'Amount is above the per-item limit. Check for a misplaced decimal, or ask an admin to raise the limit.',
      });
    }

    if (msisdn !== null) {
      const firstSeenAt = seenMsisdnRows.get(msisdn);
      if (firstSeenAt !== undefined) {
        // The classic double-pay source, caught before anything is approved.
        findings.push({
          code: 'duplicate_recipient_in_batch',
          severity: 'blocking',
          row: row.row,
          message:
            'This number already appears in the batch at row ' + firstSeenAt + '. Remove one of the two rows.',
        });
      } else {
        seenMsisdnRows.set(msisdn, row.row);
      }

      const priorName = seenMsisdnNames.get(msisdn);
      if (priorName !== undefined && !namesMatch(priorName, row.fullName)) {
        findings.push({
          code: 'duplicate_msisdn_different_name',
          severity: 'warning',
          row: row.row,
          message:
            'Same number as ' +
            priorName +
            ', under a different name. Two people sharing a phone is common, so check this is deliberate.',
        });
      }
      seenMsisdnNames.set(msisdn, row.fullName);

      const record = known.get(msisdn);
      if (record === undefined) {
        findings.push({
          code: 'recipient_new_to_organisation',
          severity: 'warning',
          row: row.row,
          message: 'This recipient is new to your organisation. Check the number before approving.',
        });
      } else {
        if (!namesMatch(record.fullName, row.fullName)) {
          findings.push({
            code: 'name_differs_from_stored',
            severity: 'warning',
            row: row.row,
            message:
              'Name differs from the stored ' +
              record.fullName +
              '. The number may have been reassigned, so check before paying.',
          });
        }
        if (
          record.usualAmountMinor !== null &&
          record.usualAmountMinor > 0n &&
          deviatesBeyond(
            row.amount.amountMinor,
            record.usualAmountMinor,
            policy.deviationWarningRatio,
          )
        ) {
          findings.push({
            code: 'amount_deviates_from_usual',
            severity: 'warning',
            row: row.row,
            message: 'Amount differs sharply from what this recipient usually receives. Check it is intended.',
          });
        }
      }
    }

    totalMinor += row.amount.amountMinor;
    validated.push({
      row: row.row,
      msisdn,
      amount: row.amount,
      fullName: row.fullName,
      externalRef: row.externalRef,
    });
  }

  if (totalMinor > policy.perBatchLimit.amountMinor) {
    findings.push({
      code: 'batch_exceeds_batch_limit',
      severity: 'blocking',
      row: null,
      message:
        'Batch total is above the per-batch limit. Split the batch, or ask an admin to raise the limit.',
    });
  }

  return {
    rows: validated,
    findings,
    blockingCount: findings.filter((f) => f.severity === 'blocking').length,
    warningCount: findings.filter((f) => f.severity === 'warning').length,
    totalMinor,
  };
}

/** A batch with any blocking finding cannot be submitted for approval. */
export function canSubmitForApproval(outcome: ValidationOutcome): boolean {
  return outcome.blockingCount === 0;
}

/**
 * Deliberately forgiving: casing, extra whitespace and word order vary between
 * an organisation's spreadsheet and its own records, and a warning on every row
 * would train people to click through warnings.
 */
function namesMatch(a: string, b: string): boolean {
  return normaliseName(a) === normaliseName(b);
}

function normaliseName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z\s]/g, '')
    .split(/\s+/)
    .filter((part) => part !== '')
    .sort()
    .join(' ');
}

/**
 * Integer-only deviation check: no float ever touches an amount. The ratio is
 * the only float in sight, and it is converted to a scaled integer before it
 * meets any money.
 */
const DEVIATION_SCALE = 10_000;

function deviatesBeyond(amountMinor: bigint, usualMinor: bigint, ratio: number): boolean {
  const scale = BigInt(DEVIATION_SCALE);
  const scaledRatio = BigInt(Math.round(ratio * DEVIATION_SCALE));
  const difference =
    amountMinor > usualMinor ? amountMinor - usualMinor : usualMinor - amountMinor;
  return difference * scale > usualMinor * scaledRatio;
}

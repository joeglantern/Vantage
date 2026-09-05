/**
 * Fixtures for the exception queue and the approval screen.
 *
 * The queue does not carry a hand-written list of findings. It transcribes the
 * twenty rows of test/fixtures/cohort-messy.csv exactly as typed and runs the
 * real `validateBatch` from src/domain over them, so every finding, message and
 * severity on screen is the domain's own. A test asserts the transcription
 * matches the CSV, the same way the import preview is pinned to the file.
 *
 * Rows 17 and 19 are why the queue is grouped per row rather than per finding.
 * Each is a duplicate number (blocking), a different name on a shared phone
 * (warning) and a name that differs from the record (warning), all at once,
 * and all three have to be visible on the one row.
 */
import { moneyFromMajorString, type Money } from '@domain/money';
import type { Msisdn } from '@domain/msisdn';
import {
  validateBatch,
  type BatchPolicy,
  type Finding,
  type ImportedRow,
  type KnownRecipient,
  type Severity,
  type ValidationOutcome,
} from '@domain/validation';
import { LIMITS } from '@web/data/fixtures';

export const REVIEW_BATCH = {
  reference: 'YCIC-2026-04',
  programme: 'YCIC April 2026 stipend',
  fileName: 'cohort-messy.csv',
  uploadedAt: '3 Apr 2026, 09:41',
  preparedBy: 'Wanjiku Ndegwa',
  submittedAt: '3 Apr 2026, 11:08',
  /** The approver who is not the preparer. See MEMBERS in fixtures.ts. */
  approver: { name: 'David Ochieng', role: 'Approver' },
} as const;

/** One row of the messy sheet, as typed. `n` is the 1-based row in the file. */
export interface TypedRow {
  readonly n: number;
  readonly ref: string;
  readonly name: string;
  readonly phone: string;
  readonly amount: string;
  readonly note: string;
}

/** Every row of cohort-messy.csv, verbatim. The test pins this to the file. */
export const TYPED_ROWS: readonly TypedRow[] = [
  { n: 1, ref: 'YCIC-001', name: 'Amina Wanjiru', phone: '0712345678', amount: '1500', note: 'March stipend' },
  { n: 2, ref: 'YCIC-002', name: 'Peter Kimani Mwangi', phone: '+254722345678', amount: '1,500', note: 'comma in the amount' },
  { n: 3, ref: 'YCIC-003', name: 'Grace Achieng Otieno', phone: '254733456789', amount: '1500.00', note: 'trailing zeros' },
  { n: 4, ref: 'YCIC-004', name: 'Brian Odhiambo', phone: '0110123456', amount: '1500', note: 'the 01xx range' },
  { n: 5, ref: 'YCIC-005', name: 'Faith Njeri', phone: '745678901', amount: '1500', note: 'bare national number' },
  { n: 6, ref: 'YCIC-006', name: 'Samuel Kipchoge Rotich', phone: "'0723456780", amount: '1500', note: 'excel text coercion' },
  { n: 7, ref: 'YCIC-007', name: 'Mercy Wambui', phone: '0798 765 432', amount: '1500', note: 'spaces from the phone book' },
  { n: 8, ref: 'YCIC-008', name: 'Joseph Mutua Musyoka', phone: '+254-100-234-567', amount: '1500', note: 'hyphens' },
  { n: 9, ref: 'YCIC-009', name: 'Wanjiru Amina', phone: '254712345678', amount: '1500', note: 'same person as row 1 in another format' },
  { n: 10, ref: 'YCIC-010', name: 'Kevin Otieno', phone: '07123456ab', amount: '1500', note: 'number typed into a text column' },
  { n: 11, ref: 'YCIC-011', name: 'Lucy Nyambura', phone: '071234567', amount: '1500', note: 'one digit short' },
  { n: 12, ref: 'YCIC-012', name: 'Office Line', phone: '0202345678', amount: '1500', note: 'landline not a mobile' },
  { n: 13, ref: 'YCIC-013', name: 'Dennis Kariuki', phone: '0745112233', amount: '0', note: 'unpaid this cycle but left in the sheet' },
  { n: 14, ref: 'YCIC-014', name: 'Rose Atieno', phone: '0756223344', amount: '1500.50', note: 'cents that mpesa cannot move' },
  { n: 15, ref: 'YCIC-015', name: 'Anthony Mwangi', phone: '0767334455', amount: '50000', note: 'misplaced decimal meant 5000' },
  { n: 16, ref: 'YCIC-016', name: 'Nancy Wairimu', phone: '0778445566', amount: '1500', note: 'brand new participant' },
  { n: 17, ref: 'YCIC-017', name: 'P. K. Mwangi', phone: '0722345678', amount: '1500', note: 'name differs from our records' },
  { n: 18, ref: 'YCIC-018', name: 'Amina Wanjiru', phone: '0789556677', amount: '4500', note: 'three times her usual amount' },
  { n: 19, ref: 'YCIC-019', name: 'Cynthia Adhiambo', phone: '0798765432', amount: '1500', note: 'shares a phone with Mercy in row 7' },
  { n: 20, ref: 'YCIC-020', name: 'Michael Kiprop', phone: '0712998877', amount: '1500', note: 'March stipend' },
];

/** The organisation limits, the same values the Settings screen shows. */
export const REVIEW_POLICY: BatchPolicy = {
  currency: 'KES',
  perItemLimit: { amountMinor: BigInt(LIMITS.perItemMinor), currency: 'KES' },
  perBatchLimit: { amountMinor: BigInt(LIMITS.perBatchMinor), currency: 'KES' },
  deviationWarningRatio: LIMITS.deviationBps / 10_000,
};

/**
 * What the organisation has on file from earlier cycles. Mirrors the `known`
 * map in test/unit/fixtures.test.ts so the two screens agree with the tests.
 */
const ON_FILE: readonly (readonly [string, string, bigint])[] = [
  ['254712345678', 'Amina Wanjiru', 150000n],
  ['254722345678', 'Peter Kimani Mwangi', 150000n],
  ['254733456789', 'Grace Achieng Otieno', 150000n],
  ['254110123456', 'Brian Odhiambo', 150000n],
  ['254745678901', 'Faith Njeri', 150000n],
  ['254723456780', 'Samuel Kipchoge Rotich', 150000n],
  ['254798765432', 'Mercy Wambui', 150000n],
  ['254100234567', 'Joseph Mutua Musyoka', 150000n],
  ['254711223344', 'Esther Chebet', 150000n],
  ['254736112233', 'David Omondi Ouma', 150000n],
  ['254745112233', 'Dennis Kariuki', 150000n],
  ['254756223344', 'Rose Atieno', 150000n],
  ['254767334455', 'Anthony Mwangi', 150000n],
  ['254789556677', 'Amina Wanjiru', 150000n],
  ['254712998877', 'Michael Kiprop', 150000n],
];

export const KNOWN_RECIPIENTS: ReadonlyMap<string, KnownRecipient> = new Map(
  ON_FILE.map(([msisdn, fullName, usualAmountMinor]) => [
    msisdn,
    { msisdn: msisdn as Msisdn, fullName, usualAmountMinor },
  ]),
);

const ZERO: Money = { amountMinor: 0n, currency: 'KES' };

/** The typed sheet as the importer hands it to validation. */
export function toImportedRows(rows: readonly TypedRow[]): ImportedRow[] {
  return rows.map((row) => {
    const amount = moneyFromMajorString(row.amount, 'KES');
    return {
      row: row.n,
      externalRef: row.ref,
      fullName: row.name,
      rawMsisdn: row.phone,
      // The real importer raises its own blocking finding for an unreadable
      // amount. Here it becomes zero, which the rules already reject.
      amount: amount.ok ? amount.money : ZERO,
    };
  });
}

/** Run the real rules. Exported so the tests can compare against the file. */
export function validateTyped(rows: readonly TypedRow[]): ValidationOutcome {
  return validateBatch(toImportedRows(rows), REVIEW_POLICY, KNOWN_RECIPIENTS);
}

/**
 * A row of the queue: the typed row, its findings, and the worst severity
 * among them. `null` means the row is clean and belongs in the collapsed
 * count.
 */
export interface QueueRow {
  readonly typed: TypedRow;
  readonly amount: Money;
  readonly findings: readonly Finding[];
  readonly worst: Severity | null;
}

const SEVERITY_RANK: Readonly<Record<Severity, number>> = { blocking: 0, warning: 1 };

export function worstOf(findings: readonly Finding[]): Severity | null {
  let worst: Severity | null = null;
  for (const f of findings) {
    if (worst === null || SEVERITY_RANK[f.severity] < SEVERITY_RANK[worst]) worst = f.severity;
  }
  return worst;
}

/**
 * Groups findings by row. Order, always: blocking first, then warnings, then
 * clean, and file order inside each group so a person can follow the sheet.
 */
export function buildQueue(rows: readonly TypedRow[], outcome: ValidationOutcome): QueueRow[] {
  const queue = rows.map((typed): QueueRow => {
    const findings = outcome.findings.filter((f) => f.row === typed.n);
    const validated = outcome.rows.find((r) => r.row === typed.n);
    return { typed, amount: validated?.amount ?? ZERO, findings, worst: worstOf(findings) };
  });
  const rank = (row: QueueRow) => (row.worst === null ? 2 : SEVERITY_RANK[row.worst]);
  return queue.sort((a, b) => rank(a) - rank(b) || a.typed.n - b.typed.n);
}

/** Batch-level findings have no row to jump to and sit in the summary alone. */
export function batchLevelFindings(outcome: ValidationOutcome): Finding[] {
  return outcome.findings.filter((f) => f.row === null);
}

/**
 * The messy sheet with its blocking rows corrected the way a programme officer
 * would: the duplicates and the landline removed, the unreadable numbers fixed,
 * the zero row dropped, the cents removed and the misplaced decimal put back. What is left
 * warns but does not block. This is the sheet the approval screen sees.
 */
export const CORRECTED_ROWS: readonly TypedRow[] = TYPED_ROWS.flatMap((row): TypedRow[] => {
  switch (row.n) {
    case 9:
    case 12:
    case 13:
    case 17:
    case 19:
      return [];
    case 10:
      return [{ ...row, phone: '0723456680' }];
    case 11:
      return [{ ...row, phone: '0712345671' }];
    case 14:
      return [{ ...row, amount: '1500' }];
    case 15:
      return [{ ...row, amount: '5000' }];
    default:
      return [row];
  }
});

/** Who acknowledged each warning on the corrected sheet, for the approver. */
export interface Acknowledgement {
  readonly row: number;
  readonly by: string;
  readonly at: string;
}

export const ACKNOWLEDGEMENTS: readonly Acknowledgement[] = [
  { row: 10, by: 'Wanjiku Ndegwa', at: '3 Apr 2026, 10:52' },
  { row: 11, by: 'Wanjiku Ndegwa', at: '3 Apr 2026, 10:53' },
  { row: 15, by: 'Wanjiku Ndegwa', at: '3 Apr 2026, 10:54' },
  { row: 16, by: 'Wanjiku Ndegwa', at: '3 Apr 2026, 10:55' },
  { row: 18, by: 'Wanjiku Ndegwa', at: '3 Apr 2026, 11:02' },
];

/** The edits the preparer made, each one an audit event the approver can read. */
export const EDITS: readonly { row: number; what: string; by: string; at: string }[] = [
  { row: 10, what: 'Phone corrected from 07123456ab', by: 'Wanjiku Ndegwa', at: '3 Apr 2026, 10:44' },
  { row: 11, what: 'Phone corrected from 071234567', by: 'Wanjiku Ndegwa', at: '3 Apr 2026, 10:46' },
  { row: 14, what: 'Amount corrected from 1500.50', by: 'Wanjiku Ndegwa', at: '3 Apr 2026, 10:49' },
  { row: 15, what: 'Amount corrected from 50000', by: 'Wanjiku Ndegwa', at: '3 Apr 2026, 10:50' },
  { row: 9, what: 'Row removed, duplicate of row 1', by: 'Wanjiku Ndegwa', at: '3 Apr 2026, 10:42' },
  { row: 12, what: 'Row removed, a landline cannot receive M-Pesa', by: 'Wanjiku Ndegwa', at: '3 Apr 2026, 10:47' },
  { row: 13, what: 'Row removed, zero amount', by: 'Wanjiku Ndegwa', at: '3 Apr 2026, 10:48' },
  { row: 17, what: 'Row removed, same person and number as row 2', by: 'Wanjiku Ndegwa', at: '3 Apr 2026, 10:50' },
  { row: 19, what: 'Row removed, duplicate of row 7', by: 'Wanjiku Ndegwa', at: '3 Apr 2026, 10:51' },
];

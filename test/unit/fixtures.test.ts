/**
 * The fixture spreadsheets, run through the real validation rules.
 *
 * A fixture nobody asserts against drifts into fiction. These tests pin what
 * each row is supposed to trigger, so cohort-messy.csv stays an honest sample
 * of what a programme officer's sheet actually looks like rather than a file
 * somebody once wrote and stopped trusting.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseCsv } from '../support/csv.js';
import { moneyFromMajorString } from '@domain/money';
import type { Msisdn } from '@domain/msisdn';
import {
  canSubmitForApproval,
  validateBatch,
  type BatchPolicy,
  type FindingCode,
  type ImportedRow,
  type KnownRecipient,
} from '@domain/validation';

const KES = 'KES' as const;

/** Matches the organisation defaults in the schema: KES 20,000 and KES 500,000. */
const policy: BatchPolicy = {
  currency: KES,
  perItemLimit: { amountMinor: 2_000_000n, currency: KES },
  perBatchLimit: { amountMinor: 50_000_000n, currency: KES },
  deviationWarningRatio: 0.5,
};

/** What the organisation already has on file from previous cycles. */
const known = new Map<string, KnownRecipient>(
  (
    [
      // The ten in cohort-clean.csv, exactly as they are on file.
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
      // Known only from earlier cycles, so they appear in the messy sheet.
      ['254745112233', 'Dennis Kariuki', 150000n],
      ['254756223344', 'Rose Atieno', 150000n],
      ['254767334455', 'Anthony Mwangi', 150000n],
      ['254789556677', 'Amina Wanjiru', 150000n],
      ['254712998877', 'Michael Kiprop', 150000n],
    ] as const
  ).map(([msisdn, fullName, usual]) => [
    msisdn,
    { msisdn: msisdn as Msisdn, fullName, usualAmountMinor: usual },
  ]),
);

function loadFixture(name: string): ImportedRow[] {
  const path = fileURLToPath(new URL(`../fixtures/${name}`, import.meta.url));
  return parseCsv(readFileSync(path, 'utf8')).map((row, index) => {
    const amount = moneyFromMajorString(row['amount'] ?? '', KES);
    return {
      row: index + 1,
      externalRef: row['participant_ref'] ?? null,
      fullName: row['full_name'] ?? '',
      rawMsisdn: row['phone'] ?? '',
      // An unparseable amount is its own blocking finding in the real importer.
      // Here it becomes zero, which the rules already reject.
      amount: amount.ok ? amount.money : { amountMinor: 0n, currency: KES },
    };
  });
}

/** The finding codes raised for one row, for readable assertions. */
function codesForRow(
  findings: readonly { code: FindingCode; row: number | null }[],
  row: number,
): FindingCode[] {
  return findings.filter((f) => f.row === row).map((f) => f.code);
}

describe('cohort-clean.csv', () => {
  const rows = loadFixture('cohort-clean.csv');

  it('has ten participants', () => {
    expect(rows).toHaveLength(10);
  });

  it('passes validation with nothing blocking and nothing to acknowledge', () => {
    const outcome = validateBatch(rows, policy, known);
    expect(outcome.findings).toEqual([]);
    expect(canSubmitForApproval(outcome)).toBe(true);
  });

  it('totals KES 15,000 exactly', () => {
    const outcome = validateBatch(rows, policy, known);
    expect(outcome.totalMinor).toBe(1_500_000n);
  });

  it('normalises every phone format in it', () => {
    // 0712, +254722, 254733, 0110, bare 745, spaced, +254 711, 0100.
    const outcome = validateBatch(rows, policy, known);
    for (const row of outcome.rows) {
      expect(row.msisdn, `row ${row.row}`).not.toBeNull();
      expect(row.msisdn, `row ${row.row}`).toMatch(/^254[71]\d{8}$/);
    }
  });
});

describe('cohort-messy.csv', () => {
  const rows = loadFixture('cohort-messy.csv');
  const outcome = validateBatch(rows, policy, known);

  it('has twenty rows', () => {
    expect(rows).toHaveLength(20);
  });

  it('cannot be submitted for approval', () => {
    expect(canSubmitForApproval(outcome)).toBe(false);
    expect(outcome.blockingCount).toBeGreaterThan(0);
  });

  describe('the rows that are fine', () => {
    it.each([1, 2, 3, 4, 5, 6, 7, 8, 20])('row %i raises nothing', (row) => {
      expect(codesForRow(outcome.findings, row)).toEqual([]);
    });

    it('reads an amount written as 1,500 and as 1500.00', () => {
      expect(outcome.rows[1]?.amount.amountMinor).toBe(150000n);
      expect(outcome.rows[2]?.amount.amountMinor).toBe(150000n);
    });

    it('strips the apostrophe Excel adds to a text-formatted number', () => {
      expect(outcome.rows[5]?.msisdn).toBe('254723456780');
    });
  });

  describe('the rows that block', () => {
    it('row 9 is row 1 again in a different format', () => {
      expect(codesForRow(outcome.findings, 9)).toContain('duplicate_recipient_in_batch');
    });

    it('row 10 has letters in the phone column', () => {
      expect(codesForRow(outcome.findings, 10)).toContain('msisdn_invalid');
    });

    it('row 11 is one digit short', () => {
      expect(codesForRow(outcome.findings, 11)).toContain('msisdn_invalid');
    });

    it('row 12 is a landline', () => {
      expect(codesForRow(outcome.findings, 12)).toContain('msisdn_invalid');
    });

    it('row 13 is a zero amount left in the sheet', () => {
      expect(codesForRow(outcome.findings, 13)).toContain('amount_not_positive');
    });

    it('row 14 has cents M-Pesa cannot move', () => {
      expect(codesForRow(outcome.findings, 14)).toContain('amount_not_whole_shilling');
    });

    it('row 15 is the misplaced decimal, and the limit catches it', () => {
      // 5000 typed as 50000. This is the row the whole limit mechanism exists
      // for, and it is the one that costs real money when nothing catches it.
      expect(codesForRow(outcome.findings, 15)).toContain('amount_exceeds_item_limit');
    });
  });

  describe('the rows that only warn', () => {
    it('row 16 is a participant new to the organisation', () => {
      expect(codesForRow(outcome.findings, 16)).toEqual(['recipient_new_to_organisation']);
    });

    it('row 17 is an initialised name for somebody we know', () => {
      expect(codesForRow(outcome.findings, 17)).toContain('name_differs_from_stored');
    });

    it('row 18 is three times her usual amount', () => {
      expect(codesForRow(outcome.findings, 18)).toContain('amount_deviates_from_usual');
    });

    it('row 19 shares a phone with row 7 under a different name', () => {
      const codes = codesForRow(outcome.findings, 19);
      // Two people on one handset is legitimate and common, so it warns. It is
      // also a duplicate number in one batch, which blocks. Both are true.
      expect(codes).toContain('duplicate_msisdn_different_name');
      expect(codes).toContain('duplicate_recipient_in_batch');
    });

    it('none of the warning-only rows block the batch on their own', () => {
      const warningOnly = validateBatch(
        rows.filter((r) => [16, 17, 18].includes(r.row)),
        policy,
        known,
      );
      expect(warningOnly.blockingCount).toBe(0);
      expect(warningOnly.warningCount).toBeGreaterThan(0);
    });
  });

  describe('the batch as a whole', () => {
    it('raises a batch-level finding when the total goes over the limit', () => {
      // Not from this file, which is well under. A cycle of 400 people at the
      // per-item ceiling is what trips it.
      const big = Array.from({ length: 400 }, (_, i) => ({
        row: i + 1,
        externalRef: `BIG-${i}`,
        fullName: `Participant ${i}`,
        rawMsisdn: `07${String(10000000 + i).padStart(8, '0')}`,
        amount: { amountMinor: 2_000_000n, currency: KES },
      }));
      const outcomeBig = validateBatch(big, policy, known);
      const batchFinding = outcomeBig.findings.find((f) => f.code === 'batch_exceeds_batch_limit');
      expect(batchFinding).toBeDefined();
      expect(batchFinding?.row).toBeNull();
    });

    it('gives every finding a row to point at, or marks it batch-level', () => {
      // The exception queue needs this. A finding with no anchor is one a
      // programme officer cannot act on.
      for (const finding of outcome.findings) {
        expect(finding.row === null || finding.row >= 1).toBe(true);
        expect(finding.message.length).toBeGreaterThan(0);
      }
    });
  });
});

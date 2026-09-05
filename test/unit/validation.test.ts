import { describe, expect, it } from 'vitest';
import { canSubmitForApproval, validateBatch, type BatchPolicy, type ImportedRow, type KnownRecipient } from '@domain/validation';
import type { Msisdn } from '@domain/msisdn';

const KES = 'KES' as const;
const kes = (minor: bigint) => ({ amountMinor: minor, currency: KES });

const policy: BatchPolicy = {
  currency: KES,
  perItemLimit: kes(5_000_00n),
  perBatchLimit: kes(500_000_00n),
  deviationWarningRatio: 0.5,
};

const row = (over: Partial<ImportedRow> & { row: number }): ImportedRow => ({
  externalRef: null,
  fullName: 'Amina Wanjiru',
  rawMsisdn: '0712345678',
  amount: kes(1_500_00n),
  ...over,
});

const known = (entries: KnownRecipient[]) =>
  new Map(entries.map((e) => [e.msisdn as string, e]));

const AMINA: KnownRecipient = {
  msisdn: '254712345678' as Msisdn,
  fullName: 'Amina Wanjiru',
  usualAmountMinor: 1_500_00n,
};

describe('blocking rules', () => {
  it('passes a clean batch of known recipients', () => {
    const outcome = validateBatch([row({ row: 1 })], policy, known([AMINA]));
    expect(outcome.blockingCount).toBe(0);
    expect(outcome.warningCount).toBe(0);
    expect(canSubmitForApproval(outcome)).toBe(true);
    expect(outcome.totalMinor).toBe(1_500_00n);
  });

  it('blocks an unusable phone number', () => {
    const outcome = validateBatch([row({ row: 1, rawMsisdn: '08123' })], policy, known([]));
    expect(outcome.findings.map((f) => f.code)).toContain('msisdn_invalid');
    expect(canSubmitForApproval(outcome)).toBe(false);
  });

  it('blocks cents, because M-Pesa cannot move them', () => {
    const outcome = validateBatch([row({ row: 1, amount: kes(1_500_50n) })], policy, known([AMINA]));
    expect(outcome.findings.map((f) => f.code)).toContain('amount_not_whole_shilling');
  });

  it('blocks a zero amount', () => {
    const outcome = validateBatch([row({ row: 1, amount: kes(0n) })], policy, known([AMINA]));
    expect(outcome.findings.map((f) => f.code)).toContain('amount_not_positive');
  });

  it('blocks the same person appearing twice, whatever format the number came in', () => {
    const outcome = validateBatch(
      [row({ row: 1, rawMsisdn: '0712345678' }), row({ row: 2, rawMsisdn: '+254712345678' })],
      policy,
      known([AMINA]),
    );
    const duplicate = outcome.findings.find((f) => f.code === 'duplicate_recipient_in_batch');
    expect(duplicate).toBeDefined();
    expect(duplicate?.row).toBe(2);
    expect(duplicate?.message).toContain('row 1');
  });

  it('blocks the misplaced decimal at the item limit', () => {
    // 5000 typed as 50000, the single most expensive mistake in this domain.
    const outcome = validateBatch([row({ row: 1, amount: kes(50_000_00n) })], policy, known([AMINA]));
    expect(outcome.findings.map((f) => f.code)).toContain('amount_exceeds_item_limit');
  });

  it('blocks the misplaced decimal again at the batch limit', () => {
    const rows = Array.from({ length: 400 }, (_, i) =>
      row({ row: i + 1, rawMsisdn: `07123${String(i).padStart(5, '0')}`, amount: kes(5_000_00n) }),
    );
    const outcome = validateBatch(rows, policy, known([]));
    const batchFinding = outcome.findings.find((f) => f.code === 'batch_exceeds_batch_limit');
    expect(batchFinding).toBeDefined();
    expect(batchFinding?.row).toBeNull();
  });
});

describe('warning rules', () => {
  it('warns when the name differs from what is stored', () => {
    const outcome = validateBatch([row({ row: 1, fullName: 'John Otieno' })], policy, known([AMINA]));
    expect(outcome.findings.map((f) => f.code)).toContain('name_differs_from_stored');
    expect(outcome.blockingCount).toBe(0);
    expect(canSubmitForApproval(outcome)).toBe(true);
  });

  it('does not warn on casing or word order', () => {
    const outcome = validateBatch([row({ row: 1, fullName: 'wanjiru  AMINA' })], policy, known([AMINA]));
    expect(outcome.findings.map((f) => f.code)).not.toContain('name_differs_from_stored');
  });

  it('warns on a recipient new to the organisation', () => {
    const outcome = validateBatch([row({ row: 1 })], policy, known([]));
    expect(outcome.findings.map((f) => f.code)).toContain('recipient_new_to_organisation');
  });

  it('warns when the amount deviates by more than half', () => {
    const outcome = validateBatch([row({ row: 1, amount: kes(3_000_00n) })], policy, known([AMINA]));
    expect(outcome.findings.map((f) => f.code)).toContain('amount_deviates_from_usual');
  });

  it('does not warn on a deviation inside the threshold', () => {
    const outcome = validateBatch([row({ row: 1, amount: kes(2_000_00n) })], policy, known([AMINA]));
    expect(outcome.findings.map((f) => f.code)).not.toContain('amount_deviates_from_usual');
  });

  it('warns when one number carries two different names', () => {
    const outcome = validateBatch(
      [row({ row: 1, fullName: 'Amina Wanjiru' }), row({ row: 2, fullName: 'Peter Kimani' })],
      policy,
      known([AMINA]),
    );
    expect(outcome.findings.map((f) => f.code)).toContain('duplicate_msisdn_different_name');
  });
});

describe('the outcome as a whole', () => {
  it('reports a batch-level total that is exact', () => {
    const outcome = validateBatch(
      [
        row({ row: 1, rawMsisdn: '0712345671', amount: kes(1_000_00n) }),
        row({ row: 2, rawMsisdn: '0712345672', amount: kes(2_500_00n) }),
        row({ row: 3, rawMsisdn: '0712345673', amount: kes(1n) }),
      ],
      policy,
      known([]),
    );
    expect(outcome.totalMinor).toBe(350001n);
  });

  it('keeps the row for every finding so the exception queue can point at it', () => {
    const outcome = validateBatch(
      [row({ row: 7, rawMsisdn: 'nonsense' })],
      policy,
      known([]),
    );
    expect(outcome.findings.every((f) => f.row === 7 || f.row === null)).toBe(true);
  });
});

describe('finding messages are written for a person, not a log', () => {
  const everyFailure: ImportedRow[] = [
    row({ row: 1, rawMsisdn: '' }),
    row({ row: 2, rawMsisdn: '07123456ab' }),
    row({ row: 3, rawMsisdn: '0202345678' }),
    row({ row: 4, rawMsisdn: '071234567' }),
    row({ row: 5, rawMsisdn: '0712345671', amount: kes(0n) }),
    row({ row: 6, rawMsisdn: '0712345672', amount: kes(1_500_50n) }),
    row({ row: 7, rawMsisdn: '0712345673', amount: kes(50_000_00n) }),
    row({ row: 8, rawMsisdn: '0712345674' }),
    row({ row: 9, rawMsisdn: '0712345674', fullName: 'Someone Else' }),
  ];

  const outcome = validateBatch(everyFailure, policy, known([AMINA]));

  it('never shows a raw error code to the reader', () => {
    // This is the bug this guard exists for: the invalid-number message was
    // built by interpolating the normaliser's error code, so the exception
    // queue told a programme officer "contains_letters".
    for (const finding of outcome.findings) {
      expect(finding.message, finding.code).not.toMatch(/[a-z]+_[a-z]+/);
    }
  });

  it('writes a real sentence for every finding', () => {
    for (const finding of outcome.findings) {
      expect(finding.message.length, finding.code).toBeGreaterThan(20);
      expect(finding.message[0], finding.code).toBe(finding.message[0]?.toUpperCase());
      expect(finding.message, finding.code).toMatch(/\.$/);
    }
  });

  it('never puts a phone number in a message, since messages are read aloud and screenshotted', () => {
    for (const finding of outcome.findings) {
      expect(finding.message, finding.code).not.toMatch(/254[71]\d{8}/);
      expect(finding.message, finding.code).not.toMatch(/0[71]\d{8}/);
    }
  });

  it('covers every way a number can fail to read', () => {
    const messages = outcome.findings
      .filter((f) => f.code === 'msisdn_invalid')
      .map((f) => f.message);
    expect(new Set(messages).size).toBe(4);
    for (const message of messages) expect(message).not.toContain('_');
  });
});

/**
 * The contract between the interface and the domain.
 *
 * Screenshots prove one render. These prove the interface cannot drift away
 * from the rules the backend enforces: every status has a treatment, no full
 * phone number is ever held in a display string, every amount is a valid
 * minor-unit string, and the totals the screens print are the totals the
 * validation rules actually produce.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseCsv } from '../support/csv.js';
import { ITEM_STATUSES, type ItemStatus } from '@domain/payout-item';
import { BATCH_STATUSES, type BatchStatus } from '@domain/payout-batch';
import { moneyFromMajorString, moneyFromMinorString, isWholeMajorUnit } from '@domain/money';
import { maskMsisdn, normaliseMsisdn } from '@domain/msisdn';
import { batchTreatment, itemTreatment } from '@web/lib/status';
import {
  BATCHES,
  IMPORT_SUMMARY,
  LIMITS,
  PEOPLE,
  PERSON_DETAIL,
  RAW_ROWS,
} from '@web/data/fixtures';

describe('every domain status has a visual treatment', () => {
  it.each(ITEM_STATUSES)('item status %s', (status: ItemStatus) => {
    const t = itemTreatment(status);
    expect(t.label.length).toBeGreaterThan(0);
    expect(t.tone).toBeTruthy();
  });

  it.each(BATCH_STATUSES)('batch status %s', (status: BatchStatus) => {
    const t = batchTreatment(status);
    expect(t.label.length).toBeGreaterThan(0);
    expect(t.tone).toBeTruthy();
  });

  it('reserves the unresolved treatment for unknown, and nothing else', () => {
    // `unknown` is an open question, not an outcome. If any other status ever
    // picks up this treatment, the one distinction the product depends on has
    // been blurred.
    const unresolved = ITEM_STATUSES.filter((s) => itemTreatment(s).tone === 'unresolved');
    expect(unresolved).toEqual(['unknown']);

    const batchUnresolved = BATCH_STATUSES.filter((s) => batchTreatment(s).tone === 'unresolved');
    expect(batchUnresolved).toEqual([]);
  });

  it('never labels a status with its raw database value', () => {
    // A pill reading `completed_with_failures` is a leak of the schema into a
    // screen a donor's auditor might see over somebody's shoulder.
    for (const status of ITEM_STATUSES) expect(itemTreatment(status).label).not.toContain('_');
    for (const status of BATCH_STATUSES) expect(batchTreatment(status).label).not.toContain('_');
  });
});

describe('fixture phone numbers', () => {
  it('are stored in full and normalised, never pre-masked', () => {
    // Masking happens at render. Storing a masked value would mean the real
    // number had already been lost, and the mask would be undoable in a diff.
    for (const person of PEOPLE) {
      expect(person.msisdn, person.name).not.toContain('•');
      const normalised = normaliseMsisdn(person.msisdn);
      expect(normalised.ok, `${person.name}: ${person.msisdn}`).toBe(true);
      if (normalised.ok) expect(normalised.msisdn).toBe(person.msisdn);
    }
  });

  it('mask to the documented shape, showing only the last three digits', () => {
    for (const person of PEOPLE) {
      const masked = maskMsisdn(person.msisdn);
      expect(masked).toMatch(/^254[71]•{5}\d{3}$/);
      expect(masked).not.toContain(person.msisdn.slice(4, 9));
    }
  });

  it('covers both the 07xx and 01xx ranges, because both are real', () => {
    const prefixes = new Set(PEOPLE.map((p) => p.msisdn.slice(3, 4)));
    expect(prefixes).toContain('7');
    expect(prefixes).toContain('1');
  });
});

describe('fixture money', () => {
  const amounts = [
    ...BATCHES.map((b) => b.totalMinor),
    ...PEOPLE.map((p) => p.totalMinor),
    ...PERSON_DETAIL.payments.map((p) => p.amountMinor),
    IMPORT_SUMMARY.totalMinor,
    LIMITS.perItemMinor,
    LIMITS.perBatchMinor,
    LIMITS.largestCycleMinor,
  ];

  it('is a string of minor units, never a number', () => {
    // A JSON number loses integer precision above 2^53. Money crosses every
    // boundary in this system as a string, including into the interface.
    for (const amount of amounts) {
      expect(typeof amount).toBe('string');
      const parsed = moneyFromMinorString(amount, 'KES');
      expect(parsed.ok, amount).toBe(true);
    }
  });

  it('has limits that are whole shillings and correctly ordered', () => {
    const perItem = BigInt(LIMITS.perItemMinor);
    const perBatch = BigInt(LIMITS.perBatchMinor);
    expect(isWholeMajorUnit({ amountMinor: perItem, currency: 'KES' })).toBe(true);
    expect(isWholeMajorUnit({ amountMinor: perBatch, currency: 'KES' })).toBe(true);
    expect(perBatch).toBeGreaterThanOrEqual(perItem);
  });

  it('shows limits that match the schema defaults', () => {
    // The mockups and the database have to agree, or the screen is describing
    // a configuration nobody actually has.
    expect(LIMITS.perItemMinor).toBe('2000000');
    expect(LIMITS.perBatchMinor).toBe('50000000');
    expect(LIMITS.deviationBps).toBe(5000);
  });

  it('keeps the largest cycle inside the batch limit it claims', () => {
    expect(BigInt(LIMITS.largestCycleMinor)).toBeLessThanOrEqual(BigInt(LIMITS.perBatchMinor));
  });

  it('gives the person detail a total that matches its own payments', () => {
    const summed = PERSON_DETAIL.payments.reduce((t, p) => t + BigInt(p.amountMinor), 0n);
    expect(summed.toString()).toBe(PERSON_DETAIL.person.totalMinor);
    expect(PERSON_DETAIL.payments).toHaveLength(PERSON_DETAIL.person.payments);
  });
});

describe('the import screen tells the truth about the fixture', () => {
  const path = fileURLToPath(new URL('../fixtures/cohort-messy.csv', import.meta.url));
  const rows = parseCsv(readFileSync(path, 'utf8'));

  it('states the real row count', () => {
    expect(IMPORT_SUMMARY.rows).toBe(rows.length);
  });

  it('states the real total, computed from the file rather than typed by hand', () => {
    // This is the assertion that stops a designer's placeholder total surviving
    // into the build. The brief says the numbers must add up under scrutiny,
    // and somebody will check.
    const total = rows.reduce((sum, row) => {
      const parsed = moneyFromMajorString(row['amount'] ?? '', 'KES');
      return parsed.ok ? sum + parsed.money.amountMinor : sum;
    }, 0n);
    expect(total.toString()).toBe(IMPORT_SUMMARY.totalMinor);
  });

  it('previews rows that actually exist in the file, as typed', () => {
    for (const preview of RAW_ROWS) {
      const source = rows[preview.n - 1];
      expect(source, `row ${preview.n}`).toBeDefined();
      expect(source?.['participant_ref']).toBe(preview.ref);
      expect(source?.['full_name']).toBe(preview.name);
      expect(source?.['phone']).toBe(preview.phone);
    }
  });
});

describe('the batch list', () => {
  it('only uses statuses the batch state machine defines', () => {
    for (const batch of BATCHES) {
      expect(BATCH_STATUSES).toContain(batch.status);
    }
  });

  it('gives an approver to every batch that has been approved', () => {
    // Maker-checker is a database constraint. A row claiming a status past
    // approval with nobody named would be describing an impossible record.
    const approved: readonly BatchStatus[] = ['closed', 'disbursing', 'completed_with_failures'];
    for (const batch of BATCHES) {
      if (approved.includes(batch.status)) {
        expect(batch.approvedBy, batch.reference).not.toBe('');
        expect(batch.approvedBy, batch.reference).not.toBe(batch.preparedBy);
      }
    }
  });

  it('never shows an approver who is also the preparer', () => {
    for (const batch of BATCHES) {
      if (batch.approvedBy !== '' && batch.approvedBy !== 'Awaiting approver') {
        expect(batch.approvedBy).not.toBe(batch.preparedBy);
      }
    }
  });
});

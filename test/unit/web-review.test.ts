/**
 * The exception queue and the approval screen, held to the domain.
 *
 * The queue renders whatever `validateBatch` says about the typed rows, so the
 * thing to pin is that the typed rows are the fixture file and that the
 * grouping preserves every finding. Rows 17 and 19 each carry a blocking and
 * two warning findings at once; a queue that dropped any of them would be
 * lying about the sheet.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseCsv } from '../support/csv.js';
import { canSubmitForApproval } from '@domain/validation';
import { formatMoney, moneyFromMajorString } from '@domain/money';
import {
  ACKNOWLEDGEMENTS,
  CORRECTED_ROWS,
  EDITS,
  REVIEW_BATCH,
  TYPED_ROWS,
  batchLevelFindings,
  buildQueue,
  validateTyped,
  worstOf,
} from '@web/data/review';
import { MEMBERS } from '@web/data/fixtures';

const path = fileURLToPath(new URL('../fixtures/cohort-messy.csv', import.meta.url));
const file = parseCsv(readFileSync(path, 'utf8'));

describe('the typed rows are cohort-messy.csv', () => {
  it('has every row of the file, in order', () => {
    expect(TYPED_ROWS.map((r) => r.n)).toEqual(file.map((_, i) => i + 1));
  });

  it.each(TYPED_ROWS)('row $n is transcribed as typed', (typed) => {
    const source = file[typed.n - 1];
    expect(source).toBeDefined();
    expect(source?.['participant_ref']).toBe(typed.ref);
    expect(source?.['full_name']).toBe(typed.name);
    expect(source?.['phone']).toBe(typed.phone);
    expect(source?.['amount']).toBe(typed.amount);
    expect(source?.['note']).toBe(typed.note);
  });
});

describe('the exception queue', () => {
  const outcome = validateTyped(TYPED_ROWS);
  const queue = buildQueue(TYPED_ROWS, outcome);

  it('cannot be submitted, which is the point of the fixture', () => {
    expect(canSubmitForApproval(outcome)).toBe(false);
  });

  it('keeps every finding: none is lost in the grouping', () => {
    const grouped = queue.flatMap((row) => row.findings).length;
    expect(grouped + batchLevelFindings(outcome).length).toBe(outcome.findings.length);
  });

  it('orders blocking rows first, then warnings, then clean, each in file order', () => {
    const rank = queue.map((r) => (r.worst === 'blocking' ? 0 : r.worst === 'warning' ? 1 : 2));
    expect(rank).toEqual([...rank].sort((a, b) => a - b));
    for (let i = 1; i < queue.length; i += 1) {
      const prev = queue[i - 1];
      const next = queue[i];
      if (prev !== undefined && next !== undefined && prev.worst === next.worst) {
        expect(next.typed.n).toBeGreaterThan(prev.typed.n);
      }
    }
  });

  it.each([17, 19])('shows row %i as blocking while still carrying both its warnings', (n) => {
    // One row, three findings, two severities. A queue built around one
    // finding per row falls apart here, which is why these two rows exist.
    const row = queue.find((r) => r.typed.n === n);
    expect(row?.worst).toBe('blocking');
    expect(row?.findings.map((f) => f.severity).sort()).toEqual(['blocking', 'warning', 'warning']);
  });

  it('sorts a warning-only row after every blocking row', () => {
    const row = queue.find((r) => r.typed.n === 16);
    expect(row?.worst).toBe('warning');
    const lastBlocking = queue.map((r) => r.worst).lastIndexOf('blocking');
    expect(queue.findIndex((r) => r.typed.n === 16)).toBeGreaterThan(lastBlocking);
  });

  it('counts blocking and warning findings the way the summary states them', () => {
    // The GOV.UK-style summary says "N issues must be fixed and M warnings need
    // acknowledging". Those are finding counts, not row counts, because rows
    // 17 and 19 are both and a person has to deal with each finding.
    const blocking = queue.flatMap((r) => r.findings).filter((f) => f.severity === 'blocking');
    const warnings = queue.flatMap((r) => r.findings).filter((f) => f.severity === 'warning');
    expect(blocking.length).toBe(outcome.blockingCount);
    expect(warnings.length).toBe(outcome.warningCount);
  });

  it('collapses the clean rows into a count that adds up', () => {
    const clean = queue.filter((r) => r.worst === null).length;
    const flagged = queue.filter((r) => r.worst !== null).length;
    expect(clean + flagged).toBe(TYPED_ROWS.length);
    expect(clean).toBe(9);
  });

  it('worstOf treats a blocking finding as worse than any number of warnings', () => {
    expect(worstOf([])).toBeNull();
    expect(
      worstOf([
        { code: 'recipient_new_to_organisation', severity: 'warning', row: 1, message: 'a' },
        { code: 'duplicate_recipient_in_batch', severity: 'blocking', row: 1, message: 'b' },
        { code: 'name_differs_from_stored', severity: 'warning', row: 1, message: 'c' },
      ]),
    ).toBe('blocking');
  });

  it('never renders a full phone number in a finding message', () => {
    for (const finding of outcome.findings) {
      expect(finding.message).not.toMatch(/254[71]\d{8}/);
      expect(finding.message).not.toMatch(/0[71]\d{8}/);
    }
  });
});

describe('the corrected sheet the approver sees', () => {
  const outcome = validateTyped(CORRECTED_ROWS);

  it('has nothing blocking, or the approval screen would be showing an impossible batch', () => {
    expect(outcome.blockingCount).toBe(0);
    expect(canSubmitForApproval(outcome)).toBe(true);
  });

  it('has every warning acknowledged, by name, and nothing acknowledged that does not exist', () => {
    const warned = new Set(outcome.findings.filter((f) => f.severity === 'warning').map((f) => f.row));
    const acknowledged = new Set(ACKNOWLEDGEMENTS.map((a) => a.row));
    expect([...acknowledged].sort()).toEqual([...warned].sort());
    for (const a of ACKNOWLEDGEMENTS) expect(a.by).toBe(REVIEW_BATCH.preparedBy);
  });

  it('records an edit for every row that changed or went', () => {
    const before = new Map(TYPED_ROWS.map((r) => [r.n, r]));
    const after = new Map(CORRECTED_ROWS.map((r) => [r.n, r]));
    const changed = TYPED_ROWS.filter((r) => {
      const now = after.get(r.n);
      return now === undefined || now.phone !== r.phone || now.amount !== r.amount;
    }).map((r) => r.n);
    expect(EDITS.map((e) => e.row).sort((a, b) => a - b)).toEqual(changed.sort((a, b) => a - b));
    for (const e of EDITS) expect(before.has(e.row)).toBe(true);
  });

  it('totals what the rows say, and the total is under the batch limit', () => {
    const summed = CORRECTED_ROWS.reduce((t, r) => {
      const parsed = moneyFromMajorString(r.amount, 'KES');
      return parsed.ok ? t + parsed.money.amountMinor : t;
    }, 0n);
    expect(outcome.totalMinor).toBe(summed);
    expect(formatMoney({ amountMinor: outcome.totalMinor, currency: 'KES' })).toBe('KES 29,000.00');
  });

  it('names an approver who holds the role and is not the preparer', () => {
    const member = MEMBERS.find((m) => m.name === REVIEW_BATCH.approver.name);
    expect(member?.role).toBe('Approver');
    expect(REVIEW_BATCH.approver.name).not.toBe(REVIEW_BATCH.preparedBy);
  });
});

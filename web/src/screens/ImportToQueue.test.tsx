/**
 * The join between the real import and the exception queue.
 *
 * csv.test.ts proves the parser and web-review.test.ts proves the queue's
 * fixtures. Neither proves that a file a person actually uploads reaches the
 * queue with the findings the domain produces for that file, and that is the
 * seam where a regression would be silent and expensive: a dropped column, a
 * row numbered from zero, an amount parsed twice. So this drives the real
 * Import screen with the real fixture files and checks what renders.
 */
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { formatMoney } from '@domain/money';
import { Import, type ImportedBatch } from './Import';
import { Queue } from './Queue';
import { validateTyped } from '@web/data/review';

beforeAll(() => {
  Element.prototype.scrollIntoView = () => {};
  // jsdom's File may lack text(). The screen reads a file with it.
  if (typeof File.prototype.text !== 'function') {
    File.prototype.text = function text(this: Blob): Promise<string> {
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
        reader.readAsText(this);
      });
    };
  }
});

afterEach(cleanup);

function fixtureFile(name: string): File {
  // Vitest runs from the repository root; import.meta.url is not a file URL in jsdom.
  const path = join(process.cwd(), 'test', 'fixtures', name);
  return new File([readFileSync(path, 'utf8')], name, { type: 'text/csv' });
}

/** Uploads a file through the real screen and returns what it hands onward. */
async function importFile(name: string): Promise<ImportedBatch> {
  let handed: ImportedBatch | null = null;
  render(<Import onValidate={(batch) => (handed = batch)} />);

  const input = document.querySelector('input[type="file"]');
  if (!(input instanceof HTMLInputElement)) throw new Error('no file input');
  // The screen reads files.item(0), so the stand-in has to be FileList-shaped.
  const file = fixtureFile(name);
  const files = { 0: file, length: 1, item: (index: number) => (index === 0 ? file : null) };
  Object.defineProperty(input, 'files', { value: files, configurable: true });
  fireEvent.change(input);

  const validate = await screen.findByRole('button', { name: /^Validate \d+ rows$/ });
  fireEvent.click(validate);
  cleanup();

  if (handed === null) throw new Error('the import screen handed nothing on');
  return handed;
}

/** Renders the queue the way App does after an upload. */
function renderQueue(batch: ImportedBatch) {
  render(
    <Queue
      variant="blocking"
      rows={batch.rows}
      batch={{ reference: 'T-1', programme: 'Test', fileName: batch.fileName, uploadedAt: 'just now' }}
    />,
  );
}

describe('cohort-messy.csv, uploaded and validated', () => {
  it('reaches the queue as twenty rows numbered from one, as typed', async () => {
    const batch = await importFile('cohort-messy.csv');
    expect(batch.rows).toHaveLength(20);
    expect(batch.rows.map((r) => r.n)).toEqual(batch.rows.map((_, i) => i + 1));
    expect(batch.rows[1]).toEqual({
      n: 2,
      ref: 'YCIC-002',
      name: 'Peter Kimani Mwangi',
      phone: '+254722345678',
      amount: '1,500',
      note: 'comma in the amount',
    });
    expect(batch.rows[5]?.phone).toBe("'0723456780");
  });

  it('shows the total the domain computes, in the import and again in the queue', async () => {
    const batch = await importFile('cohort-messy.csv');
    const outcome = validateTyped(batch.rows);
    expect(batch.totalMinor).toBe(outcome.totalMinor);
    expect(formatMoney({ amountMinor: outcome.totalMinor, currency: 'KES' })).toBe('KES 80,000.50');

    renderQueue(batch);
    const total = screen.getByRole('region', { name: 'Batch total and submission' }).textContent;
    expect(total).toContain('KES 80,000.50');
    expect(total).toContain('20 rows');
  });

  it('renders every finding validateBatch produces for the file, and nothing else', async () => {
    const batch = await importFile('cohort-messy.csv');
    const outcome = validateTyped(batch.rows);
    renderQueue(batch);

    expect(screen.getByRole('heading', { level: 2, name: /must be fixed/ }).textContent).toBe(
      `${outcome.blockingCount} issues must be fixed before this batch can be approved, and ${outcome.warningCount} warnings need acknowledging`,
    );

    // Each finding appears twice: once as a summary link and once under its
    // row. Several rows share a message, so count per distinct message.
    const perMessage = new Map<string, number>();
    for (const f of outcome.findings) perMessage.set(f.message, (perMessage.get(f.message) ?? 0) + 1);
    for (const [message, count] of perMessage) {
      expect(screen.getAllByText(message, { exact: false }).length, message).toBe(2 * count);
    }

    // And the row severities are the domain's, not the screen's.
    const summaryLinks = screen.getAllByRole('button', { name: /^Row \d+, / });
    expect(summaryLinks).toHaveLength(outcome.findings.length);
  });

  it('keeps the multi-finding rows whole across the join', async () => {
    const batch = await importFile('cohort-messy.csv');
    renderQueue(batch);
    for (const n of [17, 19]) {
      const row = screen.getByRole('generic', { name: new RegExp(`^Row ${n}, `) });
      expect(row.querySelectorAll('.q-finding')).toHaveLength(3);
      expect(row.querySelectorAll('.q-finding-blocking')).toHaveLength(1);
    }
  });
});

describe('cohort-clean.csv, uploaded and validated', () => {
  it('reaches the queue with nothing to fix and submission enabled', async () => {
    const batch = await importFile('cohort-clean.csv');
    expect(validateTyped(batch.rows).findings).toEqual([]);

    renderQueue(batch);
    expect(screen.getByRole('heading', { level: 2, name: /ready to submit/ }).textContent).toContain(
      'Nothing to fix. 10 rows, KES 15,000.00',
    );
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Submit for approval' }).disabled).toBe(false);
    expect(screen.getByText('All 10 rows raised nothing.')).toBeTruthy();
  });
});

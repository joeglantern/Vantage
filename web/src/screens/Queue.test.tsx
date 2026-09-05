/**
 * The exception queue's interactive state, rendered for real.
 *
 * web-review.test.ts proves the data the queue starts from. This proves what
 * happens when a person acts on it: an edit re-runs the domain rules and
 * moves the running total, an acknowledgement is recorded against a name,
 * a removed row leaves the total, and the submit button only enables when
 * nothing blocks and every warning is acknowledged.
 */
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { Queue } from './Queue';

beforeAll(() => {
  // jsdom has no layout, so the jump link's scroll is a no-op here.
  Element.prototype.scrollIntoView = () => {};
});

afterEach(cleanup);

function summaryTitle(): string {
  return screen.getByRole('heading', { level: 2, name: /must be fixed|need acknowledging|ready to submit/ }).textContent ?? '';
}

function rowByNumber(n: number): HTMLElement {
  return screen.getByRole('generic', { name: new RegExp(`^Row ${n}, `) });
}

function submitButton(): HTMLButtonElement {
  return screen.getByRole<HTMLButtonElement>('button', { name: 'Submit for approval' });
}

function runningTotal(): string {
  return screen.getByRole('region', { name: 'Batch total and submission' }).textContent ?? '';
}

describe('the exception queue, blocking state', () => {
  it('states the counts the domain produced, as findings not rows', () => {
    render(<Queue variant="blocking" />);
    expect(summaryTitle()).toBe(
      '9 issues must be fixed before this batch can be approved, and 8 warnings need acknowledging',
    );
    expect(runningTotal()).toContain('KES 80,000.50');
    expect(submitButton().disabled).toBe(true);
  });

  it('shows all three findings on row 17, with the row marked as blocking', () => {
    render(<Queue variant="blocking" />);
    const row = rowByNumber(17);
    const findings = within(row).getAllByRole('listitem');
    expect(findings).toHaveLength(3);
    expect(findings.map((f) => f.textContent?.startsWith('Must fix') ?? false)).toEqual([true, false, false]);
    expect(within(row).getAllByRole('button', { name: 'Acknowledge' })).toHaveLength(2);
  });

  it('drops the running total and clears the finding when the misplaced decimal is corrected', () => {
    render(<Queue variant="blocking" />);
    fireEvent.click(within(rowByNumber(15)).getByRole('button', { name: 'Edit' }));

    const amount = screen.getByLabelText('Amount, KES');
    fireEvent.change(amount, { target: { value: '5000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save row' }));

    expect(runningTotal()).toContain('KES 35,000.50');
    expect(runningTotal()).toContain('was KES 80,000.50 at upload');
    expect(summaryTitle()).toContain('8 issues must be fixed');

    const row = rowByNumber(15);
    expect(within(row).queryByText(/Must fix/)).toBeNull();
    expect(within(row).getByText(/Amount differs sharply/)).toBeTruthy();
    expect(within(row).getByText(/Corrected: amount was 50000\. Edited by Wanjiku Ndegwa/)).toBeTruthy();
  });

  it('raises the real finding when an edit makes a row worse', () => {
    render(<Queue variant="blocking" />);
    fireEvent.click(within(rowByNumber(16)).getByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByLabelText('Phone, as typed'), { target: { value: '0712' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save row' }));

    expect(within(rowByNumber(16)).getByText(/wrong number of digits/)).toBeTruthy();
    expect(summaryTitle()).toContain('10 issues must be fixed');
  });

  it('records an acknowledgement against the signed-in person', () => {
    render(<Queue variant="blocking" />);
    const row = rowByNumber(16);
    fireEvent.click(within(row).getByRole('button', { name: 'Acknowledge' }));
    expect(within(row).getByText(/Acknowledged by Wanjiku Ndegwa, just now/)).toBeTruthy();
    expect(summaryTitle()).toContain('7 warnings need acknowledging');
  });

  it('removes a row only after an inline confirmation, and the total follows', () => {
    render(<Queue variant="blocking" />);
    const row = rowByNumber(9);
    fireEvent.click(within(row).getByRole('button', { name: 'Remove row' }));
    expect(within(row).getByText('Remove Wanjiru Amina?')).toBeTruthy();
    fireEvent.click(within(row).getByRole('button', { name: 'Keep' }));
    expect(runningTotal()).toContain('20 rows');

    fireEvent.click(within(row).getByRole('button', { name: 'Remove row' }));
    fireEvent.click(within(row).getByRole('button', { name: 'Remove' }));
    expect(screen.queryByRole('generic', { name: /^Row 9, / })).toBeNull();
    expect(runningTotal()).toContain('19 rows');
    expect(runningTotal()).toContain('KES 78,500.50');
    expect(summaryTitle()).toContain('8 issues must be fixed');
  });

  it('jumps to a row from the summary and gives it focus', () => {
    render(<Queue variant="blocking" />);
    // Row 15 carries two findings, so it has two links. Either one lands on the row.
    const links = screen.getAllByRole('button', { name: 'Row 15, Anthony Mwangi' });
    expect(links).toHaveLength(2);
    fireEvent.click(links[1]!);
    expect(document.activeElement).toBe(rowByNumber(15));
  });

  it('collapses the clean rows into a count until asked', () => {
    render(<Queue variant="blocking" />);
    expect(screen.getByText('9 rows raised nothing.')).toBeTruthy();
    expect(screen.queryByRole('generic', { name: /^Row 1, / })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Show them' }));
    expect(rowByNumber(1)).toBeTruthy();
  });
});

describe('the exception queue, warnings and acknowledged states', () => {
  it('will not submit while a warning is unacknowledged, and says so', () => {
    render(<Queue variant="warnings" />);
    expect(submitButton().disabled).toBe(true);
    expect(screen.getByText('5 warnings are not yet acknowledged')).toBeTruthy();
  });

  it('enables submission once every warning is acknowledged', () => {
    render(<Queue variant="warnings" />);
    for (const button of screen.getAllByRole('button', { name: 'Acknowledge' })) fireEvent.click(button);
    expect(submitButton().disabled).toBe(false);
    expect(summaryTitle()).toContain('Every warning is acknowledged');
  });

  it('withdraws an acknowledgement when the acknowledged row is edited', () => {
    // Accepting the old data says nothing about the new data.
    render(<Queue variant="acknowledged" />);
    expect(submitButton().disabled).toBe(false);
    fireEvent.click(within(rowByNumber(18)).getByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByLabelText('Amount, KES'), { target: { value: '4600' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save row' }));
    expect(within(rowByNumber(18)).getByRole('button', { name: 'Acknowledge' })).toBeTruthy();
    expect(submitButton().disabled).toBe(true);
  });
});

describe('the exception queue, fed from outside', () => {
  it('reviews the rows it is given and never consults the fixture', () => {
    render(
      <Queue
        variant="blocking"
        rows={[
          { n: 1, ref: 'X-1', name: 'Test Person', phone: '0712345678', amount: '1500', note: '' },
          { n: 2, ref: 'X-2', name: 'Other Person', phone: '0712345678', amount: '1500', note: '' },
        ]}
        batch={{ reference: 'X-2026-01', programme: 'A test', fileName: 'x.csv', uploadedAt: 'now' }}
      />,
    );
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('X-2026-01: review');
    expect(summaryTitle()).toContain('1 issue must be fixed');
    expect(runningTotal()).toContain('KES 3,000.00');
    expect(runningTotal()).toContain('2 rows');
  });
});

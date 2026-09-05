/**
 * The approval screen, rendered and driven.
 *
 * The approver comes in cold and must see the total, the count, who prepared
 * it, what was acknowledged and by whom, then pass a step-up challenge. The
 * two blocked states must offer no button at all. These tests prove each of
 * those, and that a wrong code is refused before a right one runs the
 * approval through to approved.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { Approval } from './Approval';

beforeAll(() => {
  // jsdom does not implement <dialog>'s modal API. The Dialog component
  // reads `open` and calls these, so the smallest faithful stand-in is
  // toggling the attribute.
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.removeAttribute('open');
  };
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function approveButton(): HTMLButtonElement | null {
  return screen.queryByRole<HTMLButtonElement>('button', { name: /^Approve and pay/ });
}

function dialog(): HTMLDialogElement {
  const el = document.querySelector('dialog');
  if (el === null) throw new Error('no dialog in the document');
  return el;
}

describe('ready to approve', () => {
  it('shows the total in full, the count, the preparer and the limits', () => {
    render(<Approval variant="ready" />);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Approve YCIC-2026-04');
    expect(screen.getByText('Total to pay').nextElementSibling?.textContent).toBe('KES 29,000.00');
    expect(screen.getByText(/to 15 people, one payment each/)).toBeTruthy();
    expect(screen.getByText(/Wanjiku Ndegwa, from cohort-messy.csv/)).toBeTruthy();
    expect(screen.getByText(/against a per-payment limit of/).textContent).toContain('KES 20,000.00');
    expect(approveButton()?.textContent).toBe('Approve and pay KES 29,000.00');
  });

  it('lists every acknowledged warning with who acknowledged it', () => {
    render(<Approval variant="ready" />);
    const rows = document.querySelectorAll('.ap-warning-row');
    expect(rows).toHaveLength(5);
    for (const row of rows) {
      expect(row.textContent).toContain('Wanjiku Ndegwa, 3 Apr 2026');
    }
    expect(screen.getByText(/5 warnings on 5 rows\. Nothing is blocking/)).toBeTruthy();
  });

  it('shows which duplicate was removed, since the approver did not make that call', () => {
    render(<Approval variant="ready" />);
    expect(screen.getByText('Row removed, same person and number as row 2')).toBeTruthy();
    expect(screen.getByText('Row removed, duplicate of row 7')).toBeTruthy();
    expect(screen.getByText('Amount corrected from 50000')).toBeTruthy();
  });

  it('lists the payments with masked numbers and a total that matches', () => {
    render(<Approval variant="ready" />);
    const items = document.querySelectorAll('.ap-item-row:not(.row-head):not(.ap-item-total)');
    expect(items).toHaveLength(15);
    for (const item of items) {
      expect(item.textContent).toMatch(/254[71]•{5}\d{3}/);
      expect(item.textContent).not.toMatch(/254[71]\d{8}/);
    }
    expect(document.querySelector('.ap-item-total')?.textContent).toContain('KES 29,000.00');
  });
});

describe('the step-up challenge', () => {
  it('opens on the approve button and restates the amount and count', () => {
    render(<Approval variant="ready" />);
    expect(dialog().hasAttribute('open')).toBe(false);
    fireEvent.click(approveButton()!);
    expect(dialog().hasAttribute('open')).toBe(true);
    expect(within(dialog()).getByRole('heading', { level: 2 }).textContent).toBe(
      'Confirm your identity to pay 15 people',
    );
    expect(within(dialog()).getByText(/This cannot be undone/).textContent).toContain('KES 29,000.00');
  });

  it('refuses anything but six digits and says what to do', () => {
    render(<Approval variant="challenge" />);
    const code = screen.getByLabelText('Six-digit code from your authenticator');
    fireEvent.change(code, { target: { value: '12ab3' } });
    expect((code as HTMLInputElement).value).toBe('123');
    fireEvent.keyDown(code, { key: 'Enter' });
    expect(screen.getByRole('alert').textContent).toContain('The code was not accepted');
    expect(dialog().hasAttribute('open')).toBe(true);
    expect(screen.queryByText(/Approving\. Do not close this page/)).toBeNull();
  });

  it('starts with the error showing in the failed state', () => {
    render(<Approval variant="failed" />);
    expect(screen.getByRole('alert').textContent).toContain('Two attempts remain');
  });

  it('runs a valid code through approving to approved', () => {
    vi.useFakeTimers();
    render(<Approval variant="challenge" />);
    const code = screen.getByLabelText('Six-digit code from your authenticator');
    fireEvent.change(code, { target: { value: '246810' } });
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Approve and pay KES 29,000.00' }));

    expect(dialog().hasAttribute('open')).toBe(false);
    expect(screen.getByText('Approving. Do not close this page.')).toBeTruthy();
    expect(approveButton()).toBeNull();

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(screen.getByText(/Approved by David Ochieng\. 15 payments queued/)).toBeTruthy();
    expect(screen.getByText('Approved', { selector: '.pill' })).toBeTruthy();
  });

  it('cancels with Escape and pays nothing', () => {
    render(<Approval variant="challenge" />);
    fireEvent(dialog(), new Event('cancel', { bubbles: false, cancelable: true }));
    expect(dialog().hasAttribute('open')).toBe(false);
    expect(approveButton()).toBeTruthy();
    expect(screen.queryByText(/Approving\. Do not close this page/)).toBeNull();
  });
});

describe('blocked', () => {
  it('offers the preparer no button and says why', () => {
    render(<Approval variant="preparer" />);
    expect(approveButton()).toBeNull();
    expect(screen.queryByRole('button', { name: /Send back/ })).toBeNull();
    expect(screen.getByText('You cannot approve this batch')).toBeTruthy();
    expect(screen.getByText(/Ask David Ochieng or Grace Muthoni/)).toBeTruthy();
  });

  it('offers a viewer no button and names who can', () => {
    render(<Approval variant="norole" />);
    expect(approveButton()).toBeNull();
    expect(screen.getByText('Your role cannot approve payouts')).toBeTruthy();
    expect(screen.getByText(/Approvers for this organisation: David Ochieng, Grace Muthoni/)).toBeTruthy();
  });
});

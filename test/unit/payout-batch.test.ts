import { describe, expect, it } from 'vitest';
import { canClose, transitionBatch } from '@domain/payout-batch';

describe('the batch state machine', () => {
  it('walks import to closed', () => {
    expect(transitionBatch('draft', { kind: 'import_complete' })).toMatchObject({ to: 'validating' });
    expect(transitionBatch('validating', { kind: 'validated_clean' })).toMatchObject({
      to: 'pending_approval',
    });
    expect(
      transitionBatch(
        'pending_approval',
        { kind: 'approved' },
        { preparedBy: 'alice', approvedBy: 'bob' },
      ),
    ).toMatchObject({ to: 'approved' });
    expect(transitionBatch('approved', { kind: 'jobs_enqueued' })).toMatchObject({
      to: 'disbursing',
    });
  });

  it('refuses approval by the preparer', () => {
    const result = transitionBatch(
      'pending_approval',
      { kind: 'approved' },
      { preparedBy: 'alice', approvedBy: 'alice' },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('approver_is_preparer');
  });

  it('will not leave disbursing while an item is unknown', () => {
    const result = transitionBatch(
      'disbursing',
      { kind: 'all_items_terminal', anyFailed: false },
      { itemStatuses: ['confirmed', 'confirmed', 'unknown'] },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('unresolved_items_remain');
  });

  it('will not leave disbursing while an item is still sending', () => {
    const result = transitionBatch(
      'disbursing',
      { kind: 'all_items_terminal', anyFailed: false },
      { itemStatuses: ['confirmed', 'sending'] },
    );
    expect(result.ok).toBe(false);
  });

  it('distinguishes completed from completed_with_failures', () => {
    expect(
      transitionBatch(
        'disbursing',
        { kind: 'all_items_terminal', anyFailed: false },
        { itemStatuses: ['confirmed', 'confirmed'] },
      ),
    ).toMatchObject({ to: 'completed' });

    expect(
      transitionBatch(
        'disbursing',
        { kind: 'all_items_terminal', anyFailed: true },
        { itemStatuses: ['confirmed', 'failed'] },
      ),
    ).toMatchObject({ to: 'completed_with_failures' });
  });

  it('has no edges out of closed or cancelled', () => {
    expect(transitionBatch('closed', { kind: 'pack_generated' }).ok).toBe(false);
    expect(transitionBatch('cancelled', { kind: 'import_complete' }).ok).toBe(false);
  });

  it('cannot cancel a batch that is already disbursing', () => {
    expect(transitionBatch('disbursing', { kind: 'cancelled' }).ok).toBe(false);
    expect(transitionBatch('approved', { kind: 'cancelled' }).ok).toBe(false);
  });
});

describe('canClose', () => {
  it('is false while anything is unresolved', () => {
    expect(canClose(['confirmed', 'failed'])).toBe(true);
    expect(canClose(['confirmed', 'unknown'])).toBe(false);
    expect(canClose(['sending'])).toBe(false);
    expect(canClose([])).toBe(true);
  });
});

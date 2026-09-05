import { useState } from 'react';
import { Card, EmptyState, Money, PageHeading, StatusPill } from '@web/components/primitives';
import { batchTreatment } from '@web/lib/status';
import { BATCHES, type BatchRow } from '@web/data/fixtures';
import './batches.css';

export type BatchesVariant = 'populated' | 'empty' | 'filtered';

/**
 * The filters actually filter. "Needs attention" is the default sort as well
 * as a filter, because somebody arriving at this screen is usually here to
 * find the one batch that is waiting on them.
 */
const FILTERS = {
  All: () => true,
  'Needs attention': (b: BatchRow) =>
    b.status === 'pending_approval' ||
    b.status === 'needs_fixes' ||
    b.status === 'completed_with_failures',
  Disbursing: (b: BatchRow) => b.status === 'disbursing' || b.status === 'approved',
  Closed: (b: BatchRow) => b.status === 'closed' || b.status === 'completed',
  Cancelled: (b: BatchRow) => b.status === 'cancelled',
} satisfies Record<string, (b: BatchRow) => boolean>;

type FilterName = keyof typeof FILTERS;

export function Batches({ variant, onNewBatch }: { variant: BatchesVariant; onNewBatch: () => void }) {
  const [filter, setFilter] = useState<FilterName>(variant === 'filtered' ? 'Cancelled' : 'All');

  const rows = variant === 'empty' ? [] : BATCHES.filter(FILTERS[filter]);

  const subtitle =
    variant === 'empty'
      ? 'No payout cycles yet'
      : filter === 'All'
        ? `${BATCHES.length} batches, anything needing attention is listed first`
        : `${rows.length} of ${BATCHES.length} batches`;

  return (
    <>
      <PageHeading
        title="Batches"
        subtitle={subtitle}
        action={
          <button type="button" className="btn btn-primary" onClick={onNewBatch}>
            New batch
          </button>
        }
      />

      <div className="filter-row">
        {(Object.keys(FILTERS) as FilterName[]).map((f) => (
          <button
            key={f}
            type="button"
            className={`chip${f === filter ? ' chip-on' : ''}`}
            aria-pressed={f === filter}
            onClick={() => setFilter(f)}
          >
            {f}
          </button>
        ))}
      </div>

      {variant === 'empty' && (
        <EmptyState
          title="No batches yet"
          body="A batch is one payout cycle: a list of people and amounts, reviewed, approved by a second person, and disbursed over M-Pesa. Before the first one, the payout channel must be verified in Settings; it is, as of 12 Feb 2026."
          action={
            <button type="button" className="btn btn-primary" onClick={onNewBatch}>
              New batch
            </button>
          }
        />
      )}

      {variant !== 'empty' && rows.length === 0 && (
        <Card className="none-match">
          <span>
            No batches match {filter.toLowerCase()}. {BATCHES.length} exist in total;{' '}
            <button type="button" className="linklike" onClick={() => setFilter('All')}>
              show all
            </button>
            .
          </span>
        </Card>
      )}

      {variant !== 'empty' && rows.length > 0 && (
        <Card className="table-card">
          <div className="row row-head batch-row">
            <span>Reference</span>
            <span>Programme</span>
            <span>Status</span>
            <span className="right">Items</span>
            <span className="right">Total</span>
            <span>Prepared by</span>
            <span>Approved by</span>
            <span>Updated</span>
          </div>
          {rows.map((b) => (
            <div key={b.reference} className="row batch-row">
              <button type="button" className="linklike mono">
                {b.reference}
              </button>
              <span>{b.programme}</span>
              <span>
                <StatusPill treatment={batchTreatment(b.status)} />
              </span>
              <span className="right mono">{b.items}</span>
              <span className="right">
                <Money amountMinor={b.totalMinor} />
              </span>
              <span className="text2">{b.preparedBy}</span>
              <span className="text2">{b.approvedBy}</span>
              <span className="mono muted small">{b.updatedAt}</span>
            </div>
          ))}
        </Card>
      )}
    </>
  );
}

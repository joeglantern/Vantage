import { useState } from 'react';
import { Card, EmptyState, Money, PageHeading, StatusPill } from '@web/components/primitives';
import { batchTreatment } from '@web/lib/status';
import { BATCHES } from '@web/data/fixtures';
import './batches.css';

export type BatchesVariant = 'populated' | 'empty' | 'filtered';

const FILTERS = ['All', 'Needs attention', 'Disbursing', 'Closed', 'Cancelled'] as const;

export function Batches({ variant }: { variant: BatchesVariant }) {
  const [filter, setFilter] = useState<string>(variant === 'filtered' ? 'Cancelled' : 'All');

  const subtitle =
    variant === 'empty'
      ? 'No payout cycles yet'
      : `${BATCHES.length + 1} batches · anything needing attention is listed first`;

  return (
    <>
      <PageHeading
        title="Batches"
        subtitle={subtitle}
        action={
          <button type="button" className="btn btn-primary">
            New batch
          </button>
        }
      />

      <div className="filter-row">
        {FILTERS.map((f) => (
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
            <button type="button" className="btn btn-primary">
              New batch
            </button>
          }
        />
      )}

      {variant === 'filtered' && (
        <Card className="none-match">
          <span>
            No batches are cancelled. 9 batches match no filter;{' '}
            <button type="button" className="linklike" onClick={() => setFilter('All')}>
              show all
            </button>
            .
          </span>
        </Card>
      )}

      {variant === 'populated' && (
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
          {BATCHES.map((b) => (
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

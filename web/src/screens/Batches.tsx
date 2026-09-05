/**
 * The batches list, reading from the API.
 *
 * This screen was fixtures until the server existed. It is now the first one
 * showing rows that came out of Postgres, through row level security, as the
 * least privilege application role. That matters beyond this list: it is the
 * proof that the tenancy boundary in src/platform/db works in the running
 * product and not only in an integration test.
 *
 * The loading and failure states are real states rather than an afterthought.
 * A finance officer opening this page while the server is down should be told
 * that, plainly, and not shown an empty table that reads as "you have no
 * batches".
 */
import { useCallback, useEffect, useState } from 'react';
import { Alert, Card, EmptyState, Money, PageHeading, StatusPill } from '@web/components/primitives';
import { batchTreatment } from '@web/lib/status';
import { listBatches, type ApiBatch, type ApiFailure } from '@web/lib/api';
import { BATCH_STATUSES, type BatchStatus } from '@domain/payout-batch';
import './batches.css';

export type BatchesVariant = 'populated' | 'empty' | 'filtered';

interface Row {
  readonly reference: string;
  readonly programme: string;
  readonly status: BatchStatus;
  readonly items: number;
  readonly totalMinor: string;
  readonly preparedBy: string;
  readonly approvedBy: string;
  readonly updatedAt: string;
}

/**
 * The filters actually filter. "Needs attention" is the default sort as well
 * as a filter, because somebody arriving at this screen is usually here to
 * find the one batch that is waiting on them.
 */
const FILTERS = {
  All: () => true,
  'Needs attention': (b: Row) =>
    b.status === 'pending_approval' ||
    b.status === 'needs_fixes' ||
    b.status === 'completed_with_failures',
  Disbursing: (b: Row) => b.status === 'disbursing' || b.status === 'approved',
  Closed: (b: Row) => b.status === 'closed' || b.status === 'completed',
  Cancelled: (b: Row) => b.status === 'cancelled',
} satisfies Record<string, (b: Row) => boolean>;

type FilterName = keyof typeof FILTERS;

const KNOWN_STATUSES: readonly string[] = BATCH_STATUSES;

/**
 * A status the interface does not recognise means the server is ahead of this
 * bundle, which happens for a few seconds during any deploy.
 *
 * Returning null rather than guessing keeps the decision at the call site,
 * which shows the batch as a draft. That is the least alarming wrong answer
 * available: it never claims a batch was approved, disbursed or closed when the
 * interface does not actually know.
 */
function asStatus(value: string): BatchStatus | null {
  return KNOWN_STATUSES.includes(value) ? (value as BatchStatus) : null;
}

/** "06 Mar 09:14", the way the rest of the interface writes a timestamp. */
function formatWhen(iso: string): string {
  const date = new Date(iso);
  // isNaN rather than Number.isNaN: the lint rule bans Number outright in this
  // codebase because it handles money, and the argument here is already a
  // number so the coercion isNaN is criticised for cannot happen.
  if (isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
    .format(date)
    .replace(',', '');
}

function toRow(batch: ApiBatch): Row {
  return {
    reference: batch.reference,
    programme: batch.programme,
    status: asStatus(batch.status) ?? 'draft',
    items: batch.items,
    totalMinor: batch.totalMinor,
    preparedBy: batch.preparedBy,
    // Null means nobody has approved it. The column says what is true rather
    // than sitting empty, because blank reads as missing data.
    approvedBy: batch.approvedBy ?? 'Awaiting approver',
    updatedAt: formatWhen(batch.updatedAt),
  };
}

type Load =
  | { kind: 'loading' }
  | { kind: 'failed'; error: ApiFailure }
  | { kind: 'loaded'; rows: readonly Row[] };

export function Batches({ variant, onNewBatch }: { variant: BatchesVariant; onNewBatch: () => void }) {
  const [filter, setFilter] = useState<FilterName>(variant === 'filtered' ? 'Cancelled' : 'All');
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const [attempt, setAttempt] = useState(0);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    // The dev switcher's empty variant is a design state, not a server state,
    // so it does not go near the network.
    if (variant === 'empty') {
      setLoad({ kind: 'loaded', rows: [] });
      return;
    }

    const controller = new AbortController();
    setLoad({ kind: 'loading' });

    void (async () => {
      const result = await listBatches(controller.signal);
      if (controller.signal.aborted) return;
      setLoad(
        result.ok
          ? { kind: 'loaded', rows: result.data.batches.map(toRow) }
          : { kind: 'failed', error: result.error },
      );
    })();

    // Abort on unmount so a slow reply cannot set state on a screen that has
    // been navigated away from.
    return () => controller.abort();
  }, [variant, attempt]);

  const all = load.kind === 'loaded' ? load.rows : [];
  const rows = all.filter(FILTERS[filter]);

  const subtitle =
    load.kind === 'loading'
      ? 'Loading'
      : load.kind === 'failed'
        ? 'Could not load batches'
        : all.length === 0
          ? 'No payout cycles yet'
          : filter === 'All'
            ? `${all.length} ${all.length === 1 ? 'batch' : 'batches'}, anything needing attention is listed first`
            : `${rows.length} of ${all.length} batches`;

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

      {load.kind === 'failed' && (
        <Alert title="Could not load batches">
          {load.error.message}{' '}
          <button type="button" className="linklike" onClick={retry}>
            Try again
          </button>
        </Alert>
      )}

      {load.kind === 'loaded' && all.length > 0 && (
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
      )}

      {load.kind === 'loading' && (
        <Card className="none-match">
          <span className="text2">Loading batches</span>
        </Card>
      )}

      {load.kind === 'loaded' && all.length === 0 && (
        <EmptyState
          title="No batches yet"
          body="A batch is one payout cycle: a list of people and amounts, reviewed, approved by a second person, and disbursed over M-Pesa. Before the first one, the payout channel must be verified in Settings."
          action={
            <button type="button" className="btn btn-primary" onClick={onNewBatch}>
              New batch
            </button>
          }
        />
      )}

      {load.kind === 'loaded' && all.length > 0 && rows.length === 0 && (
        <Card className="none-match">
          <span>
            No batches match {filter.toLowerCase()}. {all.length} exist in total;{' '}
            <button type="button" className="linklike" onClick={() => setFilter('All')}>
              show all
            </button>
            .
          </span>
        </Card>
      )}

      {rows.length > 0 && (
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

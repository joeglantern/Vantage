/**
 * Import, doing the real thing.
 *
 * This screen reads a file the user actually drops or chooses, parses it,
 * shows what was in it, and hands the rows to the exception queue where the
 * real validation rules run. Nothing here is a mock: the row count, the total
 * and every error message come from the file in front of you.
 *
 * Reading and judging stay separate, per docs/04. This step only says what is
 * in the file. It never says what is wrong with it.
 */
import { useRef, useState, type DragEvent } from 'react';
import { Alert, Card, Money, PageHeading } from '@web/components/primitives';
import { formatBytes, MAX_FILE_BYTES, MAX_ROWS, parseSheet, type SheetError } from '@web/lib/csv';
import { moneyFromMajorString } from '@domain/money';
import type { TypedRow } from '@web/data/review';
import './import.css';

export interface ImportedBatch {
  readonly rows: readonly TypedRow[];
  readonly fileName: string;
  readonly fileSize: string;
  readonly totalMinor: bigint;
  /** The human handle for this cycle, for example YCIC-2026-03. */
  readonly reference: string;
  readonly programme: string;
}

/**
 * A first guess at the reference and programme, taken from the file name.
 *
 * Deliberately derived rather than invented. An earlier version hard-coded
 * YCIC-2026-03 whatever was uploaded, so a health promoters sheet came back
 * titled as a youth cohort stipend. In a product whose whole claim is accurate
 * records, a heading that quietly misnames the batch is worse than an ugly one.
 * Both fields are editable, and the person doing the cycle knows the answer.
 */
function suggestFrom(fileName: string): { reference: string; programme: string } {
  const stem = fileName.replace(/\.[^.]+$/, '').replace(/[^A-Za-z0-9]+/g, ' ').trim();
  const words = stem === '' ? ['Batch'] : stem.split(' ');
  return {
    reference: words.join('-').toUpperCase().slice(0, 32),
    programme: words.join(' ').replace(/^./, (c) => c.toUpperCase()),
  };
}

type Phase =
  | { kind: 'waiting' }
  | { kind: 'reading'; fileName: string; fileSize: string }
  | { kind: 'error'; title: string; body: string }
  | { kind: 'ready'; batch: ImportedBatch };

const ERROR_TITLES: Record<SheetError['kind'], string> = {
  empty: 'The file is empty',
  header_only: 'The file has a header row and nothing else',
  missing_columns: 'The file has the wrong columns',
  not_text: 'The file could not be read',
};

function toTypedRows(rows: readonly Readonly<Record<string, string>>[]): TypedRow[] {
  return rows.map((row, index) => ({
    n: index + 1,
    ref: row['participant_ref'] ?? '',
    name: row['full_name'] ?? '',
    phone: row['phone'] ?? '',
    amount: row['amount'] ?? '',
    note: row['note'] ?? '',
  }));
}

function totalOf(rows: readonly TypedRow[]): bigint {
  return rows.reduce((sum, row) => {
    const parsed = moneyFromMajorString(row.amount, 'KES');
    return parsed.ok ? sum + parsed.money.amountMinor : sum;
  }, 0n);
}

export function Import({ onValidate }: { onValidate: (batch: ImportedBatch) => void }) {
  const [phase, setPhase] = useState<Phase>({ kind: 'waiting' });
  const [dragging, setDragging] = useState(false);
  const [details, setDetails] = useState({ reference: '', programme: '' });
  const fileInput = useRef<HTMLInputElement>(null);

  async function accept(file: File): Promise<void> {
    const size = formatBytes(file.size);

    if (file.size > MAX_FILE_BYTES) {
      setPhase({
        kind: 'error',
        title: 'The file is too large',
        body: `${file.name} is ${size}; the limit is ${formatBytes(MAX_FILE_BYTES)}, about ${MAX_ROWS.toLocaleString('en-GB')} rows. A batch is one cycle for one programme; split the file by programme and upload each one as its own batch.`,
      });
      return;
    }

    setPhase({ kind: 'reading', fileName: file.name, fileSize: size });

    let text: string;
    try {
      text = await file.text();
    } catch {
      setPhase({
        kind: 'error',
        title: 'The file could not be read',
        body: `${file.name} could not be opened. Check it is not open in another program, then try again.`,
      });
      return;
    }

    const parsed = parseSheet(text);
    if (!parsed.ok) {
      setPhase({ kind: 'error', title: ERROR_TITLES[parsed.error.kind], body: parsed.error.detail });
      return;
    }

    if (parsed.sheet.rows.length > MAX_ROWS) {
      setPhase({
        kind: 'error',
        title: 'The file has too many rows',
        body: `${file.name} has ${parsed.sheet.rows.length.toLocaleString('en-GB')} rows; the limit is ${MAX_ROWS.toLocaleString('en-GB')}. Split it by programme and upload each one as its own batch.`,
      });
      return;
    }

    const rows = toTypedRows(parsed.sheet.rows);
    const suggested = suggestFrom(file.name);
    setDetails(suggested);
    setPhase({
      kind: 'ready',
      batch: {
        rows,
        fileName: file.name,
        fileSize: size,
        totalMinor: totalOf(rows),
        ...suggested,
      },
    });
  }

  function onDrop(event: DragEvent<HTMLElement>): void {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files.item(0);
    if (file !== null) void accept(file);
  }

  const showDrop = phase.kind === 'waiting' || phase.kind === 'error';

  return (
    <>
      <PageHeading
        title="New batch"
        subtitle="Step 1 of 3: upload the list. Validation and review follow."
      />

      <div className="import-grid">
        <div className="import-main">
          {phase.kind === 'error' && <Alert title={phase.title}>{phase.body}</Alert>}

          {showDrop && (
            <Card
              className={`dropzone${dragging ? ' dropzone-over' : ''}`}
              onDragOver={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
            >
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true" className="muted">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
                <path d="M14 2v6h6" />
              </svg>
              <div className="dropzone-title">
                Drop a CSV here, or{' '}
                <button type="button" className="linklike" onClick={() => fileInput.current?.click()}>
                  choose a file
                </button>
              </div>
              <div className="text2 dropzone-hint">
                Up to {formatBytes(MAX_FILE_BYTES)}, up to {MAX_ROWS.toLocaleString('en-GB')} rows.
              </div>
              <input
                ref={fileInput}
                type="file"
                accept=".csv,text/csv,text/plain"
                className="visually-hidden"
                onChange={(event) => {
                  const file = event.target.files?.item(0);
                  if (file != null) void accept(file);
                  event.target.value = '';
                }}
              />
            </Card>
          )}

          {phase.kind === 'reading' && (
            <Card className="parsing">
              <h2>Reading {phase.fileName}</h2>
              <p className="text2">
                {phase.fileSize}. Nothing is validated yet; this step only reads what is in the file.
              </p>
              <div className="progress" role="progressbar" aria-label="Reading file">
                <div className="progress-bar progress-indeterminate" />
              </div>
            </Card>
          )}

          {phase.kind === 'ready' && (
            <Card className="table-card">
              <div className="preview-head">
                <div>
                  <h2>
                    Read from {phase.batch.fileName}: {phase.batch.rows.length} rows,{' '}
                    <Money amountMinor={phase.batch.totalMinor.toString()} />
                  </h2>
                  <div className="hint">
                    Not validated yet. Check the file is the one you meant, then validate. The file
                    is stored exactly as uploaded and linked to the batch.
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn-sm btn-primary"
                  disabled={details.reference.trim() === '' || details.programme.trim() === ''}
                  onClick={() => onValidate({ ...phase.batch, ...details })}
                >
                  Validate {phase.batch.rows.length} rows
                </button>
              </div>

              <div className="batch-details">
                <div>
                  <label className="label" htmlFor="batch-reference">
                    Batch reference
                  </label>
                  <input
                    id="batch-reference"
                    className="field mono"
                    value={details.reference}
                    onChange={(event) =>
                      setDetails((d) => ({ ...d, reference: event.target.value }))
                    }
                  />
                  <div className="hint">
                    Your handle for this cycle. It appears on the pack and must be unique.
                  </div>
                </div>
                <div>
                  <label className="label" htmlFor="batch-programme">
                    Programme
                  </label>
                  <input
                    id="batch-programme"
                    className="field"
                    value={details.programme}
                    onChange={(event) =>
                      setDetails((d) => ({ ...d, programme: event.target.value }))
                    }
                  />
                  <div className="hint">
                    Suggested from the file name. Correct it if it is not right.
                  </div>
                </div>
              </div>
              <div className="row row-head raw-row">
                <span>Row</span>
                <span>participant_ref</span>
                <span>full_name</span>
                <span>phone</span>
                <span className="right">amount</span>
                <span>note</span>
              </div>
              {phase.batch.rows.slice(0, 5).map((r) => (
                <div key={r.n} className="row raw-row mono">
                  <span className="muted">{r.n}</span>
                  <span>{r.ref}</span>
                  <span className="sans">{r.name}</span>
                  <span>{r.phone}</span>
                  <span className="right">{r.amount}</span>
                  <span className="sans text2">{r.note}</span>
                </div>
              ))}
              <div className="preview-foot hint">
                Showing {Math.min(5, phase.batch.rows.length)} of {phase.batch.rows.length} rows, as
                typed. Phone numbers are shown in full here only, before they are stored; after
                validation they are masked everywhere.
              </div>
            </Card>
          )}
        </div>

        <aside className="card import-aside">
          <h2>Expected columns</h2>
          <p className="hint import-aside-note">
            First row is the header. Order does not matter; names do.
          </p>
          <dl className="col-spec">
            <dt className="mono">participant_ref</dt>
            <dd className="text2">Your reference for the person. Optional.</dd>
            <dt className="mono">full_name</dt>
            <dd className="text2">Name as you know them.</dd>
            <dt className="mono">phone</dt>
            <dd className="text2">Any Kenyan mobile format: 0712…, +254712…, 254712…, 0110…</dd>
            <dt className="mono">amount</dt>
            <dd className="text2">
              Whole shillings. 1500, 1,500 and 1500.00 are all fine; 1500.50 is not.
            </dd>
            <dt className="mono">note</dt>
            <dd className="text2">Optional. Kept with the row.</dd>
          </dl>
          <a className="import-link" href="/cohort-messy.csv" download>
            Download a sample CSV to try
          </a>
        </aside>
      </div>
    </>
  );
}

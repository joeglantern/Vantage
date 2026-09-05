import { Alert, Card, Money, PageHeading } from '@web/components/primitives';
import { IMPORT_ERRORS, IMPORT_SUMMARY, RAW_ROWS, type ImportErrorKey } from '@web/data/fixtures';
import './import.css';

export type ImportVariant = 'waiting' | 'parsing' | 'preview' | ImportErrorKey;

function isErrorVariant(v: ImportVariant): v is ImportErrorKey {
  return v in IMPORT_ERRORS;
}

export function Import({ variant }: { variant: ImportVariant }) {
  const error = isErrorVariant(variant) ? IMPORT_ERRORS[variant] : null;
  const showDrop = variant === 'waiting' || error !== null;

  return (
    <>
      <PageHeading
        title="New batch"
        subtitle="Step 1 of 3: upload the list. Validation and review follow."
      />

      <div className="import-grid">
        <div className="import-main">
          {error !== null && <Alert title={error.title}>{error.body}</Alert>}

          {showDrop && (
            <Card className="dropzone">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true" className="muted">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
                <path d="M14 2v6h6" />
              </svg>
              <div className="dropzone-title">
                Drop a CSV here, or <a href="#">choose a file</a>
              </div>
              <div className="text2 dropzone-hint">
                Up to 5 MB, up to 5,000 rows. Or <a href="#">paste rows from a spreadsheet</a>.
              </div>
            </Card>
          )}

          {variant === 'parsing' && (
            <Card className="parsing">
              <h2>Reading {IMPORT_SUMMARY.fileName}</h2>
              <p className="text2">
                {IMPORT_SUMMARY.fileSize}. Nothing is validated yet; this step only reads what is in
                the file.
              </p>
              <div className="progress" role="progressbar" aria-label="Reading file">
                <div className="progress-bar" style={{ width: '70%' }} />
              </div>
            </Card>
          )}

          {variant === 'preview' && (
            <Card className="table-card">
              <div className="preview-head">
                <div>
                  <h2>
                    Read from {IMPORT_SUMMARY.fileName}: {IMPORT_SUMMARY.rows} rows,{' '}
                    <Money amountMinor={IMPORT_SUMMARY.totalMinor} />
                  </h2>
                  <div className="hint">
                    Not validated yet. Check the file is the one you meant, then validate. The file
                    is stored exactly as uploaded and linked to the batch.
                  </div>
                </div>
                <button type="button" className="btn btn-sm btn-primary">
                  Validate {IMPORT_SUMMARY.rows} rows
                </button>
              </div>
              <div className="row row-head raw-row">
                <span>Row</span>
                <span>participant_ref</span>
                <span>full_name</span>
                <span>phone</span>
                <span className="right">amount</span>
                <span>note</span>
              </div>
              {RAW_ROWS.map((r) => (
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
                Showing {RAW_ROWS.length} of {IMPORT_SUMMARY.rows} rows, as typed. Phone numbers are
                shown in full here only, before they are stored; after validation they are masked
                everywhere.
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
          <a href="#" className="import-link">
            Download a template CSV
          </a>
          <a href="#" className="import-link">
            Start from the February batch instead
          </a>
        </aside>
      </div>
    </>
  );
}

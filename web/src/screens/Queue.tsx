/**
 * The exception queue. 01-structure calls it the most important screen in the
 * product, and the programme officer's experience of Vantage is almost
 * entirely this one screen.
 *
 * Nothing here decides what is wrong with a row. The rows are held in state
 * and every render runs them through the domain's `validateBatch`, so an edit
 * that fixes a misplaced decimal removes the finding and drops the running
 * total in the same frame, and an edit that breaks something raises the real
 * finding with the real message.
 *
 * Findings are grouped per row and a row's severity is the worst of them.
 * Rows 17 and 19 of the fixture each carry one blocking and two warning
 * findings, so a row can be "must fix" and still have warnings that need a
 * named acknowledgement once the blocking part is dealt with.
 *
 * Fixing changes the data. Acknowledging accepts it as correct and records
 * who did. The two are drawn differently on purpose.
 */
import { useMemo, useRef, useState, type ReactNode } from 'react';
import { canSubmitForApproval, type Finding, type Severity } from '@domain/validation';
import { maskMsisdn } from '@domain/msisdn';
import { Card, Money, PageHeading, Phone, StatusPill } from '@web/components/primitives';
import { Dialog } from '@web/components/Dialog';
import { severityTreatment } from '@web/lib/status';
import { CURRENT_USER } from '@web/data/fixtures';
import {
  ACKNOWLEDGEMENTS,
  CORRECTED_ROWS,
  EDITS,
  REVIEW_BATCH,
  TYPED_ROWS,
  batchLevelFindings,
  buildQueue,
  validateTyped,
  type QueueRow,
  type TypedRow,
} from '@web/data/review';
import './queue.css';

export type QueueVariant = 'validating' | 'blocking' | 'warnings' | 'acknowledged' | 'clear';

interface Acknowledgement {
  readonly by: string;
  readonly at: string;
}

interface Edit {
  readonly what: string;
  readonly by: string;
  readonly at: string;
}

const ackKey = (row: number, code: string) => `${row}:${code}`;

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** The rows each variant starts from. Everything after that is live. */
function startingRows(variant: QueueVariant): readonly TypedRow[] {
  switch (variant) {
    case 'validating':
    case 'blocking':
      return TYPED_ROWS;
    case 'warnings':
    case 'acknowledged':
      return CORRECTED_ROWS;
    case 'clear':
      return buildQueue(TYPED_ROWS, validateTyped(TYPED_ROWS))
        .filter((r) => r.worst === null)
        .map((r) => r.typed)
        .sort((a, b) => a.n - b.n);
  }
}

function startingAcks(variant: QueueVariant, rows: readonly TypedRow[]): Map<string, Acknowledgement> {
  const acks = new Map<string, Acknowledgement>();
  if (variant !== 'acknowledged') return acks;
  const outcome = validateTyped(rows);
  for (const a of ACKNOWLEDGEMENTS) {
    for (const f of outcome.findings) {
      if (f.row === a.row && f.severity === 'warning') acks.set(ackKey(a.row, f.code), { by: a.by, at: a.at });
    }
  }
  return acks;
}

function startingEdits(variant: QueueVariant): Map<number, Edit> {
  const edits = new Map<number, Edit>();
  if (variant !== 'warnings' && variant !== 'acknowledged') return edits;
  for (const e of EDITS) edits.set(e.row, { what: e.what, by: e.by, at: e.at });
  return edits;
}

export function Queue({ variant }: { variant: QueueVariant }) {
  const [rows, setRows] = useState<readonly TypedRow[]>(() => startingRows(variant));
  const [acks, setAcks] = useState(() => startingAcks(variant, rows));
  const [edits, setEdits] = useState(() => startingEdits(variant));
  const [editing, setEditing] = useState<number | null>(null);
  const [removing, setRemoving] = useState<number | null>(null);
  const [showClean, setShowClean] = useState(false);
  const [submitOpen, setSubmitOpen] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const rowRefs = useRef(new Map<number, HTMLDivElement>());

  const uploadedTotal = useMemo(() => validateTyped(startingRows(variant)).totalMinor, [variant]);
  const outcome = useMemo(() => validateTyped(rows), [rows]);
  const queue = useMemo(() => buildQueue(rows, outcome), [rows, outcome]);
  const batchFindings = batchLevelFindings(outcome);

  const blocking = outcome.findings.filter((f) => f.severity === 'blocking');
  const warnings = outcome.findings.filter((f) => f.severity === 'warning');
  const unacknowledged = warnings.filter((f) => f.row !== null && !acks.has(ackKey(f.row, f.code)));
  const flagged = queue.filter((r) => r.worst !== null);
  const clean = queue.filter((r) => r.worst === null);

  const canSubmit = canSubmitForApproval(outcome) && unacknowledged.length === 0 && rows.length > 0;
  const submitReason = !canSubmitForApproval(outcome)
    ? `${plural(blocking.length, 'issue blocks', 'issues block')} submission`
    : unacknowledged.length > 0
      ? `${plural(unacknowledged.length, 'warning is', 'warnings are')} not yet acknowledged`
      : rows.length === 0
        ? 'There are no rows to submit'
        : null;

  const jumpTo = (n: number) => {
    const el = rowRefs.current.get(n);
    if (el === undefined) return;
    el.scrollIntoView({ block: 'center' });
    el.focus();
  };

  const acknowledge = (row: number, code: string) => {
    setAcks((prev) => new Map(prev).set(ackKey(row, code), { by: CURRENT_USER.name, at: 'just now' }));
  };

  const saveEdit = (n: number, next: TypedRow) => {
    const before = rows.find((r) => r.n === n);
    if (before === undefined) return;
    const changes: string[] = [];
    if (before.name !== next.name) changes.push(`name was ${before.name}`);
    if (before.phone !== next.phone) changes.push(`phone was ${maskMsisdn(before.phone)}`);
    if (before.amount !== next.amount) changes.push(`amount was ${before.amount}`);
    if (changes.length > 0) {
      setRows((prev) => prev.map((r) => (r.n === n ? next : r)));
      setEdits((prev) => new Map(prev).set(n, { what: `Corrected: ${changes.join(', ')}`, by: CURRENT_USER.name, at: 'just now' }));
      // The data changed, so any acceptance of the old data no longer stands.
      setAcks((prev) => {
        const cleared = new Map(prev);
        for (const key of cleared.keys()) if (key.startsWith(`${n}:`)) cleared.delete(key);
        return cleared;
      });
    }
    setEditing(null);
  };

  const removeRow = (n: number) => {
    setRows((prev) => prev.filter((r) => r.n !== n));
    setRemoving(null);
  };

  if (variant === 'validating') {
    return (
      <>
        <Heading rows={rows.length} />
        <Card className="q-validating" aria-busy="true">
          <h2>Validating {plural(rows.length, 'row', 'rows')} from {REVIEW_BATCH.fileName}</h2>
          <p className="text2">
            Each row is checked against the same rules: the phone number normalises to a Kenyan
            mobile, the amount is a positive whole shilling, nobody appears twice, and nothing is
            above the limits in Settings. Then each row is compared with what is already on file.
          </p>
          <div className="progress" role="progressbar" aria-label="Validating rows">
            <div className="progress-bar" style={{ width: '45%' }} />
          </div>
          <p className="hint">Nothing is submitted by this step. It only reads.</p>
        </Card>
      </>
    );
  }

  if (submitted) {
    return (
      <>
        <Heading rows={rows.length} />
        <Card className="q-submitted" role="status">
          <h2>
            Submitted for approval: {plural(rows.length, 'row', 'rows')},{' '}
            <Money amountMinor={outcome.totalMinor.toString()} />
          </h2>
          <p className="text2 pretty">
            {REVIEW_BATCH.reference} is now waiting for an approver. David Ochieng and Grace Muthoni
            hold the role; you cannot approve it yourself. An approver can send it back here with a
            note, and nothing moves until one of them passes the step-up challenge.
          </p>
        </Card>
      </>
    );
  }

  return (
    <>
      <Heading rows={rows.length} />

      <Summary
        blocking={blocking}
        unacknowledged={unacknowledged}
        acknowledged={warnings.length - unacknowledged.length}
        batchFindings={batchFindings}
        rows={rows}
        totalMinor={outcome.totalMinor}
        onJump={jumpTo}
      />

      <div className="q-footer" role="region" aria-label="Batch total and submission">
        <div className="q-total">
          <span className="q-total-label">Running total</span>
          <span className="q-total-figure">
            <Money amountMinor={outcome.totalMinor.toString()} />
          </span>
          <span className="text2">
            {plural(rows.length, 'row', 'rows')}
            {outcome.totalMinor !== uploadedTotal && (
              <>
                {' '}
                &middot; was <Money amountMinor={uploadedTotal.toString()} /> at upload
              </>
            )}
          </span>
        </div>
        <div className="q-submit">
          {submitReason !== null && <span className="q-submit-reason">{submitReason}</span>}
          <button type="button" className="btn btn-primary" disabled={!canSubmit} onClick={() => setSubmitOpen(true)}>
            Submit for approval
          </button>
        </div>
      </div>

      <Card className="table-card">
        <div className="row row-head q-row">
          <span>Row</span>
          <span>Reference</span>
          <span>Name as instructed</span>
          <span>Phone</span>
          <span className="right">Amount</span>
          <span>Findings</span>
          <span />
        </div>

        {flagged.map((q) => (
          <QueueLine
            key={q.typed.n}
            q={q}
            acks={acks}
            edit={edits.get(q.typed.n) ?? null}
            editing={editing === q.typed.n}
            removing={removing === q.typed.n}
            registerRef={(el) => {
              if (el === null) rowRefs.current.delete(q.typed.n);
              else rowRefs.current.set(q.typed.n, el);
            }}
            onEdit={() => {
              setRemoving(null);
              setEditing(q.typed.n);
            }}
            onCancelEdit={() => setEditing(null)}
            onSave={(next) => saveEdit(q.typed.n, next)}
            onAcknowledge={(code) => acknowledge(q.typed.n, code)}
            onAskRemove={() => {
              setEditing(null);
              setRemoving(q.typed.n);
            }}
            onKeep={() => setRemoving(null)}
            onRemove={() => removeRow(q.typed.n)}
          />
        ))}

        {clean.length > 0 && (
          <div className="q-clean-head">
            <span>
              {flagged.length === 0
                ? `All ${plural(clean.length, 'row raised', 'rows raised')} nothing.`
                : `${plural(clean.length, 'row raised', 'rows raised')} nothing.`}
            </span>
            <button type="button" className="linklike" aria-expanded={showClean} onClick={() => setShowClean((s) => !s)}>
              {showClean ? 'Hide them' : 'Show them'}
            </button>
          </div>
        )}

        {showClean &&
          clean.map((q) => (
            <QueueLine
              key={q.typed.n}
              q={q}
              acks={acks}
              edit={edits.get(q.typed.n) ?? null}
              editing={editing === q.typed.n}
              removing={removing === q.typed.n}
              registerRef={(el) => {
                if (el === null) rowRefs.current.delete(q.typed.n);
                else rowRefs.current.set(q.typed.n, el);
              }}
              onEdit={() => {
                setRemoving(null);
                setEditing(q.typed.n);
              }}
              onCancelEdit={() => setEditing(null)}
              onSave={(next) => saveEdit(q.typed.n, next)}
              onAcknowledge={(code) => acknowledge(q.typed.n, code)}
              onAskRemove={() => {
                setEditing(null);
                setRemoving(q.typed.n);
              }}
              onKeep={() => setRemoving(null)}
              onRemove={() => removeRow(q.typed.n)}
            />
          ))}
      </Card>

      <Dialog
        open={submitOpen}
        title={`Submit ${REVIEW_BATCH.reference} for approval`}
        confirmLabel={`Submit ${plural(rows.length, 'row', 'rows')} for approval`}
        onCancel={() => setSubmitOpen(false)}
        onConfirm={() => {
          setSubmitOpen(false);
          setSubmitted(true);
        }}
        footnote="Escape cancels. Nothing is paid by this step; an approver still has to authorise it."
      >
        <span>
          <Money amountMinor={outcome.totalMinor.toString()} /> to {plural(rows.length, 'person', 'people')},
          for {REVIEW_BATCH.programme}.
        </span>
        <span>
          {warnings.length === 0
            ? 'No warnings were raised.'
            : `${plural(warnings.length, 'warning was', 'warnings were')} acknowledged by ${CURRENT_USER.name} and will be shown to the approver by name.`}
          {edits.size > 0 && ` ${plural(edits.size, 'row was', 'rows were')} corrected here; each correction is in the audit trail.`}
        </span>
        <span>
          The approver can send the batch back. Once approved, the list is frozen and money moves.
        </span>
      </Dialog>
    </>
  );
}

function Heading({ rows }: { rows: number }) {
  return (
    <PageHeading
      title={`${REVIEW_BATCH.reference}: review`}
      subtitle={`${REVIEW_BATCH.programme} · ${plural(rows, 'row', 'rows')} from ${REVIEW_BATCH.fileName}, uploaded ${REVIEW_BATCH.uploadedAt}`}
    />
  );
}

/**
 * The error summary, in the GOV.UK pattern: every problem named at the top of
 * the page, each one a link to its row. Counts are findings, not rows,
 * because a row can carry several and each has to be dealt with.
 */
function Summary({
  blocking,
  unacknowledged,
  acknowledged,
  batchFindings,
  rows,
  totalMinor,
  onJump,
}: {
  blocking: readonly Finding[];
  unacknowledged: readonly Finding[];
  acknowledged: number;
  batchFindings: readonly Finding[];
  rows: readonly TypedRow[];
  totalMinor: bigint;
  onJump: (row: number) => void;
}) {
  const nameOf = (row: number) => rows.find((r) => r.n === row)?.name ?? '';

  let title: ReactNode;
  let tone: 'fail' | 'warn' | 'ok';
  if (blocking.length > 0 && unacknowledged.length > 0) {
    tone = 'fail';
    title = `${plural(blocking.length, 'issue', 'issues')} must be fixed before this batch can be approved, and ${plural(unacknowledged.length, 'warning needs', 'warnings need')} acknowledging`;
  } else if (blocking.length > 0) {
    tone = 'fail';
    title = `${plural(blocking.length, 'issue', 'issues')} must be fixed before this batch can be approved`;
  } else if (unacknowledged.length > 0) {
    tone = 'warn';
    title = `${plural(unacknowledged.length, 'warning needs', 'warnings need')} acknowledging before this batch can be submitted`;
  } else {
    tone = 'ok';
    title = (
      <>
        {acknowledged > 0
          ? `Every warning is acknowledged. ${plural(rows.length, 'row', 'rows')}, `
          : `Nothing to fix. ${plural(rows.length, 'row', 'rows')}, `}
        <Money amountMinor={totalMinor.toString()} />, ready to submit for approval.
      </>
    );
  }

  const listed = [...blocking, ...unacknowledged];

  return (
    <section className={`q-summary q-summary-${tone}`} role={tone === 'ok' ? 'status' : 'alert'} aria-labelledby="q-summary-title">
      <h2 id="q-summary-title">{title}</h2>
      {batchFindings.map((f) => (
        <p key={f.code} className="q-summary-batch">
          <StatusPill treatment={severityTreatment(f.severity)} /> Whole batch: {f.message}
        </p>
      ))}
      {listed.length > 0 && (
        <ol className="q-summary-list">
          {listed.map((f) => (
            <li key={`${f.row ?? 'batch'}:${f.code}`}>
              {f.row !== null && (
                <button type="button" className="linklike" onClick={() => onJump(f.row as number)}>
                  Row {f.row}, {nameOf(f.row)}
                </button>
              )}
              <span className="text2">: {f.message}</span>
            </li>
          ))}
        </ol>
      )}
      {tone !== 'ok' && acknowledged > 0 && (
        <p className="hint">{plural(acknowledged, 'warning is', 'warnings are')} already acknowledged and not listed.</p>
      )}
    </section>
  );
}

function QueueLine({
  q,
  acks,
  edit,
  editing,
  removing,
  registerRef,
  onEdit,
  onCancelEdit,
  onSave,
  onAcknowledge,
  onAskRemove,
  onKeep,
  onRemove,
}: {
  q: QueueRow;
  acks: ReadonlyMap<string, Acknowledgement>;
  edit: Edit | null;
  editing: boolean;
  removing: boolean;
  registerRef: (el: HTMLDivElement | null) => void;
  onEdit: () => void;
  onCancelEdit: () => void;
  onSave: (next: TypedRow) => void;
  onAcknowledge: (code: string) => void;
  onAskRemove: () => void;
  onKeep: () => void;
  onRemove: () => void;
}) {
  const { typed, findings, worst } = q;
  const phoneInvalid = findings.some((f) => f.code === 'msisdn_invalid');
  const amountInvalid = findings.some(
    (f) => f.code === 'amount_not_positive' || f.code === 'amount_not_whole_shilling' || f.code === 'amount_exceeds_item_limit',
  );

  return (
    <div
      ref={registerRef}
      id={`row-${typed.n}`}
      className={`q-line${worst === null ? ' q-line-clean' : ` q-line-${worst}`}`}
      tabIndex={-1}
      aria-label={`Row ${typed.n}, ${typed.name}`}
    >
      {editing ? (
        <RowEditor typed={typed} onCancel={onCancelEdit} onSave={onSave} />
      ) : (
        <div className="row q-row">
          <span className="mono muted">{typed.n}</span>
          <span className="mono">{typed.ref}</span>
          <span>{typed.name}</span>
          <span className={phoneInvalid ? 'q-bad' : ''}>
            {phoneInvalid ? <span className="mono">{maskMsisdn(typed.phone)}</span> : <PhoneOf q={q} />}
          </span>
          <span className={`right${amountInvalid ? ' q-bad' : ''}`}>
            {q.amount.amountMinor === 0n && typed.amount !== '0' ? (
              <span className="mono">{typed.amount}</span>
            ) : (
              <Money amountMinor={q.amount.amountMinor.toString()} />
            )}
          </span>
          <span>{worst === null ? <span className="muted">None</span> : <StatusPill treatment={severityTreatment(worst)} />}</span>
          <span className="q-actions">
            {removing ? (
              <span className="q-inline-confirm">
                <span>Remove {typed.name}?</span>
                <button type="button" className="btn btn-sm btn-danger" onClick={onRemove}>
                  Remove
                </button>
                <button type="button" className="btn btn-sm btn-secondary" onClick={onKeep}>
                  Keep
                </button>
              </span>
            ) : (
              <>
                <button type="button" className="btn btn-sm btn-secondary" onClick={onEdit}>
                  Edit
                </button>
                <button type="button" className="btn btn-sm btn-secondary" onClick={onAskRemove}>
                  Remove row
                </button>
              </>
            )}
          </span>
        </div>
      )}

      {(findings.length > 0 || edit !== null) && (
        <ul className="q-findings">
          {findings.map((f) => (
            <FindingLine key={f.code} finding={f} ack={acks.get(ackKey(typed.n, f.code)) ?? null} onAcknowledge={() => onAcknowledge(f.code)} />
          ))}
          {edit !== null && (
            <li className="q-edited">
              <span className="q-edited-mark" aria-hidden="true" />
              <span>
                {edit.what}. Edited by {edit.by}, {edit.at}. Recorded in the audit trail.
              </span>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

function PhoneOf({ q }: { q: QueueRow }) {
  // The validated MSISDN is what gets masked. The typed value only appears in
  // the editor, the same way the import preview shows it before it is stored.
  const outcomeRow = validateTyped([q.typed]).rows[0];
  const msisdn = outcomeRow?.msisdn ?? null;
  return msisdn === null ? <span className="mono">{maskMsisdn(q.typed.phone)}</span> : <Phone msisdn={msisdn} />;
}

function FindingLine({ finding, ack, onAcknowledge }: { finding: Finding; ack: Acknowledgement | null; onAcknowledge: () => void }) {
  const severity: Severity = finding.severity;
  return (
    <li className={`q-finding q-finding-${severity}${ack !== null ? ' q-finding-acked' : ''}`}>
      <span className={`q-finding-mark q-finding-mark-${severity}`} aria-hidden="true" />
      <span className="q-finding-text">
        <span className="q-finding-severity">{severity === 'blocking' ? 'Must fix' : 'Warning'}</span>
        {finding.message}
      </span>
      {severity === 'warning' &&
        (ack === null ? (
          <button type="button" className="btn btn-sm btn-secondary" onClick={onAcknowledge}>
            Acknowledge
          </button>
        ) : (
          <span className="q-ack">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M20 6 9 17l-5-5" />
            </svg>
            Acknowledged by {ack.by}, {ack.at}
          </span>
        ))}
    </li>
  );
}

/**
 * In-place editing. Deliberate rather than casual: it is a form with save and
 * cancel, not a cell that changes on blur, because every save is an audit
 * event a donor's auditor can read.
 */
function RowEditor({ typed, onCancel, onSave }: { typed: TypedRow; onCancel: () => void; onSave: (next: TypedRow) => void }) {
  const [name, setName] = useState(typed.name);
  const [phone, setPhone] = useState(typed.phone);
  const [amount, setAmount] = useState(typed.amount);
  const id = `edit-${typed.n}`;

  return (
    <form
      className="q-editor"
      onSubmit={(event) => {
        event.preventDefault();
        onSave({ ...typed, name: name.trim(), phone: phone.trim(), amount: amount.trim() });
      }}
    >
      <span className="mono muted q-editor-n">{typed.n}</span>
      <span className="mono q-editor-ref">{typed.ref}</span>
      <label className="q-editor-field">
        <span className="label">Name as instructed</span>
        <input id={`${id}-name`} className="field" value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="q-editor-field">
        <span className="label">Phone, as typed</span>
        <input id={`${id}-phone`} className="field mono" value={phone} autoComplete="off" onChange={(e) => setPhone(e.target.value)} />
      </label>
      <label className="q-editor-field q-editor-amount">
        <span className="label">Amount, KES</span>
        <input id={`${id}-amount`} className="field mono right" value={amount} inputMode="numeric" onChange={(e) => setAmount(e.target.value)} />
      </label>
      <span className="q-editor-actions">
        <button type="submit" className="btn btn-sm btn-primary">
          Save row
        </button>
        <button type="button" className="btn btn-sm btn-secondary" onClick={onCancel}>
          Cancel
        </button>
      </span>
      <span className="hint q-editor-hint">
        Saving re-runs every check on this row and records the change against your name. The phone
        number is shown in full only while you edit it.
      </span>
    </form>
  );
}

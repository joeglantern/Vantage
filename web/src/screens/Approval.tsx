/**
 * Approval. A different person than the preparer, arriving cold, who has to
 * understand in under a minute what they are authorising and is personally
 * accountable if it is wrong.
 *
 * Order on the page follows 01-structure: reference and programme, the total
 * in full and large, the count, who prepared it and when, which warnings were
 * acknowledged and by whom, the limits in force. Then the step-up challenge,
 * every time, regardless of how fresh the session is.
 *
 * The two blocked states offer no button at all. The database refuses an
 * approver who is the preparer (docs/05), and the interface should not let
 * somebody press a control and then fail.
 */
import { useEffect, useRef, useState } from 'react';
import { formatMoney } from '@domain/money';
import { maskMsisdn } from '@domain/msisdn';
import { Card, Money, PageHeading, Phone, StatusPill } from '@web/components/primitives';
import { Dialog } from '@web/components/Dialog';
import { batchTreatment, severityTreatment } from '@web/lib/status';
import { CHANNEL, LIMITS, MEMBERS } from '@web/data/fixtures';
import { ACKNOWLEDGEMENTS, CORRECTED_ROWS, EDITS, REVIEW_BATCH, validateTyped } from '@web/data/review';
import './approval.css';

export type ApprovalVariant =
  | 'ready'
  | 'challenge'
  | 'failed'
  | 'approving'
  | 'approved'
  | 'preparer'
  | 'norole';

export const APPROVER_USER = { name: REVIEW_BATCH.approver.name, role: REVIEW_BATCH.approver.role } as const;
export const VIEWER_USER = { name: 'Hanover Foundation audit', role: 'Viewer' } as const;

const APPROVERS = MEMBERS.filter((m) => m.role === 'Approver').map((m) => m.name);

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function Approval({ variant }: { variant: ApprovalVariant }) {
  const outcome = validateTyped(CORRECTED_ROWS);
  const rows = CORRECTED_ROWS;
  const total = outcome.totalMinor.toString();
  const largest = rows.reduce((max, r) => {
    const amount = outcome.rows.find((v) => v.row === r.n)?.amount.amountMinor ?? 0n;
    return amount > max ? amount : max;
  }, 0n);
  const warnings = outcome.findings.filter((f) => f.severity === 'warning');

  const [challengeOpen, setChallengeOpen] = useState(variant === 'challenge' || variant === 'failed');
  const [code, setCode] = useState('');
  const [failed, setFailed] = useState(variant === 'failed');
  const [phase, setPhase] = useState<'ready' | 'approving' | 'approved'>(
    variant === 'approving' ? 'approving' : variant === 'approved' ? 'approved' : 'ready',
  );
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!challengeOpen) return;
    // The dialog lands focus on cancel by default, which is right for a
    // destructive confirmation. Here the person has to type a code, so the
    // field takes focus once the dialog is open.
    const timer = window.setTimeout(() => codeRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [challengeOpen]);

  const submitCode = () => {
    if (!/^\d{6}$/.test(code)) {
      setFailed(true);
      setCode('');
      window.setTimeout(() => codeRef.current?.focus(), 0);
      return;
    }
    setChallengeOpen(false);
    setPhase('approving');
    window.setTimeout(() => setPhase('approved'), 1800);
  };

  const blocked = variant === 'preparer' || variant === 'norole';
  const status = phase === 'approved' ? 'approved' : 'pending_approval';

  return (
    <>
      <PageHeading
        title={`Approve ${REVIEW_BATCH.reference}`}
        subtitle={`${REVIEW_BATCH.programme} · submitted ${REVIEW_BATCH.submittedAt} by ${REVIEW_BATCH.preparedBy}`}
        action={<StatusPill treatment={batchTreatment(status)} />}
      />

      {phase === 'approving' && (
        <Card className="ap-progress" role="status" aria-busy="true">
          <h2>Approving. Do not close this page.</h2>
          <p className="text2">
            In one transaction: the list is frozen, obligations are written to the ledger, and each of
            the {rows.length} payments is given the request identity it will keep for ever. Only after
            that commits are the payments queued.
          </p>
          <div className="progress" role="progressbar" aria-label="Approving batch">
            <div className="progress-bar" style={{ width: '60%' }} />
          </div>
        </Card>
      )}

      {phase === 'approved' && (
        <Card className="ap-approved" role="status">
          <h2>
            Approved by {APPROVER_USER.name}. {plural(rows.length, 'payment', 'payments')} queued,{' '}
            <Money amountMinor={total} />.
          </h2>
          <p className="text2 pretty">
            The list is frozen and the pack will be generated against it. Disbursement starts now, one
            payment at a time, and the batch page shows each one as it is confirmed. Nothing can be
            unsent from here.
          </p>
        </Card>
      )}

      <div className="ap-grid">
        <div className="ap-main">
          <Card className="ap-total">
            <div className="ap-total-label">Total to pay</div>
            <div className="ap-total-figure">
              <Money amountMinor={total} />
            </div>
            <div className="ap-total-count">
              to {plural(rows.length, 'person', 'people')}, one payment each, over M-Pesa from shortcode{' '}
              <span className="mono">{CHANNEL.shortcode}</span>
            </div>
            <dl className="ap-facts">
              <dt className="text2">Prepared by</dt>
              <dd>
                {REVIEW_BATCH.preparedBy}, from {REVIEW_BATCH.fileName} uploaded {REVIEW_BATCH.uploadedAt}
              </dd>
              <dt className="text2">Submitted</dt>
              <dd>{REVIEW_BATCH.submittedAt}</dd>
              <dt className="text2">Corrections</dt>
              <dd>
                {plural(EDITS.length, 'row', 'rows')} corrected or removed before submission. Each is in the audit trail.
              </dd>
              <dt className="text2">Largest payment</dt>
              <dd>
                <Money amountMinor={largest.toString()} />, against a per-payment limit of{' '}
                <Money amountMinor={LIMITS.perItemMinor} />
              </dd>
              <dt className="text2">Batch limit</dt>
              <dd>
                <Money amountMinor={LIMITS.perBatchMinor} />. This batch uses{' '}
                {((outcome.totalMinor * 1000n) / BigInt(LIMITS.perBatchMinor) / 10n).toString()}% of it.
              </dd>
            </dl>
          </Card>

          <Card className="table-card">
            <div className="ap-section-head">
              <h2>Warnings acknowledged by the preparer</h2>
              <span className="text2">
                {plural(warnings.length, 'warning', 'warnings')} on {plural(new Set(warnings.map((w) => w.row)).size, 'row', 'rows')}. Nothing is blocking, or the batch could not be here.
              </span>
            </div>
            {warnings.map((w) => {
              const ack = ACKNOWLEDGEMENTS.find((a) => a.row === w.row);
              const row = rows.find((r) => r.n === w.row);
              return (
                <div key={`${w.row}:${w.code}`} className="row ap-warning-row">
                  <span>
                    <StatusPill treatment={severityTreatment(w.severity)} />
                  </span>
                  <span>
                    <span className="ap-warning-who">
                      Row {w.row}, {row?.name}
                    </span>
                    <span className="text2">: {w.message}</span>
                  </span>
                  <span className="text2 small">{ack === undefined ? 'Not acknowledged' : `${ack.by}, ${ack.at}`}</span>
                </div>
              );
            })}
          </Card>

          <Card className="table-card">
            <div className="ap-section-head">
              <h2>Corrections made during review</h2>
              <span className="text2">What changed between the uploaded file and this list.</span>
            </div>
            {EDITS.map((e) => (
              <div key={`${e.row}:${e.what}`} className="row ap-edit-row">
                <span className="mono muted">Row {e.row}</span>
                <span>{e.what}</span>
                <span className="text2 small">
                  {e.by}, {e.at}
                </span>
              </div>
            ))}
          </Card>

          <Card className="table-card">
            <div className="ap-section-head">
              <h2>The {plural(rows.length, 'payment', 'payments')}</h2>
              <span className="text2">Frozen on approval. Names as instructed; the registered name arrives with each receipt.</span>
            </div>
            <div className="row row-head ap-item-row">
              <span>Row</span>
              <span>Reference</span>
              <span>Name as instructed</span>
              <span>Phone</span>
              <span className="right">Amount</span>
            </div>
            {rows.map((r) => {
              const msisdn = outcome.rows.find((v) => v.row === r.n)?.msisdn ?? null;
              const amount = outcome.rows.find((v) => v.row === r.n)?.amount.amountMinor ?? 0n;
              return (
                <div key={r.n} className="row ap-item-row">
                  <span className="mono muted">{r.n}</span>
                  <span className="mono">{r.ref}</span>
                  <span>{r.name}</span>
                  <span>{msisdn === null ? <span className="mono">{maskMsisdn(r.phone)}</span> : <Phone msisdn={msisdn} />}</span>
                  <span className="right">
                    <Money amountMinor={amount.toString()} />
                  </span>
                </div>
              );
            })}
            <div className="row ap-item-row ap-item-total">
              <span />
              <span />
              <span>Total</span>
              <span />
              <span className="right">
                <Money amountMinor={total} />
              </span>
            </div>
          </Card>
        </div>

        <aside className="ap-aside">
          {variant === 'preparer' && (
            <Card className="ap-blocked">
              <h2>You cannot approve this batch</h2>
              <p className="text2 pretty">
                You prepared it. The person who prepares a payout cannot also authorise it, so that no
                single account, and no single stolen password, can move money alone. The database
                refuses the record even if a button were offered here.
              </p>
              <p className="text2 pretty">
                Ask {APPROVERS.join(' or ')} to approve it. They will see this page with the approve
                action in place of this note.
              </p>
            </Card>
          )}

          {variant === 'norole' && (
            <Card className="ap-blocked">
              <h2>Your role cannot approve payouts</h2>
              <p className="text2 pretty">
                You are signed in as a viewer. Viewers can read batches and packs. Only members
                holding the approver role, with two-factor authentication turned on, can authorise a
                payout.
              </p>
              <p className="text2 pretty">Approvers for this organisation: {APPROVERS.join(', ')}.</p>
            </Card>
          )}

          {!blocked && phase === 'ready' && (
            <Card className="ap-action">
              <h2>Authorise this payout</h2>
              <p className="text2 pretty">
                You are {APPROVER_USER.name}. Approving pays <Money amountMinor={total} /> to{' '}
                {plural(rows.length, 'person', 'people')} and cannot be undone: M-Pesa has no recall.
              </p>
              <p className="text2 pretty">
                You will be asked for the six-digit code from your authenticator, every time,
                however recently you signed in.
              </p>
              <button type="button" className="btn btn-primary ap-approve" onClick={() => setChallengeOpen(true)}>
                Approve and pay <Money amountMinor={total} />
              </button>
              <button type="button" className="btn btn-secondary ap-sendback">
                Send back to {REVIEW_BATCH.preparedBy}
              </button>
              <p className="hint">Sending back reopens the review with a note from you. Nothing is paid.</p>
            </Card>
          )}

          {!blocked && phase !== 'ready' && (
            <Card className="ap-action">
              <h2>{phase === 'approving' ? 'Approval in progress' : 'Approved'}</h2>
              <p className="text2 pretty">
                {phase === 'approving'
                  ? 'The step-up code was accepted. The transaction is committing.'
                  : `Recorded against ${APPROVER_USER.name} in the audit trail, with the code check.`}
              </p>
            </Card>
          )}

          <Card className="ap-controls">
            <h2>Controls in force</h2>
            <dl className="ap-facts">
              <dt className="text2">Maker-checker</dt>
              <dd>Prepared by {REVIEW_BATCH.preparedBy}. Approver must differ; the database enforces it.</dd>
              <dt className="text2">Step-up</dt>
              <dd>TOTP at the moment of approval, regardless of session age.</dd>
              <dt className="text2">Per payment</dt>
              <dd>
                <Money amountMinor={LIMITS.perItemMinor} />
              </dd>
              <dt className="text2">Per batch</dt>
              <dd>
                <Money amountMinor={LIMITS.perBatchMinor} />
              </dd>
              <dt className="text2">Deviation warning</dt>
              <dd>More than {LIMITS.deviationBps / 100}% from a person&rsquo;s usual amount</dd>
            </dl>
          </Card>
        </aside>
      </div>

      <Dialog
        open={challengeOpen}
        title={`Confirm your identity to pay ${plural(rows.length, 'person', 'people')}`}
        confirmLabel={`Approve and pay ${formatMoney({ amountMinor: outcome.totalMinor, currency: 'KES' })}`}
        onCancel={() => {
          setChallengeOpen(false);
          setFailed(false);
          setCode('');
        }}
        onConfirm={submitCode}
        footnote="Escape cancels and nothing is paid. Three wrong codes lock approval of this batch for an hour."
      >
        <span>
          <Money amountMinor={total} /> to {plural(rows.length, 'person', 'people')} for {REVIEW_BATCH.programme}.
          This cannot be undone.
        </span>
        <label className="label ap-code-label" htmlFor="ap-code">
          Six-digit code from your authenticator
        </label>
        <input
          ref={codeRef}
          id="ap-code"
          className={`field mono ap-code${failed ? ' ap-code-failed' : ''}`}
          value={code}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          aria-invalid={failed}
          aria-describedby={failed ? 'ap-code-error' : undefined}
          onChange={(event) => {
            setCode(event.target.value.replace(/\D/g, ''));
            if (failed) setFailed(false);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              submitCode();
            }
          }}
        />
        {failed && (
          <span id="ap-code-error" className="ap-code-error" role="alert">
            The code was not accepted. Codes change every 30 seconds, so enter the one showing now.
            Two attempts remain.
          </span>
        )}
      </Dialog>
    </>
  );
}

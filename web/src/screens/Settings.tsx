import { useState } from 'react';
import { Card, Money, PageHeading, StatusPill } from '@web/components/primitives';
import { Dialog } from '@web/components/Dialog';
import { CHANNEL, LIMITS, MEMBERS } from '@web/data/fixtures';
import './settings.css';

export type SettingsVariant = 'default' | 'replace';

export function Settings({ variant }: { variant: SettingsVariant }) {
  const [replaceOpen, setReplaceOpen] = useState(variant === 'replace');

  return (
    <>
      <PageHeading
        title="Settings"
        subtitle="Payout channel, limits and members. Changes are recorded in the audit trail."
      />

      <div className="settings-grid">
        <Card className="settings-card">
          <h2>Payout channel</h2>
          <p className="hint settings-note">
            Vantage never holds money. Payments leave from this shortcode using credentials only your
            organisation controls.
          </p>
          <dl className="spec">
            <dt className="text2">M-Pesa shortcode</dt>
            <dd className="mono">{CHANNEL.shortcode}</dd>
            <dt className="text2">Initiator name</dt>
            <dd className="mono">{CHANNEL.initiatorName}</dd>
            <dt className="text2">Security credential</dt>
            <dd className="muted">
              Write-only. Set {CHANNEL.credentialSetOn} by {CHANNEL.credentialSetBy}. Cannot be read
              back.
            </dd>
            <dt className="text2">Verification</dt>
            <dd className="verify">
              <StatusPill treatment={{ tone: 'ok', label: 'Verified' }} />
              <span className="text2">
                <Money amountMinor="100" /> test payment, receipt{' '}
                <span className="mono">{CHANNEL.verifiedReceipt}</span>, {CHANNEL.verifiedOn}
              </span>
            </dd>
            <dt className="text2">Callback URL</dt>
            <dd className="mono break">{CHANNEL.callbackUrl}</dd>
          </dl>
          <div className="settings-actions">
            <button type="button" className="btn btn-sm btn-secondary" onClick={() => setReplaceOpen(true)}>
              Replace credentials
            </button>
            <button type="button" className="btn btn-sm btn-secondary">
              Run verification again
            </button>
          </div>
          <p className="text2 pretty settings-explain">
            If you revoke the initiator in the M-Pesa portal, Vantage immediately loses the ability to
            move your money. That is by design.
          </p>
        </Card>

        <Card className="settings-card">
          <h2>Limits</h2>
          <p className="hint settings-note">
            Set by an admin. The person who prepares a batch cannot change them.
          </p>
          <div className="limits">
            <div>
              <label className="label" htmlFor="per-item">
                Per payment
              </label>
              <input id="per-item" className="field mono limit-input" defaultValue="KES 20,000.00" />
              <div className="hint limit-hint">
                Blocks any single payment above this. Catches 50000 typed for 5000: a{' '}
                <Money amountMinor="5000000" /> row cannot be approved.
              </div>
            </div>
            <div>
              <label className="label" htmlFor="per-batch">
                Per batch
              </label>
              <input id="per-batch" className="field mono limit-input" defaultValue="KES 500,000.00" />
              <div className="hint limit-hint">
                Blocks a batch whose total is above this. Your largest cycle so far was{' '}
                <Money amountMinor={LIMITS.largestCycleMinor} />.
              </div>
            </div>
            <div>
              <label className="label" htmlFor="deviation">
                Deviation warning
              </label>
              <input id="deviation" className="field mono limit-input" defaultValue="50%" />
              <div className="hint limit-hint">
                Warns, does not block, when a payment is more than {LIMITS.deviationBps / 100}% away
                from what that person usually receives. <Money amountMinor="450000" /> to someone who
                usually gets <Money amountMinor="150000" /> is flagged for a human.
              </div>
            </div>
          </div>
          <button type="button" className="btn btn-sm btn-primary settings-save">
            Save limits
          </button>
        </Card>

        <Card className="settings-card">
          <h2>Members</h2>
          <p className="hint settings-note pretty">
            Admins manage access and cannot prepare or approve a payout. Whoever controls who gets in
            should not also be able to move money.
          </p>
          <div className="members">
            {MEMBERS.map((m) => (
              <div key={m.name} className="member">
                <span>{m.name}</span>
                <span className="text2">{m.role}</span>
                <span className="muted small">{m.mfa}</span>
              </div>
            ))}
          </div>
          <button type="button" className="btn btn-sm btn-secondary settings-save">
            Invite a member
          </button>
        </Card>
      </div>

      <Dialog
        open={replaceOpen}
        title="Replace the M-Pesa security credential"
        confirmLabel="Replace credential and unverify channel"
        requireTyped="replace"
        onCancel={() => setReplaceOpen(false)}
        onConfirm={() => setReplaceOpen(false)}
        footnote="Escape cancels. Nothing is saved until the word matches."
      >
        <span>
          The current credential is discarded the moment you save. It cannot be read back or restored.
        </span>
        <span>
          No batch is disbursing right now, so nothing in flight is affected. The channel becomes
          unverified and a <Money amountMinor="100" /> test payment must succeed before the next real
          batch.
        </span>
      </Dialog>
    </>
  );
}

import { useState } from 'react';
import { Card, Money, PageHeading, Phone, StatusPill } from '@web/components/primitives';
import { Dialog } from '@web/components/Dialog';
import { itemTreatment } from '@web/lib/status';
import { PEOPLE, PERSON_DETAIL } from '@web/data/fixtures';
import './recipients.css';

export type RecipientsVariant = 'list' | 'detail' | 'erase';

export function Recipients({ variant }: { variant: RecipientsVariant }) {
  const [eraseOpen, setEraseOpen] = useState(variant === 'erase');
  const { person, packsNaming, pseudonym } = PERSON_DETAIL;

  if (variant === 'list') {
    return (
      <>
        <PageHeading
          title="Recipients"
          subtitle="247 people across 3 programmes"
          action={
            <button type="button" className="btn btn-primary">
              Add a recipient
            </button>
          }
        />
        <div className="search">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            className="search-input"
            placeholder="Name, reference or last three digits"
            aria-label="Search recipients"
          />
        </div>
        <Card className="table-card">
          <div className="row row-head people-row">
            <span>Name</span>
            <span>Phone</span>
            <span>Reference</span>
            <span>Programmes</span>
            <span>Added</span>
            <span className="right">Payments</span>
            <span className="right">Total received</span>
          </div>
          {PEOPLE.map((p) => (
            <div key={p.ref} className="row people-row">
              <a href="#/recipients/detail">{p.name}</a>
              <Phone msisdn={p.msisdn} />
              <span className="mono">{p.ref}</span>
              <span className="text2">{p.programme}</span>
              <span className="mono muted small">{p.added}</span>
              <span className="right mono">{p.payments}</span>
              <span className="right">
                <Money amountMinor={p.totalMinor} />
              </span>
            </div>
          ))}
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeading title={person.name} subtitle={`${person.ref} · ${person.payments} payments`} />

      <div className="detail-grid">
        <div className="detail-main">
          <Card className="detail-facts">
            <dl>
              <dt className="text2">Name</dt>
              <dd>
                {person.name} <button type="button" className="linklike">Correct</button>
              </dd>
              <dt className="text2">Phone</dt>
              <dd>
                <Phone msisdn={person.msisdn} /> <button type="button" className="linklike">Correct</button>
              </dd>
              <dt className="text2">Reference</dt>
              <dd className="mono">{person.ref}</dd>
              <dt className="text2">National ID</dt>
              <dd className="muted">Not collected</dd>
              <dt className="text2">Added</dt>
              <dd>
                {PERSON_DETAIL.addedOn}, from {PERSON_DETAIL.addedFrom}
              </dd>
              <dt className="text2">Registered name seen</dt>
              <dd className="name-mismatch">
                <span className="pill-diamond" />
                {PERSON_DETAIL.registeredNameSeen}, on {PERSON_DETAIL.registeredNameSeenAt}. Differs
                from the stored name.
              </dd>
            </dl>
          </Card>

          <Card className="table-card">
            <div className="detail-payments-head">
              {person.payments} payments, <Money amountMinor={person.totalMinor} />
            </div>
            <div className="row row-head payment-row">
              <span>Batch</span>
              <span>Programme</span>
              <span className="right">Amount</span>
              <span>Status</span>
              <span>Receipt</span>
            </div>
            {PERSON_DETAIL.payments.map((p) => (
              <div key={p.batch} className="row payment-row">
                <span className="mono">{p.batch}</span>
                <span>{p.programme}</span>
                <span className="right">
                  <Money amountMinor={p.amountMinor} />
                </span>
                <span>
                  <StatusPill treatment={itemTreatment(p.status)} />
                </span>
                <span className="mono">{p.receipt}</span>
              </div>
            ))}
          </Card>
        </div>

        <aside className="card rights-panel">
          <h2>Data subject rights</h2>
          <p className="hint rights-note">
            Kenya Data Protection Act 2019. Each action is recorded in the audit trail.
          </p>
          <div className="rights-actions">
            <button type="button" className="btn btn-sm btn-secondary">
              Export everything held about this person
            </button>
            <button type="button" className="btn btn-sm btn-secondary">
              Correct name or number
            </button>
            <button type="button" className="btn btn-sm btn-danger" onClick={() => setEraseOpen(true)}>
              Erase this person
            </button>
          </div>
          <p className="text2 pretty rights-explain">
            Erasure destroys the key protecting this person&rsquo;s data, cannot be undone, and
            re-renders {packsNaming.length} packs so they appear pseudonymously. The financial record
            survives; the identifiers do not.
          </p>
        </aside>
      </div>

      <Dialog
        open={eraseOpen}
        title={`Erase ${person.name} from Tumaini Youth Trust`}
        confirmLabel={`Erase ${person.name} and re-render ${packsNaming.length} packs`}
        requireTyped="erase"
        destructive
        onCancel={() => setEraseOpen(false)}
        onConfirm={() => setEraseOpen(false)}
        footnote="Escape cancels. The erase button enables when the word matches; it is never the default focus."
      >
        <span>
          This destroys the encryption key that protects {person.name}&rsquo;s name, phone number and
          gateway messages. Without the key the data cannot be read by anyone, including Vantage.
        </span>
        <span>It cannot be undone. There is no recovery period.</span>
        <span>
          {packsNaming.length} packs name this person: {packsNaming.join(', ')}. Each will be
          re-rendered as a new version in which the person appears as{' '}
          <span className="mono">{pseudonym}</span>. The superseded versions are destroyed. Amounts,
          receipts and totals do not change.
        </span>
        <span>
          The {person.payments} payments totalling <Money amountMinor={person.totalMinor} /> remain in
          the financial record, without identifiers.
        </span>
      </Dialog>
    </>
  );
}

/**
 * The standing operational view, from ReconBoard.
 *
 * It answers one question: is anything wrong right now. The empty state is the
 * primary state, because an empty reconciliation view means the system is
 * healthy and it should read as reassurance rather than as "no data".
 *
 * Section one is payments in `unknown`, which is the queue that must stay
 * empty. It carries the dashed treatment, because an unresolved payment is an
 * open question and not an outcome.
 */
import { Card, Money, PageHeading, Phone } from '@web/components/primitives';
import './reconciliation.css';

export type ReconciliationVariant = 'clear' | 'open';

interface UnknownItem {
  readonly batch: string;
  readonly ref: string;
  readonly name: string;
  readonly msisdn: string;
  readonly amountMinor: string;
  readonly openFor: string;
  readonly probes: string;
  readonly conversationId: string;
  readonly raised: boolean;
}

const UNKNOWNS: readonly UnknownItem[] = [
  {
    batch: 'CHP-2026-03',
    ref: 'CHP-044',
    name: 'Joyce Wanjala',
    msisdn: '254722334318',
    amountMinor: '200000',
    openFor: '1 d 3 h',
    probes: '5 of 5 indeterminate. Raised as an exception',
    conversationId: 'AG_20260305_2010f7a8b9c0d1e2f3a4',
    raised: true,
  },
  {
    batch: 'YCIC-2026-03',
    ref: 'YCIC-005',
    name: 'Faith Njeri',
    msisdn: '254745678901',
    amountMinor: '150000',
    openFor: '39 min',
    probes: '3 indeterminate, next probe 15:44',
    conversationId: 'AG_20260305_2010a1b2c3d4e5f6a7b8',
    raised: false,
  },
];

interface Group {
  readonly title: string;
  readonly sub: string;
  readonly rows: readonly { batch: string; ref: string; a: string; b: string; action: string }[];
}

const GROUPS: readonly Group[] = [
  {
    title: '2. Sent, no callback past the service level',
    sub: 'callback expected within 2 minutes',
    rows: [
      {
        batch: 'YCIC-2026-03',
        ref: 'YCIC-014',
        a: 'Rose Atieno, KES 1,500.00',
        b: 'Accepted 14:26:02, no callback in 36 min. The next sweep moves it to unknown and probes.',
        action: 'Open payment',
      },
    ],
  },
  {
    title: '3. Batches stuck in disbursing',
    sub: 'open more than 6 hours',
    rows: [
      {
        batch: 'CHP-2026-03',
        ref: '',
        a: 'CHP March 2026, 212 payments, KES 424,000.00',
        b: '211 confirmed, 1 unknown for 1 d 3 h. Cannot close until CHP-044 resolves.',
        action: 'Open batch',
      },
    ],
  },
  {
    title: '4. Registered name differs from instructed name',
    sub: 'last 90 days, confirmed payments',
    rows: [
      { batch: 'YCIC-2026-03', ref: 'YCIC-010', a: 'Instructed: Kevin Otieno', b: 'Registered: JANE AKINYI OTIENO', action: 'Review' },
      { batch: 'CHP-2026-02', ref: 'CHP-117', a: 'Instructed: Moses Barasa', b: 'Registered: ESTHER NAFULA', action: 'Review' },
    ],
  },
  {
    title: '5. Recipients appearing across unrelated programmes',
    sub: 'same number, more than one programme',
    rows: [],
  },
];

const CLEAR_COUNTS = [
  ['unknown', 0],
  ['sent, no callback', 0],
  ['batches stuck', 0],
  ['name mismatches', 0],
  ['cross-programme recipients', 0],
] as const;

export function Reconciliation({ variant }: { variant: ReconciliationVariant }) {
  const clear = variant === 'clear';
  const openCount = UNKNOWNS.length + GROUPS.reduce((n, g) => n + g.rows.length, 0);

  return (
    <>
      <PageHeading
        title="Reconciliation"
        subtitle={
          clear
            ? 'Is anything wrong right now. Nothing is, as of the last sweep at 08:58.'
            : `Is anything wrong right now. ${openCount} things need a person, oldest first.`
        }
      />

      {clear ? (
        <>
          <Card className="recon-clear">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--okT)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="9" />
              <path d="m8 12 3 3 5-6" />
            </svg>
            <div>
              <h2>Nothing is unresolved</h2>
              <p className="text2 pretty">
                Every payment in every batch has a known outcome, every callback arrived within the
                service level, no batch is stuck, and no registered name disagrees with an
                instructed name in the last 90 days. This is the state the page is supposed to be
                in.
              </p>
              <div className="recon-counts">
                {CLEAR_COUNTS.map(([label, count]) => (
                  <span key={label}>
                    <span className="recon-count mono">{count}</span>{' '}
                    <span className="text2">{label}</span>
                  </span>
                ))}
              </div>
            </div>
          </Card>

          <Card className="recon-resolved">
            <h2>Recently resolved</h2>
            <div className="recon-resolved-grid">
              <span className="mono muted small">2026-03-04 09:12</span>
              <span className="mono">YCIC-2026-02</span>
              <span>1 unknown payment confirmed by status query after 1 h 6 min</span>
              <span className="text2">Resolved by the system</span>
              <span className="mono muted small">2026-02-26 16:40</span>
              <span className="mono">CHP-2026-02</span>
              <span>Name mismatch on 2 payments reviewed, records updated</span>
              <span className="text2">Wanjiku Ndegwa</span>
            </div>
          </Card>
        </>
      ) : (
        <>
          <section className="card recon-unresolved">
            <div className="recon-head">
              <h2>
                1. Payments in unknown, oldest first{' '}
                <span className="muted recon-head-sub">the queue that must stay empty</span>
              </h2>
              <span className="mono">{UNKNOWNS.length}</span>
            </div>
            <div className="row row-head unknown-row">
              <span>Batch</span>
              <span>Reference</span>
              <span>Recipient</span>
              <span className="right">Amount</span>
              <span>Open for</span>
              <span>Probes</span>
              <span>Conversation ID</span>
              <span />
            </div>
            {UNKNOWNS.map((u) => (
              <div key={u.ref} className="row unknown-row">
                <span className="mono">{u.batch}</span>
                <span className="mono">{u.ref}</span>
                <span>
                  {u.name} <Phone msisdn={u.msisdn} />
                </span>
                <span className="right">
                  <Money amountMinor={u.amountMinor} />
                </span>
                <span className={u.raised ? 'recon-overdue' : ''}>{u.openFor}</span>
                <span className="text2 small">{u.probes}</span>
                <span className="mono small break">{u.conversationId}</span>
                <span className="right">
                  <button type="button" className="btn btn-xs btn-secondary">
                    Open payment
                  </button>
                </span>
              </div>
            ))}
            <div className="recon-foot text2">
              The one open more than 24 hours has been raised as an exception. Phone Safaricom with
              the conversation ID, then record their answer on the payment page.
            </div>
          </section>

          {GROUPS.map((g) => (
            <Card key={g.title} className="table-card">
              <div className="recon-head">
                <h2>
                  {g.title} <span className="muted recon-head-sub">{g.sub}</span>
                </h2>
                <span className="mono">{g.rows.length}</span>
              </div>
              {g.rows.length === 0 ? (
                <div className="recon-none text2">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--okT)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                  None
                </div>
              ) : (
                g.rows.map((r) => (
                  <div key={r.batch + r.ref} className="row group-row">
                    <span className="mono">{r.batch}</span>
                    <span className="mono">{r.ref}</span>
                    <span>{r.a}</span>
                    <span className="text2">{r.b}</span>
                    <span className="right">
                      <button type="button" className="btn btn-xs btn-secondary">
                        {r.action}
                      </button>
                    </span>
                  </div>
                ))
              )}
            </Card>
          ))}
        </>
      )}
    </>
  );
}

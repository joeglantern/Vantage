/**
 * Generated audit packs.
 *
 * The pack is the product. This screen lists what has been generated and shows
 * one on screen, from the same content that renders to PDF, so the two cannot
 * drift.
 *
 * Two things carry the weight. The summary must show unresolved as zero,
 * because a pack cannot exist otherwise, and that zero is the guarantee the
 * whole document rests on. And the verification block has to be usable by a
 * person, with the instructions next to it, rather than a wall of hex.
 */
import { Card, Money, PageHeading, Phone, StatusPill } from '@web/components/primitives';
import { itemTreatment } from '@web/lib/status';
import './packs.css';

export type PacksVariant = 'list' | 'pack' | 'superseded';

interface PackRow {
  readonly batch: string;
  readonly programme: string;
  readonly version: number;
  readonly generatedAt: string;
  readonly generatedBy: string;
  readonly itemCount: number;
  readonly netMinor: string;
  readonly superseded: boolean;
}

const PACKS: readonly PackRow[] = [
  { batch: 'CHP-2026-02', programme: 'Community health promoters, February 2026', version: 1, generatedAt: '2026-02-26 17:02', generatedBy: 'Wanjiku Ndegwa', itemCount: 210, netMinor: '42000000', superseded: false },
  { batch: 'YCIC-2026-02', programme: 'YCIC February 2026 stipend', version: 2, generatedAt: '2026-02-14 11:31', generatedBy: 'Wanjiku Ndegwa', itemCount: 18, netMinor: '2700000', superseded: false },
  { batch: 'YCIC-2026-02', programme: 'YCIC February 2026 stipend', version: 1, generatedAt: '2026-02-05 12:04', generatedBy: 'Wanjiku Ndegwa', itemCount: 18, netMinor: '2700000', superseded: true },
  { batch: 'CHP-2026-01', programme: 'Community health promoters, January 2026', version: 1, generatedAt: '2026-01-28 10:40', generatedBy: 'Wanjiku Ndegwa', itemCount: 208, netMinor: '41400000', superseded: false },
  { batch: 'YCIC-2026-01', programme: 'YCIC January 2026 stipend', version: 1, generatedAt: '2026-01-12 16:11', generatedBy: 'Wanjiku Ndegwa', itemCount: 18, netMinor: '2700000', superseded: false },
];

const LINE_ITEMS = [
  { ref: 'YCIC-001', instructed: 'Amina Wanjiru', registered: 'AMINA WANJIRU', msisdn: '254712345678', amountMinor: '150000', receipt: 'TC5K7HY1YH', settled: '2026-03-05 14:44:12' },
  { ref: 'YCIC-002', instructed: 'Peter Kimani Mwangi', registered: 'PETER KIMANI MWANGI', msisdn: '254722345678', amountMinor: '150000', receipt: 'TC5K7HY2AB', settled: '2026-03-05 14:44:15' },
  { ref: 'YCIC-004', instructed: 'Brian Odhiambo', registered: 'BRIAN ODHIAMBO', msisdn: '254110123456', amountMinor: '150000', receipt: 'TC5K7HY3CD', settled: '2026-03-05 14:44:19' },
  { ref: 'YCIC-010', instructed: 'Kevin Otieno', registered: 'JANE AKINYI OTIENO', msisdn: '254723456680', amountMinor: '150000', receipt: 'TC5K7HY4EF', settled: '2026-03-05 14:44:24' },
] as const;

export function Packs({ variant }: { variant: PacksVariant }) {
  if (variant === 'list') {
    return (
      <>
        <PageHeading
          title="Packs"
          subtitle="Every pack generated, newest first. A pack is immutable; regenerating creates a new version."
        />
        <Card className="table-card">
          <div className="row row-head pack-row">
            <span>Batch</span>
            <span>Programme</span>
            <span className="right">Version</span>
            <span className="right">Payments</span>
            <span className="right">Net moved</span>
            <span>Generated</span>
            <span>By</span>
            <span />
          </div>
          {PACKS.map((p) => (
            <div key={p.batch + p.version} className={`row pack-row${p.superseded ? ' pack-superseded' : ''}`}>
              <span className="mono">{p.batch}</span>
              <span>{p.programme}</span>
              <span className="right mono">v{p.version}</span>
              <span className="right mono">{p.itemCount}</span>
              <span className="right">
                <Money amountMinor={p.netMinor} />
              </span>
              <span className="mono small muted">{p.generatedAt}</span>
              <span className="text2">{p.generatedBy}</span>
              <span className="right">
                {p.superseded ? (
                  <span className="hint">Superseded</span>
                ) : (
                  <button type="button" className="btn btn-xs btn-secondary">
                    Open
                  </button>
                )}
              </span>
            </div>
          ))}
        </Card>
        <p className="hint pretty">
          A superseded version is kept in this list but its file is destroyed. That happens when a
          recipient exercises their right to erasure and the pack is re-rendered with them
          pseudonymised. Amounts, receipts and totals never change between versions.
        </p>
      </>
    );
  }

  const superseded = variant === 'superseded';

  return (
    <>
      <PageHeading
        title="YCIC-2026-02 reconciliation pack"
        subtitle={superseded ? 'Version 1, superseded on 14 Feb 2026' : 'Version 2, generated 14 Feb 2026'}
        action={
          <div className="pack-actions">
            <button type="button" className="btn btn-sm btn-secondary" disabled={superseded}>
              Download PDF
            </button>
            <button type="button" className="btn btn-sm btn-secondary" disabled={superseded}>
              CSV
            </button>
            <button type="button" className="btn btn-sm btn-secondary" disabled={superseded}>
              JSON
            </button>
          </div>
        }
      />

      {superseded && (
        <Card className="pack-superseded-notice">
          <h2>This version has been superseded</h2>
          <p className="text2 pretty">
            Version 2 replaced it on 14 February 2026 after a recipient exercised their right to
            erasure. The file for this version was destroyed in the object store. The financial
            record is unchanged: the same 18 payments, the same KES 27,000.00, the same receipts.
          </p>
        </Card>
      )}

      <div className="pack-page">
        <section className="pack-section">
          <h2>Summary</h2>
          <div className="pack-summary">
            <span className="text2">Approved obligation</span>
            <span className="right"><Money amountMinor="2700000" /></span>
            <span className="right mono">18</span>

            <span className="text2">Successfully disbursed</span>
            <span className="right"><Money amountMinor="2700000" /></span>
            <span className="right mono">18</span>

            <span className="text2">Failed</span>
            <span className="right"><Money amountMinor="0" /></span>
            <span className="right mono">0</span>

            <span className="text2 pack-unresolved">Unresolved</span>
            <span className="right pack-unresolved"><Money amountMinor="0" /></span>
            <span className="right mono pack-unresolved">0</span>

            <span className="pack-net">Net moved</span>
            <span className="right pack-net"><Money amountMinor="2700000" /></span>
            <span className="right mono pack-net">18</span>
          </div>
          <p className="hint pretty pack-note">
            Unresolved is zero because a pack cannot be generated while any payment has an unknown
            outcome. That guarantee is what makes this summary worth reading.
          </p>
        </section>

        <section className="pack-section">
          <h2>Control attestation</h2>
          <dl className="pack-attest">
            <dt className="text2">Prepared by</dt>
            <dd>Wanjiku Ndegwa, 4 February 2026 at 16:12</dd>
            <dt className="text2">Approved by</dt>
            <dd>David Ochieng, 5 February 2026 at 11:20, with a second factor</dd>
            <dt className="text2">Separation of duties</dt>
            <dd>
              Preparer and approver are different people, enforced by a database constraint rather
              than by application code
            </dd>
            <dt className="text2">Per-payment limit in force</dt>
            <dd><Money amountMinor="2000000" /></dd>
            <dt className="text2">Per-batch limit in force</dt>
            <dd><Money amountMinor="50000000" /></dd>
            <dt className="text2">Warnings acknowledged</dt>
            <dd>3, by Wanjiku Ndegwa</dd>
          </dl>
        </section>

        <section className="pack-section">
          <h2>Line items</h2>
          <div className="row row-head line-row">
            <span>Reference</span>
            <span>Name as instructed</span>
            <span>Name as registered on M-Pesa</span>
            <span>Phone</span>
            <span className="right">Amount</span>
            <span>Status</span>
            <span>M-Pesa receipt</span>
            <span>Settled at</span>
          </div>
          {LINE_ITEMS.map((item) => {
            const mismatch = item.instructed.toUpperCase() !== item.registered.toUpperCase();
            return (
              <div key={item.ref} className="row line-row">
                <span className="mono">{item.ref}</span>
                <span>{item.instructed}</span>
                <span className={mismatch ? 'pack-mismatch' : ''}>
                  {mismatch && <span className="pill-diamond" />}
                  {item.registered}
                </span>
                <Phone msisdn={item.msisdn} />
                <span className="right"><Money amountMinor={item.amountMinor} /></span>
                <span><StatusPill treatment={itemTreatment('confirmed')} /></span>
                <span className="mono">{item.receipt}</span>
                <span className="mono small muted">{item.settled}</span>
              </div>
            );
          })}
          <p className="hint pretty pack-note">
            Showing 4 of 18. The two name columns sit side by side deliberately. A mismatch means
            M-Pesa says somebody else owns the line that was paid, and it is the check nobody does
            by hand.
          </p>
        </section>

        <section className="pack-section">
          <h2>Verification</h2>
          <p className="text2 pretty">
            Both values below can be recomputed from the live system by anyone with read access. If
            somebody edited history after this pack was generated, the recomputation will not match.
          </p>
          <dl className="pack-verify">
            <dt className="text2">Audit chain head</dt>
            <dd className="mono break">
              8f14e45fceea167a5a36dedd4bea2543a1e4b9c2d0f8a7b6c5d4e3f201928374
              <span className="hint pack-verify-how">
                The last event in this organisation&rsquo;s chain at generation, position 4,182.
                Recompute with <span className="mono">vantage audit verify YCIC-2026-02</span>.
              </span>
            </dd>
            <dt className="text2">Pack content hash</dt>
            <dd className="mono break">
              a3f5b8d1e9c07264fb3a1d5e8c9072641fb3a5d1e9c8072364fb1a3d5e9c80726
              <span className="hint pack-verify-how">
                SHA-256 of this pack&rsquo;s canonical JSON. Recompute with{' '}
                <span className="mono">sha256sum</span> over the JSON export.
              </span>
            </dd>
          </dl>
        </section>
      </div>
    </>
  );
}

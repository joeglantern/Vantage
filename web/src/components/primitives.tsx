/**
 * The small components every screen shares.
 *
 * Money and phone numbers go through the domain layer rather than being
 * formatted at the call site, so the two rules that must never vary are
 * enforced once: amounts are never rounded or abbreviated, and an MSISDN is
 * never rendered in full.
 */
import type { ReactNode } from 'react';
import { formatMoney, type Money as DomainMoney } from '@domain/money';
import { maskMsisdn } from '@domain/msisdn';
import type { Tone, Treatment } from '@web/lib/status';
import './primitives.css';

export function Money({ amountMinor, currency = 'KES' }: { amountMinor: string; currency?: 'KES' }) {
  const money: DomainMoney = { amountMinor: BigInt(amountMinor), currency };
  return <span className="mono">{formatMoney(money)}</span>;
}

export function Phone({ msisdn }: { msisdn: string }) {
  // Never the full number. docs/05: identifiable to the organisation, not to a
  // leaked screenshot.
  return <span className="mono">{maskMsisdn(msisdn)}</span>;
}

const TONE_MARK: Record<Tone, ReactNode> = {
  pending: <span className="pill-dot" />,
  progress: <span className="pill-dot" />,
  ok: (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  ),
  warn: <span className="pill-diamond" />,
  fail: (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  ),
  unresolved: (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
      <path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3" />
      <path d="M12 17h.01" />
    </svg>
  ),
};

/**
 * Colour is never the only carrier of meaning, so every pill has a mark and a
 * word as well as a hue.
 */
export function StatusPill({ treatment }: { treatment: Treatment }) {
  return (
    <span className={`pill pill-${treatment.tone}`}>
      {TONE_MARK[treatment.tone]}
      {treatment.label}
    </span>
  );
}

export function Card({ children, className = '', ...rest }: { children: ReactNode; className?: string } & React.HTMLAttributes<HTMLElement>) {
  return (
    <section className={`card ${className}`} {...rest}>
      {children}
    </section>
  );
}

export function PageHeading({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="page-heading">
      <div>
        <h1>{title}</h1>
        {subtitle !== undefined && <div className="page-heading-sub">{subtitle}</div>}
      </div>
      {action}
    </div>
  );
}

export function EmptyState({ mark, title, body, action }: { mark?: string; title: string; body: ReactNode; action?: ReactNode }) {
  return (
    <Card className="empty-state">
      {mark !== undefined && <img src={mark} alt="" width={56} height={56} />}
      <div>
        <h2>{title}</h2>
        <p className="text2 pretty">{body}</p>
        {action !== undefined && <div className="empty-state-action">{action}</div>}
      </div>
    </Card>
  );
}

export function Alert({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section role="alert" className="alert">
      {title !== undefined && <h2>{title}</h2>}
      <p className="text2 pretty">{children}</p>
    </section>
  );
}

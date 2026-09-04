# 02. Tech stack

Every choice below is recorded with what it beat and why. Where the reason is
"you already ship this well", that is a legitimate reason: familiarity is a real
engineering asset on a solo build, and unfamiliar tooling is how a one-person
product dies.

## Backend framework: Fastify + TypeScript

**Yes, Fastify.** You suggested it and it is the right call, for a better reason
than habit:

Fastify is schema-first. Every route declares a JSON Schema (via TypeBox) for
params, body and response, and Fastify validates and serialises against it. In a
system that moves money, that means **no unvalidated value can reach the domain
layer**, and the response schema acts as a PII allowlist: a field you did not
declare cannot leak, even if someone accidentally selects it from the database.

The encapsulation model also matters: plugins get their own scope, so the
disbursement module cannot accidentally reach the auth module's internals.

| Considered | Why not |
| --- | --- |
| NestJS | Heavy DI and decorator ceremony; you'd spend the first fortnight on framework, not domain |
| Express | No first-class validation or serialisation; you would rebuild what Fastify gives you, worse |
| Hono / Elysia | Genuinely good, but thinner ecosystem for the boring things: sessions, queues, PDF |
| Go | Better raw fit for a payment worker, but it is not your language and this is a solo build |

TypeScript in `strict` mode, `noUncheckedIndexedAccess` on. No `any` in
`domain/`.

## Database: PostgreSQL

Not negotiable for this domain. We need real transactions, `NUMERIC`/`BIGINT`
exactness, check constraints, partial unique indexes for idempotency, and
`SERIALIZABLE` isolation on the paths that matter.

MySQL would work but Postgres's constraint expressiveness and `jsonb` for raw
gateway payloads make it the better fit. MongoDB is disqualified: no
multi-document transactional guarantees we'd want to bet a payout on.

## ORM: Prisma, with raw SQL where it counts

Prisma for schema, migrations and ordinary queries. You already use it.

But: **the ledger and state transitions use explicit transactions with guarded
updates**, and where a transition must be atomic and conditional, raw SQL. A
state change is written as a conditional update that also asserts the current
state, so two concurrent workers cannot both advance the same item:

```sql
UPDATE payout_item
   SET status = 'sending', updated_at = now()
 WHERE id = $1 AND status = 'queued'
RETURNING id;
```

No row returned means someone else got there first, and the job exits. This is
cheaper and more reliable than an application-level lock.

Drizzle was considered (closer to SQL, lighter runtime) but Prisma's migration
tooling and your familiarity win on a solo build.

## Queue: BullMQ + Redis

You already run this. Gives retries with exponential backoff, per-queue
concurrency, rate limiting (essential for Daraja throughput limits) and delayed
jobs (essential for status probing).

**Critical constraint:** BullMQ guarantees *at-least-once*, not exactly-once. A
job may run twice. Every job must therefore be idempotent, and for disbursement
that is enforced by the state guard above plus a stable
`originator_conversation_id`. See [Payout lifecycle](04-payout-lifecycle.md).

## Frontend: React + Vite + TypeScript + TanStack Query

Your stack, and correct here. This is a data-dense internal tool: tables,
validation states, exception queues. TanStack Query handles the server-state
problem (staleness, refetch, optimistic updates) that this kind of UI is
almost entirely made of.

TanStack Table for the batch review grid. Plain CSS or Tailwind. Either is fine,
this is not a design-led product.

No SSR, no Next.js. It is an authenticated internal tool; there is nothing to
render for a crawler and SSR would add deployment complexity for zero gain.

## Authentication: self-hosted sessions, MFA mandatory for approvers

- Argon2id password hashing
- Opaque session tokens in `httpOnly`, `Secure`, `SameSite=Lax` cookies, stored
  server-side in Redis with an absolute and idle timeout
- **TOTP second factor required for any user with the approver role**: this is
  the control that stands between a phished password and a disbursement
- Step-up re-authentication at the moment of approval, regardless of session age

Auth0/Clerk rejected: they put your customers' identity data in another
jurisdiction, which reopens the cross-border transfer question we deliberately
closed. Keep it in-country.

## Money: never a float, never a JS `number` at the boundary

- Stored as `BIGINT` in **minor units** (cents), with a separate `currency` column
- Never `float`, never `double`, never `decimal` in JS
- Serialised to JSON as a **string**, because JSON numbers are IEEE-754 doubles
  and will silently corrupt values above 2^53
- M-Pesa B2C transacts whole shillings, so a check constraint enforces
  `amount_minor % 100 = 0`. It is unconditional in v1 because there is exactly one
  rail; it becomes conditional on `channel_kind` when a second one lands. See
  [Data model](03-data-model.md#payout_item)

## Payment rail: Safaricom Daraja B2C

The only rail in v1. Specifically:

- `B2C PaymentRequest` for disbursement
- `Transaction Status Query` for resolving unknowns
- Result and timeout callbacks for confirmation

The organisation's own shortcode, initiator credentials and security credential.
Vantage stores them encrypted and acts as an agent. See
[Security](05-security.md#credential-custody) and
[Compliance](06-compliance.md#why-we-never-touch-the-money).

PesaLink and bank transfers are deferred to Phase 3. Do not build an abstract
"payment provider" interface before there is a second provider. It will be the
wrong abstraction.

## Reconciliation packs: Playwright → PDF

Render an HTML template with headless Chromium in the worker.

The pack is also the on-screen view, so one template serves both and they cannot
drift. Alternatives (pdfkit, react-pdf) mean maintaining a second layout
implementation that will diverge from the web view within a month.

Every pack is emitted as **PDF (for the donor), CSV (for finance), and JSON (for
machines)**, all generated from the same frozen snapshot.

## Observability

- **pino**: Fastify's native logger, structured JSON, with a redaction list that
  includes MSISDNs (log last three digits only), names and national IDs
- **Correlation ID** on every request and job, propagated into audit events
- **Sentry** (or self-hosted GlitchTip, if error payloads must stay in-country)
- **Health endpoints**: liveness, readiness, and a queue-depth metric

## Testing

| Layer | Tool | What it proves |
| --- | --- | --- |
| Domain | Vitest | State machines reject illegal transitions; money maths is exact |
| Integration | Vitest + Testcontainers | Real Postgres: constraints, concurrency, transactions |
| Gateway | Recorded fixtures | Every Daraja response shape, including the ugly ones |
| Property | fast-check | **No interleaving of retries and callbacks produces two payments to one item** |
| E2E | Playwright | Import → approve → disburse → pack, against a stubbed Daraja |

The property test is the one that matters most. Write it before the feature.

## Infrastructure

- Docker Compose for local development; the same images in production
- Nairobi-hosted VPS or colocation (see [Compliance](06-compliance.md#data-residency))
- nginx for TLS termination, rate limiting and the callback IP allowlist
- Nightly encrypted `pg_dump` plus continuous WAL archiving for PITR
- **Restore drill every quarter, written down.** An untested backup is not a backup

## Summary

| Layer | Choice |
| --- | --- |
| API | Fastify + TypeScript (strict) + TypeBox |
| Database | PostgreSQL |
| ORM | Prisma + raw SQL for guarded transitions |
| Queue | BullMQ + Redis |
| Frontend | React + Vite + TanStack Query/Table |
| Auth | Self-hosted sessions, Argon2id, TOTP for approvers |
| Rail | Safaricom Daraja B2C |
| Documents | Playwright → PDF/CSV/JSON |
| Logging | pino + Sentry, MSISDN redaction |
| Hosting | Kenya |

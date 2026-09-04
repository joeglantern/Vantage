# 09. Engineering conventions

Rules for a codebase that instructs payments. Most of these exist because the
alternative is a bug that costs a customer real money.

## Non-negotiables

1. **Money is `BIGINT` minor units + a currency code.** Never float, never
   `number` across a boundary, always a string in JSON.
2. **`originator_conversation_id` is generated once and never regenerated.**
3. **A timeout is never retried blind.** It is probed.
4. **Every state transition is a guarded conditional `UPDATE`**, not read-then-write.
5. **Every external side effect is idempotent**, because BullMQ is at-least-once.
6. **`domain/` imports nothing from `modules/` or `platform/`.** It stays pure and
   testable without a database.
7. **No `any` in `domain/`.** TypeScript `strict`, `noUncheckedIndexedAccess`.
8. **Every route has a TypeBox schema** for params, body and response. The
   response schema is a PII allowlist.
9. **Secrets never enter logs, errors, or responses.** The redaction list is
   tested.
10. **Migrations are forward-only.** Never edit a shipped migration.

## Project layout

```
src/
  domain/          pure: state machines, money, MSISDN, validation rules
  modules/         feature slices, each a Fastify plugin
  platform/        db, redis, queue, crypto, config, logging
  workers/         queue entry points
test/
  unit/            domain
  integration/     with Testcontainers Postgres
  property/        fast-check invariants
  e2e/             Playwright against stubbed Daraja
docs/
```

Dependencies point inward. `platform` may import `domain`; `domain` imports
nothing local.

## Naming

- Files and directories `kebab-case`
- Types and classes `PascalCase`, functions and variables `camelCase`
- Database tables and columns `snake_case`, tables singular (`payout_item`)
- Money columns always end `_minor`: a column named `amount` is a code review
  failure
- Timestamps end `_at` and are `timestamptz`, always UTC
- Booleans read as assertions: `is_active`, `has_mfa`

## Errors

A typed taxonomy, not strings:

```ts
DomainError          // invariant violated: 4xx, safe to show
ValidationError      // bad input: 4xx with field detail
AuthorisationError   // 403, deliberately vague to the client
GatewayError         // Daraja misbehaved: retryable or not, explicitly flagged
IndeterminateError   // we do not know the outcome: NEVER auto-retried
```

`IndeterminateError` exists so a timeout cannot be accidentally caught by generic
retry logic. If it is ever handled by the same `catch` as `GatewayError`, that is
a bug.

Never swallow an error silently. The one permitted exception is the Lottie-style
cosmetic failure, and there is none in this codebase.

## Logging

- Structured JSON via pino, one line per event
- Correlation ID on every request and job, propagated into audit events
- Log levels: `error` needs a human, `warn` needs a human eventually, `info` is
  business events, `debug` is off in production
- **Redaction list covers MSISDN, name, national ID, credentials, session tokens**
- A unit test asserts that a log line containing a full MSISDN fails

Never log a request or response body from Daraja to the application log. Those
go to `gateway_message` in the database, where they are access-controlled.

## Testing strategy

| Layer | Tool | Covers |
| --- | --- | --- |
| Unit | Vitest | State machines, money maths, MSISDN normalisation, validation rules |
| Integration | Vitest + Testcontainers | Constraints, RLS, concurrency, transactions |
| Property | fast-check | The invariants in [04](04-payout-lifecycle.md#invariants) |
| Contract | Recorded fixtures | Every Daraja response shape, including malformed ones |
| E2E | Playwright | Import → approve → disburse → pack against a stubbed gateway |

### The test that matters most

```
Property: for any interleaving of worker retries, duplicate callbacks,
          timeouts, status-probe results and worker crashes,
          a payout item never reaches `confirmed` more than once,
          and never produces two disbursed ledger entries.
```

Write it before the disbursement feature. It is the specification, and it is the
difference between software that moves money and software you can trust to move
money.

### Also required

- Concurrency test: two workers claim the same item simultaneously; exactly one
  wins
- Cross-tenant test: org A cannot read org B's rows, verified against RLS
- Maker-checker test: approving your own batch fails at the **database**, with
  the application check removed
- Audit chain test: mutate a row directly, verification fails
- Restore test: documented, run quarterly

## Database discipline

- Every schema change is a Prisma migration, reviewed as carefully as code
- Constraints in the database, not only in the application: application checks
  get bypassed, constraints do not
- `SERIALIZABLE` isolation on approval and on ledger writes; retry on
  serialisation failure
- No `SELECT *` in application code
- Every tenant-scoped query goes through the org-scoped repository, with RLS as
  the backstop
- Append-only tables (`audit_event`, `gateway_message`, `ledger_entry`) enforce it
  with triggers

## Git and CI

- Conventional commits (`feat:`, `fix:`, `chore:`)
- Short-lived branches, small PRs, even solo, because the diff is the review
- CI must pass: typecheck, lint, unit, integration, property, migration check,
  `npm audit`
- Deployments are immutable images tagged with the git SHA
- Every release records the migration state it expects

Solo does not mean skipping review. Open the PR, read the diff the next morning,
then merge. Money code deserves a second look, even from the same pair of eyes on
a different day.

## Definition of done

A change is done when:

- [ ] Tests cover the happy path and the interesting failure
- [ ] Invariants still hold; property tests green
- [ ] Every state transition emits an audit event
- [ ] No new PII in logs; redaction test still green
- [ ] Migration written, applied forward, and reversible by a new migration
- [ ] Constraints added for anything the code assumes
- [ ] Docs updated if behaviour or model changed
- [ ] Errors typed, no silent catches
- [ ] Manually exercised against the Daraja sandbox where it touches the gateway

## Sandbox and production discipline

- Daraja sandbox for all development. Never point a dev environment at a
  production shortcode.
- Production credentials exist only in production, supplied at runtime.
- A visible, unmissable environment banner in the UI. Someone will eventually
  approve a batch believing they are in staging.
- The first production batch for any new customer is a **single item of the
  smallest possible amount**, to a phone in the room, before anything real runs.

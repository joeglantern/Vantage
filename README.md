# Vantage

Stipend disbursement and donor-grade reconciliation for Kenyan organisations.

Programme teams pay hundreds of people: cohort participants, field officers,
community health promoters, trainers, beneficiaries. Today that is a spreadsheet,
a phone, and someone spending three days afterwards proving to a donor that it
actually happened. Vantage turns that into: upload a list, review it, approve it,
disburse it, and walk away with an audit pack.

**Vantage never holds money.** Payouts are initiated from the organisation's own
M-Pesa shortcode using their own credentials. This is a deliberate regulatory
boundary, not an implementation detail. See [Compliance](docs/06-compliance.md).

## Documentation

| Doc | What's in it |
| --- | --- |
| [00. Overview](docs/00-overview.md) | Problem, buyer, wedge, non-goals, pricing |
| [01. Architecture](docs/01-architecture.md) | System diagram, components, deployment, failure model |
| [02. Tech stack](docs/02-tech-stack.md) | Every choice with its rationale and the alternatives rejected |
| [03. Data model](docs/03-data-model.md) | Entities, schema, money representation, state machines |
| [04. Payout lifecycle](docs/04-payout-lifecycle.md) | The core flow end to end, idempotency, the double-pay problem |
| [05. Security](docs/05-security.md) | Threat model, credential custody, callback trust, audit chain |
| [06. Compliance](docs/06-compliance.md) | CBK, Data Protection Act 2019, tax, AML, donor requirements |
| [07. Reconciliation & audit](docs/07-reconciliation-and-audit.md) | The artefact the customer is actually buying |
| [08. Roadmap](docs/08-roadmap.md) | Validation gate, phases, what is explicitly deferred |
| [09. Engineering conventions](docs/09-engineering-conventions.md) | Standards, testing strategy, CI, definition of done |

## Running it

Node 22 or newer, and Docker for Postgres and Redis.

```sh
npm install
cp .env.example .env          # then fill in VANTAGE_MASTER_KEY, see below
npm run dev:up                # postgres on 5433, redis on 6380
npm run db:deploy             # apply migrations
npm run db:seed               # one organisation with some history
```

The seed prints an organisation id. Put it in `.env` as
`VANTAGE_ORGANISATION_ID`: there is no sign-in yet, so the server is told which
single organisation it serves (docs/08 phase 1 is explicitly one customer with
hardcoded config).

`VANTAGE_MASTER_KEY` has no default and the process refuses to start without
one, because a missing key found at boot costs seconds and the same key found
missing mid-disbursement leaves payments in `unknown`. Generate a local one:

```sh
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Then, in two terminals:

```sh
npm run dev                   # api on 3000
npm run web:dev               # interface on 5173, proxying /api to 3000
```

`GET /api/health` is liveness, `GET /api/ready` also checks the database.

The Batches screen reads from Postgres. Every query runs in a transaction as
the least privilege `vantage_app` role with the organisation set, so row level
security does the tenant filtering rather than a `WHERE` clause somebody can
forget. The import flow is still browser-only and saves nothing: upload, review
and correction all work, but a refresh loses them.

One path through it is real rather than a mock. Go to Batches, then New batch,
and drop a CSV on it. The file is parsed in the browser, the validation rules in
`src/domain` run over the rows, and the exception queue shows the findings those
rules actually produced. Correct a row and the total moves. Submit stays disabled
until nothing blocks.

There is a sample file to try at
[web/public/cohort-messy.csv](web/public/cohort-messy.csv), also linked from the
import screen. It is deliberately untidy in the ways a real export is: a quoted
comma inside an amount, the apostrophe Excel puts in front of a text-formatted
number, a landline, a duplicate of an earlier row in a different format, and a
misplaced decimal. Twenty rows. Nine are clean, seven block, and four only warn,
which `test/unit/fixtures.test.ts` pins row by row so the sample cannot quietly
drift.

The other screens read from fixtures and say so.

There is also a switcher for jumping between screens and their variants, but it
is a development aid rather than part of the product, so it is off. Run
`npm run web:dev` and open <http://localhost:5173/?states> to get it. It is
compiled out of `npm run web:build` entirely.

### Checks

```sh
npm test              # unit, property and web component tests
npm run lint
npm run typecheck     # server and shared domain
npm run typecheck:web
```

`npm run test:integration` is separate because it needs Docker running. It starts
a real PostgreSQL container and exercises the database constraints, the
append-only triggers, row level security and tenant isolation against it. Those
guarantees cannot be tested honestly against a mock.

## Status

The domain layer, the database schema, the interface, and the beginnings of the
server exist. Reading batches is real and persisted. **Still missing: sign-in
and the maker-checker roles, writing a batch through the API, and any M-Pesa
integration at all.** See [Roadmap](docs/08-roadmap.md) for what Phase 1 needs.

**Phase 0 (validation) is not complete**, and it gates real money moving rather
than gating code. See [Roadmap](docs/08-roadmap.md#phase-0-validation-gate).

## A word on the legal content

These documents describe an architecture designed to stay clear of payment
licensing and to satisfy Kenyan data protection law. They are written by an
engineer, not an advocate, and the regulatory landscape here moves quickly.
Everything in [Compliance](docs/06-compliance.md) must be confirmed with a
Kenyan advocate and a tax advisor before the first shilling moves.

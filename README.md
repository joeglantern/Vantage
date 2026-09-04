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

## Status

Pre-build. **Phase 0 (validation) is not complete and no code should be written
until it is**. See [Roadmap](docs/08-roadmap.md#phase-0-validation-gate).

## A word on the legal content

These documents describe an architecture designed to stay clear of payment
licensing and to satisfy Kenyan data protection law. They are written by an
engineer, not an advocate, and the regulatory landscape here moves quickly.
Everything in [Compliance](docs/06-compliance.md) must be confirmed with a
Kenyan advocate and a tax advisor before the first shilling moves.

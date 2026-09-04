# 08. Roadmap

## Phase 0: Validation gate

**No code. This phase is not optional and it is not a formality.**

Go to an organisation you already work with (Afosihub and TYPNI are the obvious
first calls) and ask for their **last** payout cycle:

- The actual spreadsheet they used
- How long the whole cycle took, start to donor report
- What went wrong, and how they found out
- What the donor asked for afterwards
- Who signs off, and what happens if that person is travelling

**Pass:** they hand over a real file from a real cycle, unprompted, and complain
while doing it. Ideally they ask when they can have it.

**Fail:** they describe the process calmly and it takes twenty minutes a month.
Then the pain is not big enough to fund a product, and you have saved yourself
three months. Go back to [the alternatives](00-overview.md) or to consulting.

Also in Phase 0, in parallel and before any money moves:

- Advocate consulted on the no-custody model
- Safaricom Daraja terms read for third-party integration on a customer shortcode
- Limited company registered

Do not skip the legal calls to save time. They are the cheapest insurance you will
ever buy, and finding out at month four that the model needs restructuring is
much worse than finding out at week two.

## Phase 1: Pilot, one organisation

One customer, one programme, one cycle, run in production with real money.

| In | Out |
| --- | --- |
| CSV import with validation | Multi-tenancy |
| Exception review screen | Self-serve signup |
| Maker-checker approval with MFA | Bank transfers |
| M-Pesa B2C disbursement | Recurring schedules |
| Callbacks, status probes, unknown resolution | Public API |
| Reconciliation pack (PDF/CSV/JSON) | Withholding tax |
| Hash-chained audit log | Notifications beyond email |
| Single org, hardcoded config | Anything self-service |

**Definition of done:** one full cycle runs end to end, and the pack goes to the
donor without anyone editing it by hand.

Build the double-pay property test first, before the disbursement feature. It is
the specification.

Charge for this pilot. A free pilot teaches you nothing about whether anyone will
pay, and it makes the second conversation harder.

## Phase 2: Second customer

Only after Phase 1 has produced a pack that went to a real donor.

- Proper multi-tenancy with RLS
- Roles and member management
- Per-organisation limits and channel configuration
- Programme and donor codes, cost centres
- Batch templates and repeat-from-previous
- Onboarding a channel without developer involvement
- Standing reconciliation dashboard

**Definition of done:** a second organisation pays, having seen the first one's
pack, and you onboard them without writing code.

## Phase 3: Depth

Driven by what the first two customers actually ask for, not by this list.

- Withholding tax computation and export
- Additional rails (PesaLink, bank files): only now is the provider abstraction
  worth building, because there is finally a second provider to abstract over.
  **This is also when the whole-shilling check must become channel-scoped**:
  denormalise `channel_kind` onto `payout_item` and rewrite the constraint rather
  than dropping it. See [Data model](03-data-model.md#payout_item)
- Recurring schedules
- API for programme systems to submit batches
- Sanctions/PEP screening for larger payouts
- Bulk recipient import and de-duplication

## Phase 4: Scale, conditionally

Only if Phase 3 shows repeatable demand across more than three organisations.

- Self-serve onboarding
- Public API and webhooks
- Regional expansion: a different country is a different regulator and a
  different rail, so treat it as a new product, not a config flag

## What would make me stop

Written down now, while it is still cheap to be honest:

- No organisation hands over a real spreadsheet in Phase 0
- Counsel says the no-custody model still requires authorisation, and the cost of
  that authorisation exceeds the realistic revenue
- Safaricom's terms prohibit third-party integration on a customer shortcode with
  no viable partner route
- The pilot runs but the customer keeps rebuilding the pack by hand anyway,
  meaning the pack is not the product after all
- Two organisations run cycles and neither renews

## Sequencing note

Resist building the platform. Every instinct will say "make it multi-tenant now,
add an abstraction for payment providers, build the API". Each of those is a week
that does not move you closer to knowing whether anyone will pay.

The order is: **prove the pain → prove the pack → prove the second customer.**
Everything else is downstream of those three.

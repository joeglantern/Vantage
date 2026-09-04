# 00. Overview

## The problem

A programme officer at an accelerator, youth network or health NGO runs a payment
cycle. It looks like this:

1. Collect participant phone numbers into a spreadsheet, usually from three
   different sources that disagree with each other.
2. Clean the numbers by hand. `0712…`, `+254712…`, `254712…`, and a few that are
   someone's brother's line.
3. Send the money. Either one-by-one from a phone, or by handing a file to
   whoever has the M-Pesa portal login.
4. Screenshot the confirmations.
5. Three days later, assemble a report proving to the donor that 214 named people
   received the correct amount on the correct date.

Step 5 is the expensive one, and it is the one nobody budgets for. The finance
lead reconstructs the truth from SMS confirmations, portal exports and memory. If
a donor queries a line item six months later, the evidence is in someone's
WhatsApp.

## What Vantage does

Upload a payout list → validate it → review exceptions → approve it (by a second
person) → disburse via the organisation's own M-Pesa shortcode → receive
confirmations → produce a reconciliation pack.

The reconciliation pack is the product. The disbursement is how we earn the right
to produce it.

## Who buys it

Organisations that pay many small amounts to many individuals on a recurring
cycle, and that answer to somebody for it:

- Accelerators and incubators paying cohort stipends
- Youth and community networks paying field officers and volunteers
- Health programmes paying community health promoters
- Research organisations paying enumerators and respondents
- NGOs running cash transfer or bursary components

The common shape: **many recipients, small amounts, recurring, externally
audited.** If a customer pays 12 suppliers a month by bank transfer, they are not
the buyer.

## Why this, and why now

The reconciliation burden is not a technology problem the customer knows how to
name. They experience it as "finance is slow" and "the donor report is painful".
That means the pain is real and unowned, which is a good place to sell.

M-Pesa B2C already exists and organisations already use it. Vantage is not
competing with M-Pesa. It is the control, approval and evidence layer on top of
a rail the customer has already chosen.

## The wedge

Version one does one thing for one organisation: take a CSV of a single cohort's
stipend cycle, disburse it, and produce the pack. No multi-tenancy, no self-serve
signup, no bank transfers, no recurring schedules.

If that single flow does not visibly save a real customer real days, nothing
built on top of it will.

## Non-goals

Explicitly out of scope, and staying that way until there is a paying reason:

| Not building | Why |
| --- | --- |
| Holding customer funds / float / wallet | Regulatory line we will not cross. See [Compliance](06-compliance.md) |
| A general payments gateway | Different product, licensed competitors, no edge |
| Payroll (PAYE, NSSF, SHIF) | Statutory payroll is a compliance minefield with entrenched incumbents |
| Accounting / general ledger | We export to it, we do not become it |
| Beneficiary case management | That is a separate product; do not merge them |
| Mobile app | The buyer sits at a desk with a spreadsheet |

## How it gets priced

NGOs and programme organisations largely do not buy per-seat SaaS out of
discretionary budget. They buy against project budget lines that were written
months earlier.

So: an implementation/setup fee plus an annual support-and-hosting fee, described
in language a donor budget already contains: "programme MIS", "data systems",
"monitoring and reporting infrastructure". Avoid per-transaction pricing early;
it draws procurement scrutiny, looks like a payment service, and muddies the
regulatory story we are working hard to keep clean.

Anchor the price against the thing being replaced: finance staff days per cycle,
plus the cost of a botched donor audit.

## What success looks like at each stage

- **Validation:** one organisation hands over a real payout spreadsheet from a
  real past cycle, unprompted, and complains while doing it.
- **Pilot:** one full cycle runs through Vantage, and the pack goes to a donor
  without anyone editing it by hand.
- **Product:** a second organisation pays, having seen the first one's pack.

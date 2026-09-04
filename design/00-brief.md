# Vantage: design brief

Paste this whole file as the prompt. The codebase is attached; read the files
named in "Read these first" before drawing anything, because the states you must
design for are defined there and not in this document.

---

## What you are designing

Vantage is an internal web tool for Kenyan programme organisations (NGOs,
accelerators, youth networks, health programmes) that pay stipends to large
numbers of people on a recurring cycle.

The flow is one line: **upload a list, review the exceptions, get a second
person to approve it, disburse it over M-Pesa, walk away with an audit pack.**

The thing the customer is actually buying is the last step. They can already
send money. What they cannot do is prove, six months later and to a donor's
external auditor, exactly what happened. Design accordingly: this is an evidence
tool that happens to move money, not a payments app that happens to keep records.

## Who uses it

Three people, and they want different things from the same screens.

**The programme officer** prepares the batch. Sits at a desk with a spreadsheet
open in another window. Competent with computers, not technical. Under time
pressure at the end of a cycle. Will be reconciling names and phone numbers
against three sources that disagree. **This person lives in the exception queue**
and their experience of the product is almost entirely that one screen.

**The finance lead** approves. Comes in cold, needs to understand in under a
minute what they are being asked to authorise, and is personally accountable if
it is wrong. Wants the total, the count, what changed, and what the system is
unsure about. Approving is irreversible in practice, because you cannot unsend
M-Pesa.

**The programme director** looks at packs and the reconciliation view, usually
because a donor has asked a question. Infrequent user. Should never need
training to read a pack.

## Register and tone

Serious, quiet, and legible. This is money belonging to donors, being paid to
people who often need it that week.

- **Confidence, not delight.** No celebratory animation when a batch completes.
  A payout run finishing is a relief, not a win.
- **Boring is a feature.** The visual language should feel closer to a bank
  statement or a government service than to a startup dashboard.
- **Density is fine, clutter is not.** These users read tables of 300 rows.
  Do not force them to scroll through generous whitespace to do their job.
- **Never hide bad news.** Failures, unknowns and warnings get equal visual
  weight to successes. A pack whose exceptions page is honest is worth more than
  one that pretends nothing went wrong.
- The product is British-English spelling throughout: organisation, normalise,
  authorised.

## Read these first

These define the real states. Designing without them will miss cases.

| File | What it gives you |
| --- | --- |
| `src/domain/payout-item.ts` | Every status a payment can be in, and the legal transitions between them |
| `src/domain/payout-batch.ts` | Every status a batch can be in |
| `src/domain/validation.ts` | Every finding code, its severity, and its message |
| `src/domain/money.ts` | How amounts are represented and formatted |
| `src/domain/msisdn.ts` | Phone normalisation and the masking rule |
| `docs/04-payout-lifecycle.md` | The flow end to end, and what each step is for |
| `docs/07-reconciliation-and-audit.md` | What the pack must contain and survive |
| `docs/05-security.md` | Roles, and what each may do |
| `test/fixtures/cohort-messy.csv` | A realistic import, with every failure mode in it |

Use `test/fixtures/cohort-messy.csv` as the sample data in your mockups. Do not
invent cleaner data. The messy version is the honest one and it is what the
exception queue exists to handle.

## Hard constraints

These come from the backend and are not negotiable in design.

**Money.** Amounts arrive as a string of minor units plus a currency code, never
as a number. Display as `KES 1,500.00`. Never round, never abbreviate to
`1.5K`, never show a bare number without its currency. In any confirmation of an
irreversible action, show the total in full and large.

**Phone numbers.** Displayed masked as `2547•••••678`, everywhere, including in
the pack. Never render a full MSISDN in the interface. The organisation can
identify a person from the last three digits plus the name; a leaked screenshot
cannot.

**The two name columns.** Every line item carries the name as instructed by the
organisation and the name M-Pesa says is registered to the line that was paid.
Putting these side by side is the highest-value thing in the whole product,
because a mismatch is instantly visible and it is the check nobody does by hand.
Design this pairing deliberately. It is not just another column.

**Statuses are not free text.** Use exactly the statuses in the domain files.
Design a visual treatment for each. `unknown` is the important one and is
explained below.

**The environment banner.** When not in production, an unmissable persistent
banner. Somebody will eventually approve a real batch believing they are in
staging. Make that impossible to do by accident.

**Roles gate everything.** A viewer, preparer, approver and admin see different
affordances. An approver cannot approve their own batch, and the interface
should not offer them the button rather than letting them press it and fail.

## The one concept you must get right

**`unknown` is a first-class state, not an error.**

When a payment request times out, the money may or may not have moved. The
system does not know, and it will not guess. It asks M-Pesa again, on a backoff,
until it gets a real answer. A batch cannot be closed and a pack cannot be
generated while any payment is `unknown`.

This has direct design consequences:

- `unknown` needs its own visual treatment. It is not a failure and it must not
  look like one. It is not a success either. It is an open question.
- The standing reconciliation view is built around a queue of `unknown` items,
  oldest first, that is supposed to stay empty. Design the empty state as the
  healthy, normal, reassuring state, because it is.
- When a batch is blocked from closing, say exactly why, name the items, and
  give the operator the M-Pesa conversation ID so they can phone Safaricom.

If you take one thing from this brief: the interface must never let somebody
believe a payment succeeded or failed when the truthful answer is that nobody
knows yet.

## What not to design

- No mobile app and no mobile-first layout. The buyer sits at a desk with a
  spreadsheet. Make it work down to a small laptop and stop there.
- No marketing site, no landing page, no pricing page.
- No self-serve signup, no onboarding wizard, no organisation switcher. Version
  one is one organisation with configuration done by hand.
- No dark mode as a first pass. Get one theme genuinely right.
- No dashboard of vanity metrics. Nobody needs a chart of payouts over time. The
  only numbers that matter are "is anything unresolved" and "what did this
  cycle cost".
- No AI features, no chat, no assistant.

## Inspiration, and what to take from each

**GOV.UK Design System.** The closest match in spirit and the most useful single
reference. Take the error summary pattern almost directly: a list at the top of
the page naming every problem, each one a link that jumps to the field. That is
exactly what the exception queue needs. Take the plain-language error messages,
the generous hit targets, the willingness to be plain rather than clever, and
the accessibility discipline.

**Stripe Dashboard.** Take the payment detail view: a single payment with its
full timeline of events, its gateway codes, and its receipt, all on one page
with nothing hidden. Take the way status is communicated calmly and
consistently. Do not take the marketing gloss.

**Mercury and Wise.** Take the treatment of an irreversible money action. Both
do a good job of the moment before you commit: the amount large and unambiguous,
the recipient confirmed, the total restated, and no way to fire it by accident.
The approval screen should feel like that.

**Linear, or Height.** Take table density, keyboard navigation, and speed of
filtering on a long list. A programme officer working 300 rows should be able to
move without reaching for the mouse. Do not take the aesthetic, which is far too
fashionable for this product.

**Xero or QuickBooks reconciliation screens.** Take the mental model of matching
two sides and clearing exceptions until the queue is empty. Ugly, but the
workflow is right and finance people already understand it.

### Actively avoid

Dark glassy dashboards. Gradient hero cards. Playful illustration or empty-state
mascots. Rounded pill everything. Big numeric "KPI" tiles with sparklines.
Anything that would look out of place in a document attached to a donor report.

## Accessibility

Treat this as a requirement, not a polish pass. Many of these organisations are
themselves subject to accessibility expectations from funders.

- Colour is never the only carrier of meaning. Every status needs a label or an
  icon as well as a colour.
- Target contrast that comfortably clears WCAG AA for text and for the status
  treatments.
- Full keyboard operation of the review grid and the approval flow.
- Visible focus states that survive on a dense table.
- Error messages tied to their field, announced, and repeated in a summary.
- Do not rely on hover to reveal anything necessary.

## Deliverables

Artboards on one canvas, covering the screens in `01-structure.md`, at desktop
width, plus:

- A small set of design tokens: colour, type scale, spacing, radii, and a status
  palette covering every batch and item status.
- The component inventory in `01-structure.md`, drawn once each, with their
  states: default, hover, focus, disabled, loading, error.
- Every screen in its **empty**, **loading**, **populated**, **error** and where
  relevant **partial or blocked** state. The unhappy states are the product here,
  so do not draw only the happy path.

If you have to choose where to spend your effort, spend it on the exception
queue and the approval screen. Those two decide whether this product saves
anyone any time.

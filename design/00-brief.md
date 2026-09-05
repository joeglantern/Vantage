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
| `design/03-tokens.md` | The palette, type and spacing to start from |
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
- No third theme. Light and the true black dark theme in `03-tokens.md`, both
  done properly. Get light right first, then port it.
- No dashboard of vanity metrics. Nobody needs a chart of payouts over time. The
  only numbers that matter are "is anything unresolved" and "what did this
  cycle cost".
- No AI features, no chat, no assistant.

## Inspiration

Nothing on this list is the same product. Each one has solved a specific problem
Vantage also has. Go and look at the actual product, not a dribbble shot of it.

### The closest analogues

**Gusto, the run payroll flow.** The nearest thing to Vantage's core loop that
exists. Review a list of people and amounts, see a total, understand what
changed since last time, approve, money moves, documents come out the other end.
Study how they make a large irreversible total feel checkable rather than scary,
and how the summary before you commit is organised.

**Modern Treasury.** Payment operations and reconciliation for companies moving
money at volume. This is the closest match for the reconciliation view and for
how a payment's state and its raw gateway messages are presented together.

**Vanta or Drata.** Compliance evidence platforms. Their entire job is producing
something an auditor will accept, which is Vantage's job too. Take how they
frame controls, evidence and readiness, and how they show a thing as verified
rather than merely claimed.

**Deel or Remote, the contractor payout run.** Many recipients, many countries,
one batch, one approval. Look at how they handle a payee whose details are wrong
without derailing the whole run.

### Payments and money

**Stripe Dashboard.** The payment detail view: one payment, its full event
timeline, its gateway codes, its receipt, nothing hidden behind a tab. Also the
calmest status vocabulary in the industry.

**Increase, or Column.** Banking infrastructure dashboards. Unusually restrained,
very high information density, no decoration at all. Close to the register
Vantage wants.

**Mercury.** The moment before an irreversible transfer. Amount large and
unambiguous, recipient confirmed, total restated, no way to fire it by accident.
The approval screen should feel like this.

**Wise.** Breaking an amount into its parts so there is no ambiguity about what
lands. Also good at showing progress on a transfer that takes time.

**Paystack and Flutterwave dashboards.** Worth looking at specifically because
they are built for this market and your users may already have seen them. Note
what they get right about phone-number-as-account, and where they get cluttered.

**The M-Pesa business portal.** Look at it because it is what you are replacing.
Understand what it makes hard.

### Dense review work

**Linear.** Table density, keyboard navigation, filter speed, and command
palette. A programme officer working 300 rows should never reach for the mouse.
Take the interaction model. Do not take the aesthetic, which is more fashionable
than this product should be.

**Numeric, or FloQast.** Accounting close software, built entirely around
clearing a queue of exceptions until it is empty. That is the exception queue's
mental model, already solved.

**Retool, or Sigma.** Honest internal-tool density. Ugly in places, but they
never waste a row of vertical space.

### Plainness and accessibility

**GOV.UK Design System.** The single most useful reference here. Take the error
summary pattern almost directly: a list at the top of the page naming every
problem, each entry a link that jumps to the field. That is the exception queue.
Take the plain-language error messages, the generous hit targets, and the
accessibility discipline. Take the willingness to be plain rather than clever.

**Google Cloud Console, or Google Admin.** For the specific quality bar of
looking like a large company built it: consistent spacing, restrained colour,
tables that behave, nothing decorative. This is the polish level to aim for.

**Xero, bank reconciliation screen.** Matching two sides until the queue clears.
Dated, but finance people already understand it and that is worth something.

### How to use this list

Take the interaction model from Linear and Numeric, the payment presentation
from Stripe and Modern Treasury, the confirmation weight from Mercury and Gusto,
the error handling from GOV.UK, and the finish quality from Google's consoles.

Do not blend the visual styles. Pick one coherent visual direction of your own
and use these for how things behave.

## Do not let it look AI-generated

This is a real requirement, not a stylistic preference. The users are finance
and programme staff who have to hand this product's output to a donor. Anything
that reads as generated undermines the one thing Vantage sells, which is that
its records can be trusted.

### Banned outright

- Gradients. No gradient backgrounds, no gradient buttons, no gradient text, no
  gradient borders. Flat colour only. If something needs to recede, use a
  neutral, not a fade.
- Purple to pink, indigo to violet, or teal to blue colour schemes.
- Glassmorphism, frosted panels, backdrop blur, translucent cards.
- Glows, coloured drop shadows, neon accents, "aurora" or blob backgrounds.
- Emoji used as interface icons.
- Sparkle icons, and any visual that signals "AI".
- Bento grids.
- Cards with heavy rounding and a large soft shadow used for everything,
  particularly where a plain table is the right answer.
- Untouched framework defaults. A stock Tailwind palette at `blue-500` and
  `gray-500`, with `rounded-2xl` and `shadow-lg` on every surface, is the single
  most recognisable tell there is.
- Fake avatars, fake testimonials, fake company logos.
- Centre-aligned page content with a lot of empty space around it. This is a
  data tool. Fill the width.

### Copy rules

The interface text is part of the design and it is where generated work is most
obvious.

- **No em dashes anywhere.** Use a comma, a colon or a full stop.
- No marketing verbs. Banned: effortlessly, seamlessly, powerful, robust,
  unlock, elevate, supercharge, streamline, empower, delight, magic, simply,
  just, easily.
- No "Let's get started", no "Oops", no "Something went wrong" without saying
  what.
- Say the specific thing. "4 numbers could not be read" beats "Some items need
  attention". "Approve KES 15,000 to 10 people" beats "Confirm action".
- British English. Organisation, normalise, authorised, recognise.
- Sentence case for headings and buttons, not Title Case.
- Buttons name the action and its object. "Approve batch", not "Continue" or
  "Submit".
- Error messages say what happened, why, and what to do next, in that order.

### What to do instead

Personality here comes from craft, not decoration. Precise spacing. A type scale
that was actually chosen. Tabular figures that align down a column of money.
Borders that land on the pixel. A status palette that is legible at a glance and
still legible in greyscale. Transitions that are fast and few. Restraint that
reads as confidence.

One distinctive, defensible choice is worth more than ten decorative ones. Pick
something specific to own, the way Stripe owns its payment timeline, and make it
excellent.

## Identity

Vantage needs its own identity and it must not borrow anyone else's.

- **No Claude or Anthropic branding of any kind.** No logo, no wordmark, no
  colour palette lifted from Claude, no "built with" mark, no reference in the
  interface, the favicon, the page title or the pack. The palette in particular:
  do not reach for the warm clay and cream that Claude uses.
- No other vendor's brand either. It is not a Stripe skin or a Linear clone.
- Design a simple wordmark and an app mark that work at 16px in a browser tab
  and in one colour on a printed pack cover. Geometric, quiet, memorable. The
  name means a point of view that lets you see clearly, and there is something
  in that worth using, but do not make it literal or clever.
- The palette is in `03-tokens.md`, with the reasoning for each choice and a
  list of the specific hex values to avoid. The short version: the primary
  action is near-black ink rather than a brand colour, so colour is reserved for
  meaning and no status ever competes with a button.

## Dialogs, confirmations and messages

**No browser dialogs. Ever.** `alert()`, `confirm()` and `prompt()` are banned
outright. They cannot be styled, they cannot be made accessible properly, they
block the page, and they make a product that moves money look like a school
project. Every one of them is a custom component.

This matters beyond appearance. The confirmation before an irreversible payout
is a control, not a formality, and a native dialog cannot restate an amount,
name a recipient count, or require anything of the person clicking it.

Design these, each with its own artboard:

| Component | Where it is used |
| --- | --- |
| Confirmation dialog | Any irreversible action. Restates the amount and the count |
| Destructive confirmation | Erasure, credential replacement. Requires typing a word to proceed |
| Step-up challenge | The TOTP prompt at approval |
| Inline confirmation | Small reversible things, resolved in place rather than in a dialog |
| Toast | Something succeeded. Transient, never carries the only copy of information |
| Banner | Something is wrong with the page or the environment. Persistent |
| Error summary | The list at the top of a form. Persistent, linked |

Rules for all of them:

- Focus moves into the dialog on open and returns to the trigger on close.
- Focus is trapped while it is open.
- Escape cancels. The cancel action is never the visually dominant one, and the
  confirm action is never the default focus for anything destructive.
- The dialog says what will happen, to how many people, for how much money, and
  whether it can be undone. It never says only "Are you sure?".
- Nothing important lives only in a toast. If a person needs it later, it goes
  on the page.
- Never use a dialog to report a validation error. Those belong inline, next to
  the field, and in the summary at the top.

Use the native `<dialog>` element as the basis if you like, since it gives
correct semantics for free, but style it completely.

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

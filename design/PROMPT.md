# Master prompt

Paste everything below the line, with the repository attached.

---

I am attaching the codebase for **Vantage**. I want you to design its interface.
Do not write application code. Design artboards on a canvas.

## Before you draw anything

Read these four files in the attached repository, in this order. They are the
brief and they are specific. Do not skim them, and do not substitute your own
assumptions for what is in them.

1. `design/00-brief.md` for product, users, tone, hard constraints,
   inspiration, and a list of things that would make this look generated
2. `design/01-structure.md` for every screen, every state, the components
3. `design/03-tokens.md` for the palette, type and spacing to start from
4. `design/02-assets.md` for what to produce beyond the screens, including
   the image generation prompts I will run myself

Then read these source files, because the real states are defined there and not
in prose. If you design a status that does not exist in this code, or miss one
that does, the design is wrong.

- `src/domain/payout-item.ts`: every status a payment can hold, and the legal
  transitions between them
- `src/domain/payout-batch.ts`: every status a batch can hold
- `src/domain/validation.ts`: every validation finding, its severity and its
  real message text
- `src/domain/money.ts`: how amounts are represented and formatted
- `src/domain/msisdn.ts`: phone normalisation and the masking rule
- `docs/04-payout-lifecycle.md`: the flow end to end
- `docs/07-reconciliation-and-audit.md`: what the audit pack must contain
- `test/fixtures/cohort-messy.csv`: use this as the sample data in every mockup

## What Vantage is, in one paragraph

An internal web tool for Kenyan programme organisations that pay stipends to
hundreds of people on a recurring cycle. Upload a list, review the exceptions,
have a second person approve it, disburse over M-Pesa, and walk away with an
audit pack a donor's external auditor will accept. The pack is the product. The
disbursement is how it earns the right to produce it. This is an evidence tool
that moves money, not a payments app that keeps records.

## The five things I will judge this on

1. **The exception queue.** A programme officer spends almost all their time on
   this one screen, reconciling a messy spreadsheet against records that
   disagree. If this screen is not excellent, nothing else matters.

2. **The approval screen.** A finance lead arrives cold and has under a minute to
   understand what they are authorising. It is irreversible. It should feel
   weighty without being frightening.

3. **`unknown` as a first-class state.** When a payment times out, the money may
   or may not have moved and the system will not guess. It is not a success and
   it is not a failure. It is an open question that blocks the batch from
   closing. If your design lets anyone believe a payment resolved when nobody
   knows yet, it has failed at the thing this product exists for.

4. **The unhappy states.** Empty, loading, error, partial, and blocked. Draw them
   all. A design that only shows the happy path is not finished.

5. **That it does not look generated.** See the banned list in the brief.

## Non-negotiables

- **No gradients anywhere.** Not backgrounds, not buttons, not text, not borders.
  Flat colour only.
- **No browser dialogs.** `alert`, `confirm` and `prompt` are banned. Every
  confirmation is a custom component that restates the amount and the recipient
  count. The confirmation before a payout is a control, not a formality.
- **Dark theme is true black**, `#000000` base. Text is `#F2F4F5`, never pure
  white, because white on true black smears on OLED.
- **Money** displays as `KES 1,500.00`, with tabular figures, right aligned.
  Never rounded, never abbreviated to `1.5K`.
- **Phone numbers** always masked as `2547•••••678`, everywhere, including the
  pack.
- **Two name columns side by side:** the name the organisation instructed, and
  the name M-Pesa says owns the line that was paid. A mismatch must be instantly
  visible. This is the highest value detail in the product.
- **No borrowed branding.** Vantage needs its own wordmark and app mark. Do not
  use any other product's identity, palette or visual signature, and do not put
  any tool's branding anywhere in the interface, favicon, page title or pack.
- **British English**, sentence case, no marketing language, and **no em dashes
  in any interface copy**. Use a comma, a colon or a full stop.

## What not to design

No mobile app or mobile-first layout, this is a desk tool. No marketing site. No
self-serve signup or onboarding wizard. No organisation switcher, version one is
a single organisation. No vanity metric dashboard. No chat or assistant.

## What I want back

1. **Artboards** for every screen in `design/01-structure.md`, at desktop width,
   each in its empty, loading, populated, error, and where relevant blocked
   state. Light theme first, then the true black dark theme for at least the
   exception queue, the approval screen, the reconciliation view and the payment
   detail.

2. **The component inventory** from `01-structure.md`, drawn once each with
   default, hover, focus, disabled, loading and error states.

3. **A token sheet**: final colour, type scale, spacing, radii, and the full
   status palette shown in both themes and in greyscale.

4. **An identity**: wordmark, app mark at 16px, favicon, one colour and reversed
   versions, since the pack cover prints.

5. **Image generation prompts** as specified in `design/02-assets.md`. I will run
   these through ChatGPT myself, so they need to be copy-pasteable, batched into
   sheets that produce many assets per generation, and each must state the exact
   hex palette and carry the full exclusion list. Be honest in that section about
   what generation is bad at rather than giving me prompts for assets that will
   come back unusable.

## How to work

Start with the exception queue and the approval screen. Get those right before
drawing anything else. If you run out of room, I would rather have four
excellent screens than twelve mediocre ones.

Use `test/fixtures/cohort-messy.csv` as the data throughout. It is deliberately
messy, with a duplicate, an unreadable number, a landline, an amount with cents
M-Pesa cannot move, and a row where somebody typed `50000` meaning `5000`. That
last one is the mistake this entire product exists to catch. Do not design
against tidier data than that, because the tidy version is not what anyone
actually has.

Ask me before departing from the tokens or the structure. Tell me if something
in the brief is wrong or contradicts the code, rather than quietly designing
around it.

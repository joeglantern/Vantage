# Vantage: structure

The screen inventory, navigation model and component set. Read alongside
`00-brief.md`, and `02-assets.md` for what to produce beyond the screens.
Statuses and finding codes come from the domain files listed there; this
document says where they appear, not what they are.

## Navigation model

A persistent left rail, five items, no nesting. One organisation, so no switcher.

```
Vantage
  Batches            the default landing place
  Reconciliation     the standing "is anything wrong right now" view
  Recipients         people and their numbers
  Packs              generated audit packs
  Settings           channel, limits, members
```

Top bar carries the organisation name, the environment banner when not in
production, and the signed-in user with their role.

Batches is the home screen because the work is cyclical: somebody arrives to run
a cycle, or to check on one that is running.

## Screens

### 1. Sign in

Email and password, then TOTP for anyone holding the approver role.

States: default, invalid credentials, account locked after repeated failures,
TOTP required, TOTP incorrect.

Keep it plain. Do not put marketing copy on it.

### 2. Batch list

Every batch with reference, programme, status, item count, total, prepared by,
approved by, and dates.

Filter by status. The default view puts anything needing attention at the top:
batches awaiting approval, then batches disbursing, then everything else by date.

Primary action: **New batch**.

States: empty (no batches yet, first run), populated, filtered to nothing.

### 3. Import

Upload a CSV or paste from a spreadsheet. Show the expected columns before the
upload, not after it fails.

After upload, show what was read before validating: row count, total, and the
first few rows, so somebody can see immediately that they picked the wrong file.

The original file is stored verbatim and linked to the batch. Surface that. When
somebody asks "what did we upload", the answer is the actual bytes.

States: waiting for a file, parsing, parsed with a preview, unreadable file,
wrong columns, empty file, file too large.

### 4. Exception queue

**The most important screen in the product.** The programme officer will spend
almost all their time here. Design this one first and design it best.

Ordering, always: blocking issues first, then warnings, then clean rows
collapsed into a count that can be expanded.

At the top, a summary in the GOV.UK error-summary style: "6 issues must be fixed
before this batch can be approved, and 4 warnings need acknowledging", each one
a link that jumps to its row.

Each row shows the participant reference, the name as instructed, the phone
masked, the amount, and its findings. **Every field is editable in place**, and
every edit is an audit event, so an edit should feel deliberate rather than
casual.

Warnings must be **individually acknowledged**, and the acknowledgement records
who did it. Design the difference between "fixed" and "acknowledged" clearly:
one changes the data, the other accepts it as correct.

Show the running batch total, and update it live as rows are edited. Somebody
correcting a misplaced decimal should watch the total drop back to what they
expected.

Design each finding type from `src/domain/validation.ts` with its real message.
Cover at minimum: an invalid phone, a duplicate in the batch, an amount over the
per-item limit, a name mismatch against the stored record, and a new recipient.

Primary action: **Submit for approval**, disabled while anything blocking
remains, with the reason stated next to it rather than as a tooltip.

States: validating, all clear, blocking issues present, warnings only, all
warnings acknowledged and ready.

### 5. Approval

A different person than the preparer. Comes in cold. Must understand in under a
minute.

Show, in this order: the batch reference and programme, the total in full and
large, the recipient count, who prepared it and when, what warnings were
acknowledged and by whom, and the per-item and per-batch limits in force.

Then a step-up authentication challenge, every time, regardless of how fresh the
session is.

Design the failure case where the approver is the preparer. They should not be
offered the action at all, with an explanation of why.

This screen should feel weighty. It is the last moment before money moves and it
cannot be undone.

States: ready to approve, awaiting the step-up challenge, challenge failed,
approving in progress, approved, blocked because the viewer prepared it, blocked
because the viewer lacks the role.

### 6. Disbursement progress

Live view while a batch runs. One row per payment, with its status.

Show counts by status, prominently, and let the operator filter to any one of
them. The counts must add up to the total in a way a person can verify by eye,
because somebody will check.

Do not imply completion while anything is still `sending` or `unknown`.

States: queued and not yet started, in progress, all terminal and clean, all
terminal with some failures, **blocked from closing because items are
unresolved**.

That last state is the one to design carefully. It needs to explain plainly what
is happening, that the system is still asking M-Pesa, when it will ask again,
and what a human can do about it.

### 7. Payment detail

One payment, everything known about it, nothing hidden. Reachable from anywhere
a payment appears.

Recipient, both names side by side, amount, current status, full state history
with timestamps, the M-Pesa receipt when there is one, the failure code and its
plain-English meaning when there is one, and the conversation ID for phoning
Safaricom.

For a failed payment, offer retry, but only for an unambiguous failure, and make
clear that retry reuses the same request identity so it cannot double-pay.

### 8. Reconciliation

The standing operational view, not tied to one batch. The question it answers is
"is anything wrong right now".

Sections, in priority order:

1. Items in `unknown`, oldest first. **The queue that must stay empty.**
2. Items sent with no callback past the service level.
3. Batches stuck in disbursing.
4. Payee name mismatches across recent batches.
5. Recipients appearing across unrelated programmes.

**Design the empty state as the primary state.** An empty reconciliation view
means the system is healthy. It should read as reassurance, not as "no data".

### 9. Pack

The generated audit pack, on screen and as PDF from the same template so they
cannot drift.

Sections are specified in `docs/07-reconciliation-and-audit.md`: cover, summary,
control attestation, line items, exceptions, audit trail, verification block.

Two things to get right:

- The **summary table** must show unresolved as zero, because a pack cannot
  exist otherwise. That zero is the guarantee the whole document rests on.
- The **verification block** carries hashes an auditor can recompute. Present it
  as something a person can actually use, with the instructions next to it, not
  as a wall of hex.

Design the on-screen version and show how it paginates as a PDF.

States: generating, ready, superseded by a newer version after an erasure.

### 10. Recipients

The organisation's people. Name, masked number, participant reference, when they
were added, how many payments they have received.

Detail view supports the data subject rights in `docs/06-compliance.md`: export
everything held about one person, correct a name or number, and erase.

**Erasure needs a serious confirmation.** It destroys the encryption key that
protects that person's data, it cannot be undone, and it causes affected packs
to be re-rendered. Say all of that plainly before asking somebody to confirm it.

### 11. Settings

Three areas, minimal:

- **Payout channel.** The organisation's M-Pesa shortcode and initiator name.
  Credentials are write-only: you can replace them, never read them back. Show a
  verification state, since a channel must be verified before use.
- **Limits.** Per-item, per-batch, and the deviation warning threshold. Explain
  what each catches, in money terms.
- **Members.** People and roles. Show plainly that an admin can manage access but
  cannot prepare or approve a payout, and why that separation exists.

## Component inventory

Draw each once, with its states.

| Component | Notes |
| --- | --- |
| Status pill | One per batch status and item status. Colour plus label plus icon, never colour alone |
| Money | Currency, thousands separators, two decimals, right-aligned in tables |
| Masked phone | `2547•••••678`, monospace figures |
| Name pair | Instructed name and M-Pesa registered name, with a clear mismatch treatment |
| Finding | Severity, message, and the row it points at |
| Error summary | The list at the top of the exception queue, each entry a jump link |
| Data table | Dense, sortable, keyboard navigable, with sticky header and inline edit |
| Row editor | In-place edit with save and cancel, and a visible record that it was edited |
| Confirmation dialog | For irreversible actions. Restates the amount and count |
| Destructive confirmation | Erasure and credential replacement. Requires typing a word |
| Inline confirmation | Small reversible things, resolved in place, no dialog |
| Toast | Transient success. Never the only copy of anything |
| Banner | Persistent page-level or environment-level problems |
| Step-up challenge | The TOTP prompt at approval |
| Environment banner | Persistent, unmissable, non-production only |
| Empty state | Neutral and informative. Never jokey, never illustrated with a mascot |
| Progress summary | Counts by status that visibly add up to the total |
| Timeline | State transitions with actor and timestamp, used on payment detail and in the pack |
| Verification block | Hashes plus instructions to recompute them |

No browser dialog is ever acceptable. See "Dialogs, confirmations and messages"
in `00-brief.md` for the rules each of these has to meet.

## Tokens

Concrete values, with the reasoning, are in `03-tokens.md`. Start there. The
summary of what the set has to cover:

- **Colour.** A neutral base. A single restrained accent for primary actions,
  and not the default dashboard blue. A status palette covering: neutral or
  pending, in progress, success, warning, failure, and **unresolved**, which must
  be visually distinct from failure. Every colour flat. No gradients anywhere in
  the token set, so there is nothing to reach for later.
  Check the whole status palette in greyscale before committing to it.
- **Type.** One family. Tabular figures for anything numeric, so columns of
  money align. A scale with enough steps for dense tables and for the large
  total on the approval screen.
- **Spacing.** A tight scale. This is a data tool.
- **Radii and shadow.** Minimal. Prefer borders to shadows.

## Priority

If time runs out, this is the order that matters:

1. Exception queue
2. Approval
3. Disbursement progress, including the blocked-from-closing state
4. Pack
5. Reconciliation
6. Everything else

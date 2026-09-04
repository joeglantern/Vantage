# Fixture spreadsheets

Two sample payout sheets for one imaginary cohort, "YCIC March 2026". Both are
asserted against in `test/unit/fixtures.test.ts`, so they cannot quietly stop
meaning what this file says they mean.

Columns match the import format in
[docs/04](../../docs/04-payout-lifecycle.md#1--import): participant reference,
name, phone, amount, optional note.

## cohort-clean.csv

Ten participants, all known to the organisation, all at their usual KES 1,500.
Total KES 15,000. Raises nothing at all: no blocking issues, no warnings to
acknowledge.

It is deliberately not tidy in format. The phone column carries `0712…`,
`+254722…`, `254733…`, the `01xx` range, a bare national number, one with
spaces and one with `+254` and spaces. All eight forms normalise. Clean means
the data is right, not that the typing was neat.

## cohort-messy.csv

The same cohort as a real sheet looks three sources later. Twenty rows, and it
cannot be submitted for approval.

Rows 1 to 8 are the same eight people as the clean file, in the same messy
formats plus an amount written `"1,500"`, an amount written `1500.00`, and a
number Excel has coerced to text with a leading apostrophe.

| Row | What it is | Severity |
| --- | --- | --- |
| 9 | Row 1 again, same number in another format, name reversed | Blocking, duplicate in batch |
| 10 | Letters in the phone column | Blocking |
| 11 | One digit short | Blocking |
| 12 | A landline, not a mobile | Blocking |
| 13 | Zero amount, somebody unpaid this cycle left in the sheet | Blocking |
| 14 | `1500.50`, cents M-Pesa cannot move | Blocking |
| 15 | `50000` where `5000` was meant | Blocking, over the per-item limit |
| 16 | Participant new to the organisation | Warning |
| 17 | `P. K. Mwangi` where the records say `Peter Kimani Mwangi` | Warning |
| 18 | Three times this recipient's usual amount | Warning |
| 19 | Shares a phone with row 7, under a different name | Warning **and** blocking |
| 20 | Fine | none |

Row 15 is the one that matters. `5000` typed as `50000` is the single most
expensive mistake in this domain, and it is the reason the per-item limit
exists. Row 19 is worth keeping too: two people sharing one handset is
completely normal in this context, so it warns rather than blocks on that
ground, while still blocking as a duplicate number in one batch. Both facts are
true at once and the exception queue has to show both.

## Adding to these

Keep them honest. If you add a row, add the assertion for it in
`test/unit/fixtures.test.ts` in the same commit. A fixture nobody asserts
against drifts into fiction, and then it is worse than having none.

These are invented people and invented numbers. Do not put a real participant,
a real phone number or a real payout in here.

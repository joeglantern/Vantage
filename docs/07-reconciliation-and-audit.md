# 07. Reconciliation & audit

The disbursement is the feature. **The pack is the product.**

A customer can already send money. They have M-Pesa. What they cannot do is
prove, six months later and to somebody else's satisfaction, exactly what
happened. That is what they are paying for.

## What the pack must survive

Write the pack for the hostile reader, not the happy one:

- A donor's external auditor sampling twenty line items at random
- A finance lead reconciling against a bank statement a quarter later
- A programme officer who has left, whose successor must explain a payment
- An investigation into one specific allegation about one specific person

If it survives those, it is good enough.

## Contents

### 1. Cover

Organisation, programme, donor and project code, batch reference, currency,
period, generation timestamp, who generated it, and this organisation's **audit
chain head hash** at the time of generation.

### 2. Summary

| Line | Amount | Count |
| --- | --- | --- |
| Approved obligation | KES … | n |
| Successfully disbursed | KES … | n |
| Failed | KES … | n |
| Unresolved | **must be zero** | 0 |
| **Net moved** | **KES …** | **n** |

A pack cannot be generated while anything is unresolved. That guarantee is what
makes the summary meaningful rather than decorative.

### 3. Control attestation

The part auditors actually care about, stated plainly:

- Prepared by *name*, at *timestamp*
- Approved by *name*, at *timestamp*, with MFA
- Preparer and approver are different people, enforced by database constraint
- Per-item limit in force: KES …
- Per-batch limit in force: KES …
- Warnings acknowledged: n, by *name*

### 4. Line items

One row per recipient:

| Field | Why it is there |
| --- | --- |
| Recipient reference | Ties to the organisation's own participant records |
| Name as instructed | What the organisation intended |
| **Name as registered on M-Pesa** | What Safaricom says owns that line |
| Phone (masked) | `2547•••••123`: identifiable to the org, not to a leaked PDF |
| Amount | Exact, in minor units, formatted |
| Status | Confirmed / failed |
| **M-Pesa receipt** | The externally verifiable proof |
| Settled at | Timestamp from the gateway, not from our clock |

The two name columns side by side are the highest-value thing in the document. A
mismatch is instantly visible, and it is the check nobody does manually.

### 5. Exceptions

Every failure with its gateway code, plain-English reason, and what was done
about it. Never hide these. A pack with a clean exceptions page that a reader
knows is honest is worth more than one that pretends nothing went wrong.

### 6. Audit trail

Every state transition for the batch: who, what, when, correlation ID. Rendered
from the hash-chained `audit_event` table.

### 7. Verification block

- Head hash of **this organisation's** audit chain, with its `chain_seq`
- The `audit_checkpoint` the verification may start from, so an auditor need not
  replay from genesis
- SHA-256 of the pack's own canonical JSON representation
- Instructions for verifying all of the above

## Verifiability

The pack is falsifiable, which is what makes it evidence rather than assertion:

```mermaid
flowchart LR
  A["audit_event chain (per org)<br/>hash-linked, append-only"] --> B["head hash"]
  C["frozen batch snapshot"] --> D["canonical JSON"]
  D --> E["SHA-256"]
  B --> F["Verification block<br/>printed in the pack"]
  E --> F
  F --> G["Auditor recomputes<br/>from live system"]
  G --> H{"Match?"}
  H -->|"yes"| I["History unaltered"]
  H -->|"no"| J["Something changed,<br/>investigate"]
```

An auditor with read access can recompute both values. If someone edited history
after the fact, the recomputation fails. That is a genuinely stronger claim than
any competing spreadsheet can make, and it is worth saying in the sales
conversation.

## Formats

All three generated from the same frozen snapshot, in one job:

- **PDF**: for the donor. Paginated, printable, signed-off.
- **CSV**: for finance. Straight into their reconciliation.
- **JSON**: for machines. Full fidelity including minor units and raw gateway
  codes.

Divergence between formats is a bug. One template, one snapshot, one render.

## Storage and retention

- Immutable once generated. Regeneration creates a **new version**; old versions
  are never overwritten.
- Stored encrypted in the object store, hash recorded in Postgres.
- Retained per the organisation's schedule, commonly seven years for donor work.
- Personal identifiers within a pack are subject to the erasure rules in
  [Compliance](06-compliance.md#data-subject-rights); the financial record
  survives, the identifiers do not.

Note that a rendered pack is a **flat document naming many recipients**, so
crypto-shredding cannot reach inside it the way it reaches `gateway_message`. On
erasure, every pack naming that recipient is re-rendered from the shredded source,
so they appear pseudonymously in the new version, and the superseded versions are
destroyed in the object store, which is mutable and therefore may be deleted.
This is the one place where "immutable once generated" yields to an erasure
request, and it should be stated in the DPA.

## The ongoing reconciliation view

Distinct from the per-batch pack: a standing screen answering "is anything wrong
right now?"

- Items in `unknown`, oldest first: **the queue that must stay empty**
- Items `sent` with no callback past SLA
- Batches stuck in `disbursing`
- Payee-name mismatches across all recent batches
- Recipients appearing across unrelated programmes

This is the operational heartbeat. If it is empty, the system is healthy. If it
is not, someone knows before the donor does.

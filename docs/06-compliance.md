# 06. Compliance

> **Read this first.** This document is written by an engineer, not an advocate.
> It sets out the design decisions taken to reduce legal exposure and the
> questions those decisions raise. It is **not legal advice** and must not be
> relied on as such.
>
> Kenyan financial-services and data-protection rules move quickly, and the
> author's knowledge has a cutoff. Every statement here must be confirmed against
> the **current** text of the law and with:
>
> - a **Kenyan advocate** with financial services and data protection practice
> - a **tax advisor** for the withholding-tax and worker-classification questions
> - **Safaricom** for current Daraja terms, which bind you contractually
>   regardless of what the statute says
>
> Budget for this. It is cheaper than the alternative.

## The single most important design decision

### Why we never touch the money

Vantage **never holds, receives, pools, or passes through customer funds.**

Payouts are initiated against the **organisation's own M-Pesa shortcode**, using
**the organisation's own initiator credentials**, and funds move directly from
that organisation's M-Pesa account to the recipient. Vantage is an instruction and
record-keeping layer. At no point is there a Vantage float, wallet, settlement
account, or client-money balance.

This matters because Kenya regulates payment services. The National Payment
System Act, 2011 and its regulations govern payment service providers, and the
Central Bank of Kenya authorises and supervises them. The moment a business takes
custody of other people's money in order to pass it on, it is squarely in
licensed territory, with capital requirements, authorisation, reporting and
supervision attached.

By never taking custody, Vantage aims to sit outside that perimeter as software
its customers operate on their own account.

**Confirm with counsel, specifically:**

1. Whether *initiating* payments on a customer's behalf, with no custody, is
   itself a regulated activity under current Kenyan law, and whether any
   payment-initiation or technical-service-provider category applies.
2. Whether holding a customer's initiator credentials changes the analysis.
3. What Safaricom's Daraja terms say about a third party integrating on a
   customer's shortcode, and whether any partner or aggregator status is required.

Question 3 is contractual rather than statutory, and it is the one most likely to
bite first.

### Architectural consequences

These are non-negotiable, and each is a build rule:

- No bank or mobile-money account belonging to Vantage ever receives customer
  disbursement funds.
- No feature that "tops up", "pre-funds", "floats", or "advances" a payout, ever.
- No feature that nets, holds, or delays funds between organisation and recipient.
- Fees are invoiced separately to the organisation. They are **never** deducted
  from a disbursement.

That last one is subtle and important: deducting a fee from money in transit is
exactly the behaviour that makes something look like a payment service.

## Data protection: Data Protection Act, 2019

### Our role

The organisation is the **data controller**: it decides why and how its
beneficiaries' data is processed. Vantage is a **data processor** acting on its
documented instructions.

This is the right allocation and it should be stated in the contract, because it
puts the primary controller obligations (lawful basis, notices to data subjects,
responding to rights requests) where they belong: with the organisation that has
the relationship with the beneficiary.

It does **not** make Vantage obligation-free. Processors have direct duties around
security, sub-processors, breach notification to the controller, and assisting
the controller.

### Registration

The Act provides for registration of data controllers and processors with the
Office of the Data Protection Commissioner, subject to thresholds and exemptions
set out in regulations. **Check the current thresholds and fees with the ODPC**
and register if applicable. Do this before the pilot, not after.

### Data Processing Agreement

Every customer contract needs a DPA schedule covering, at minimum:

- Subject matter, duration, nature and purpose of processing
- Categories of data subjects and personal data
- Processing only on documented instructions
- Confidentiality obligations on personnel
- Security measures (reference [Security](05-security.md))
- Sub-processor rules: named, with notice of change and a right to object
- Assistance with data subject rights and with breach handling
- Deletion or return of data at end of contract
- Audit and inspection rights

Have an advocate draft the template once. Reuse it.

### Data minimisation

Deliberate choices already baked into the schema:

| Field | Decision |
| --- | --- |
| Phone number | Required: it is the payment instrument |
| Full name | Required: needed for the payee-name check and the audit trail |
| National ID | **Optional, encrypted.** Only where the organisation's own policy requires it |
| Date of birth, gender, address | **Not collected.** Never added without a written reason |
| Bank details | Not in v1 |

The default answer to "can we also capture…" is no.

### Data residency

Vantage is hosted **in Kenya**. This is a compliance decision, not a performance
one.

The Act restricts transfers of personal data outside Kenya, requiring an
appropriate basis, such as proof of adequate safeguards, or consent, or one of
the specified conditions, and certain categories attract stricter treatment.
Keeping the data in-country avoids that whole analysis.

Practical consequences, which must be respected:

- Application, database, backups and object storage all in Kenya
- Error tracking that receives payloads must be self-hosted in-country, or
  configured so that no personal data leaves (GlitchTip self-hosted, or Sentry
  with aggressive scrubbing, prefer the former)
- Analytics: none, or self-hosted
- No US-hosted managed database, log aggregator, or email provider handling
  personal data without a documented transfer basis reviewed by counsel

Any exception is a decision to be written down and signed off, not an accident of
convenience.

### Data subject rights

Beneficiaries have rights over their data. The system supports the controller in
honouring them:

- **Access / portability**: export everything held about one recipient as JSON
  and PDF
- **Rectification**: correct a name or number, with the change audit-logged
- **Erasure**: delete personal data while retaining the financial record in
  anonymised form

Erasure has a genuine tension with donor retention requirements. The resolution:
**personal identifiers are erasable; financial facts are not.** After erasure the
ledger still shows that KES 5,000 was disbursed on a date under a batch, but the
name, phone and ID are gone, replaced by a stable pseudonymous key. Record this
approach in the DPA and have counsel confirm it.

There is a second, sharper tension underneath it. `gateway_message` holds raw
Daraja payloads containing MSISDNs and registered names, and `gateway_message`
and `audit_event` are append-only with triggers that block `UPDATE` and `DELETE`,
and that immutability is precisely what makes them evidence. An erasure request has
nowhere to land in a table that cannot be written to.

**This is resolved by crypto-shredding, not by exception.** Payloads are
encrypted under a per-recipient data key; erasure destroys the key and leaves the
row. The record remains, its hash still verifies because the hash covers the
ciphertext, and the personal data inside is permanently unrecoverable. Audit
event `metadata` sidesteps the problem entirely by holding references
(`recipient_id`) rather than personal data.

The mechanism is specified in
[Data model](03-data-model.md#erasure-from-append-only-tables). Put it in front of
counsel explicitly: whether irreversibly destroying the key satisfies erasure
under the Act is a legal question, not an engineering one, and the answer decides
whether this design holds.

### Breach notification

The Act requires notification to the ODPC where a breach presents a real risk,
**within 72 hours** of becoming aware, and communication to affected data
subjects where the risk to them is high.

Seventy-two hours is not long. The runbook is in
[Security](05-security.md#incident-response). Rehearse it once before launch.

### Data Protection Impact Assessment

Processing personal data about vulnerable beneficiaries at scale is the kind of
activity for which a DPIA is expected. Do one before the pilot, keep it as a
living document, and offer it to customers during procurement. NGOs are asked
for exactly this by their own donors, and having one ready is a sales asset.

## Tax

**Confirm all of this with a tax advisor.** It affects the customer's obligations
more than yours, but the software must support them.

- **Withholding tax.** Certain payments (professional and consultancy fees among
  them) attract withholding tax at source, and the payer is obliged to withhold
  and remit. Whether a given stipend attracts WHT depends on its true nature.
  Vantage should let the organisation classify a payment and, where WHT applies,
  compute and record the gross, the withheld amount, and the net paid, and export
  the data their filing needs. **Vantage does not file anything.**
- **Worker classification.** If recipients are in substance employees rather than
  participants or contractors, PAYE, NSSF and statutory health obligations arise.
  This is the customer's determination and their risk. The system records the
  classification the customer asserts, which protects both parties.
- **Your own tax.** Vantage's revenue is ordinary business income. Registration,
  VAT thresholds and eTIMS invoicing obligations apply to your business like any
  other. Get this right from the first invoice.

## Anti-money laundering

Because Vantage takes no custody, it is not obviously a reporting institution
under the Proceeds of Crime and Anti-Money Laundering Act, but confirm this,
particularly if the product ever moves toward higher-value payouts.

Regardless of obligation, the controls are good product:

- Per-item and per-batch limits
- Maker-checker on every disbursement
- Complete, immutable transaction history
- Exception reporting on unusual patterns: the same recipient across unrelated
  programmes, sudden amount changes, many payments to one number under different
  names

Optional sanctions and PEP screening is a Phase 3+ enterprise feature, not a v1
concern.

## Contracts and commercial protection

Before the first customer:

- **Master services agreement** with a **limitation of liability**. Money-adjacent
  software without a liability cap is an uncapped bet on your personal assets.
- **Explicit exclusion**: Vantage provides software; the customer is responsible
  for the accuracy of payout instructions and for their own regulatory and tax
  obligations.
- **DPA schedule** as above.
- **SLA** you can actually meet solo. Do not promise 24/7.
- **IP ownership** clearly retained by you, with a customer licence. Otherwise
  the first NGO contract may quietly assign them the product.
- **Professional indemnity insurance.** Get a quote before you need it.
- Operate through a **limited company**, not as a sole trader. Do not put personal
  assets behind a system that instructs payments.

## Pre-launch legal checklist

- [ ] Advocate has reviewed the no-custody model against current payments law
- [ ] Safaricom Daraja terms reviewed for third-party integration on a customer shortcode
- [ ] Limited company registered; contracting entity is the company
- [ ] ODPC registration position determined, and completed if required
- [ ] DPIA completed and filed
- [ ] DPA template drafted by counsel
- [ ] MSA with liability cap drafted by counsel
- [ ] Professional indemnity insurance quoted
- [ ] Tax advisor consulted on WHT support and your own eTIMS/VAT position
- [ ] Hosting confirmed in Kenya; every sub-processor listed and located
- [ ] Retention schedule agreed with the pilot customer and configured
- [ ] Breach runbook rehearsed once

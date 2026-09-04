# 05. Security

Vantage instructs the movement of other people's money and holds personal data
about people who never consented to us specifically. Both facts set the bar.

## Threat model

| Threat | Realistic? | Mitigation |
| --- | --- | --- |
| Stolen staff password → unauthorised payout | **Most likely attack** | MFA on approvers, step-up at approval, maker-checker, per-batch limits |
| Insider prepares and approves their own batch | High | Database constraint `approved_by <> prepared_by` |
| Insider edits history to hide a payment | Medium | Append-only audit chain, append-only gateway log, DB triggers blocking UPDATE/DELETE |
| Forged Daraja callback marking payouts confirmed | Medium | Secret callback path, IP allowlist, correlate to stored `ConversationID`, verify high-value via status query |
| Database dump leaks beneficiary PII | Medium | Field-level encryption of national IDs, master key outside DB, RLS, encrypted backups |
| Org M-Pesa credentials stolen from our DB | **Catastrophic** | Envelope encryption, key never in the database or the repo, no plaintext logging |
| Tenant isolation bug exposes another NGO's data | Medium | Org-scoped repositories + PostgreSQL RLS as backstop |
| Compromised dependency exfiltrates secrets | Medium | Lockfiles, `npm audit` in CI, minimal deps, no postinstall scripts |
| Misplaced decimal sends 10× the amount | **Very likely** | Per-item and per-batch limits, deviation warnings, maker-checker |

The top and bottom rows are the two that will actually happen. Design for them
first.

## Credential custody

The organisation's M-Pesa initiator credentials are the crown jewels. Whoever
holds them can move that organisation's money.

**Envelope encryption:**

```
Data key (random, per credential)
   → encrypts the credential payload    → credentials_ciphertext
Master key (held outside the database)
   → encrypts the data key              → stored alongside, with key id
```

Rules:

1. The master key **never** lives in the database, the repository, or an
   environment variable committed anywhere. It is supplied at process start
   (systemd credential, KMS, or an operator-entered secret held in memory).
2. Plaintext credentials exist only in process memory, only for the duration of a
   single Daraja call, and are zeroed after use.
3. Credentials are **never** logged, never included in error reports, never
   serialised into an API response. The pino redaction list covers them by path.
4. Rotation is supported: `credentials_key_id` records which master key wrapped
   each row, so keys can be rotated without downtime.
5. A `payout_channel` is verified with a zero-value or minimal test transaction
   before it can be used for a real batch.

**Customer-facing consequence:** if the organisation revokes the initiator in
their M-Pesa portal, Vantage instantly loses the ability to move their money. Say
this out loud in the sales conversation. It is reassuring, and it is true.

## Callback trust

Daraja result callbacks are unauthenticated HTTP POSTs to a URL you provide. Any
party who learns the URL can post to it. Treat them as **untrusted input that
hints at a state change**, never as authority.

Layers:

1. **Unguessable path**: `/callbacks/mpesa/:channelId/:callbackSecret`, where the
   secret is high-entropy and per-channel, rotatable.
2. **IP allowlist at nginx** for Safaricom's published callback ranges. Verify
   these against current Safaricom documentation and re-check periodically; they
   change.
3. **Correlation**: the callback must match a `ConversationID` we stored when we
   sent the request. Unmatched callbacks are logged and dropped.
4. **Idempotency**: an item already in a terminal state ignores further
   callbacks.
5. **Independent verification for high-value items**: above a configured
   threshold, confirm via Transaction Status Query rather than trusting the
   callback body alone.
6. **Persist before interpret**: the raw body is written to `gateway_message`
   before any parsing, so a malformed or hostile payload is still evidence.

## Authentication and authorisation

- Argon2id, sensible parameters, per-user salt
- Opaque session tokens in `httpOnly` `Secure` `SameSite=Lax` cookies; server-side
  session records with idle and absolute expiry
- **TOTP mandatory for the approver role**; optional but encouraged for everyone
- **Step-up re-authentication at approval**, regardless of session freshness
- Login rate limiting per account and per IP; lockout with notification
- Session invalidation on password change and on role change

### Roles

| Role | Can |
| --- | --- |
| Viewer | Read batches and packs |
| Preparer | Import, validate, edit, submit for approval |
| Approver | Everything Preparer can, plus approve, but **cannot approve own batch** |
| Admin | Manage members, channels, limits. **Cannot approve or prepare** |

Admin is deliberately excluded from the money path. Whoever administers access
should not also be able to move funds; that separation is what makes the control
meaningful.

## Data protection in the system

- **Minimise**: national ID is optional. If an organisation does not need it,
  the field stays empty. Do not collect what you do not need.
- **Encrypt sensitive fields**: national IDs are encrypted at rest at the column
  level with the same envelope scheme.
- **Redact in logs**: MSISDNs appear as `2547•••••123`. Names and IDs never
  appear in logs at all. The redaction list is unit-tested: a test asserts that
  a log line containing a full MSISDN fails the build.
- **RLS** on every tenant-scoped table as the isolation backstop.
- **Retention**: a scheduled job hard-deletes personal data past the
  organisation's retention horizon, keeping aggregate financial records. Donor
  requirements commonly demand seven years; that is a configuration, not a
  hardcode.
- **Export and erasure**: data subject requests are supported per-recipient. See
  [Compliance](06-compliance.md#data-subject-rights).
- **Crypto-shredding for append-only tables**: `gateway_message` payloads are
  encrypted under a per-recipient data key, so erasure destroys the key rather
  than the row. See
  [Data model](03-data-model.md#erasure-from-append-only-tables).

## Audit integrity

`audit_event` is hash-chained, **one chain per organisation**:

```
hash_n = SHA256( hash_{n-1} ‖ canonical_json(event_n) )
         where event_{n-1} is the previous event of the SAME organisation
```

- `UPDATE` and `DELETE` are blocked by trigger
- Routine verification runs from the latest `audit_checkpoint` forward; full
  genesis-to-head verification runs monthly and on demand
- The chain is verified nightly and again whenever a pack is generated
- The pack embeds the organisation's head hash, so a pack is falsifiable: tamper
  with history and the recomputed chain no longer matches the published hash
- Per-org chains mean one organisation's retention deletion can never invalidate
  another organisation's evidence

This is what converts "our system says it was paid" into something a donor
auditor can actually test.

## Application hardening

- Every route validated by TypeBox schema; response schemas act as PII allowlists
- Parameterised queries only: Prisma or explicit parameter binding, never string
  interpolation
- CSRF: `SameSite=Lax` cookies plus a token on state-changing routes
- Strict CSP, `HSTS`, `X-Content-Type-Options`, `Referrer-Policy` at nginx
- CORS closed to the application origin only
- Rate limits: global, per-IP, per-account, and a hard cap on approval attempts
- Uploads: size capped, parsed as text, never executed, stored outside the web root
- No secrets in the image; configuration by environment at runtime

## Operational security

- Least-privilege database roles: the app role cannot `DROP`, cannot read
  `pg_authid`, and RLS is enforced (not bypassed by ownership)
- Separate credentials for API, worker, and migrations
- SSH by key only, no password auth, no root login
- Backups encrypted at rest, stored off-site, **restore drilled quarterly and
  written down**
- Dependency updates weekly; `npm audit` gates CI
- Deployments are immutable images with a recorded git SHA

## Incident response

If a breach affecting personal data is suspected:

1. Contain: revoke sessions, disable affected channels
2. Preserve: snapshot logs, gateway messages, audit chain before remediation
3. Assess: what data, whose, how many
4. **Notify the ODPC within 72 hours** where the Data Protection Act requires it,
   and notify affected organisations without undue delay
5. Notify affected data subjects where there is a real risk to them
6. Written post-incident review

The Data Protection Act's notification clock is short. Rehearse this before you
need it. See [Compliance](06-compliance.md#breach-notification).

## Pre-launch checklist

- [ ] Master key held outside the database and outside the repo
- [ ] MFA enforced for every approver
- [ ] Maker-checker constraint present in a migration and tested
- [ ] Per-item and per-batch limits configured for the pilot organisation
- [ ] Callback IP allowlist verified against current Safaricom ranges
- [ ] Redaction test passing for MSISDN, name, national ID
- [ ] RLS enabled and verified with a cross-tenant read attempt
- [ ] Audit chain verification job scheduled
- [ ] Backup restore performed end-to-end at least once
- [ ] Double-pay property test green

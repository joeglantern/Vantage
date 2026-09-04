-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "organisation" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "odpc_reg_no" TEXT,
    "retention_days" INTEGER NOT NULL DEFAULT 2555,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organisation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "totp_secret_enc" BYTEA,
    "mfa_enabled" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "membership" (
    "id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payout_channel" (
    "id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "shortcode" TEXT NOT NULL,
    "initiator_name" TEXT NOT NULL,
    "credentials_ciphertext" BYTEA NOT NULL,
    "credentials_key_id" TEXT NOT NULL,
    "callback_secret" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "verified_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payout_channel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "programme" (
    "id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "programme_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recipient" (
    "id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "msisdn" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "national_id_enc" BYTEA,
    "external_ref" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recipient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recipient_key" (
    "recipient_id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "key_ciphertext" BYTEA NOT NULL,
    "key_id" TEXT NOT NULL,
    "destroyed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recipient_key_pkey" PRIMARY KEY ("recipient_id")
);

-- CreateTable
CREATE TABLE "payout_batch" (
    "id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "programme_id" UUID NOT NULL,
    "payout_channel_id" UUID NOT NULL,
    "reference" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'KES',
    "prepared_by" UUID NOT NULL,
    "approved_by" UUID,
    "approved_at" TIMESTAMPTZ(6),
    "snapshot" JSONB,
    "closed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payout_batch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payout_item" (
    "id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "batch_id" UUID NOT NULL,
    "recipient_id" UUID NOT NULL,
    "amount_minor" BIGINT NOT NULL,
    "status" TEXT NOT NULL,
    "originator_conversation_id" UUID NOT NULL,
    "conversation_id" TEXT,
    "mpesa_receipt" TEXT,
    "registered_name" TEXT,
    "failure_code" TEXT,
    "failure_reason" TEXT,
    "sent_at" TIMESTAMPTZ(6),
    "settled_at" TIMESTAMPTZ(6),
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payout_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gateway_message" (
    "id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "payout_item_id" UUID,
    "recipient_id" UUID,
    "direction" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "http_status" INTEGER,
    "payload_enc" BYTEA NOT NULL,
    "received_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gateway_message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_entry" (
    "id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "batch_id" UUID NOT NULL,
    "payout_item_id" UUID,
    "entry_type" TEXT NOT NULL,
    "amount_minor" BIGINT NOT NULL,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_entry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_event" (
    "id" BIGSERIAL NOT NULL,
    "organisation_id" UUID NOT NULL,
    "chain_seq" BIGINT NOT NULL,
    "actor_user_id" UUID,
    "action" TEXT NOT NULL,
    "subject_type" TEXT NOT NULL,
    "subject_id" UUID NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "correlation_id" UUID,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "prev_hash" BYTEA,
    "hash" BYTEA NOT NULL,

    CONSTRAINT "audit_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_checkpoint" (
    "id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "chain_seq" BIGINT NOT NULL,
    "hash" BYTEA NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_checkpoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reconciliation_pack" (
    "id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "batch_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "object_key" TEXT NOT NULL,
    "content_hash" BYTEA NOT NULL,
    "audit_head_hash" BYTEA NOT NULL,
    "audit_head_seq" BIGINT NOT NULL,
    "generated_by" UUID NOT NULL,
    "generated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "superseded_at" TIMESTAMPTZ(6),

    CONSTRAINT "reconciliation_pack_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE UNIQUE INDEX "membership_organisation_id_user_id_key" ON "membership"("organisation_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "payout_channel_id_organisation_id_key" ON "payout_channel"("id", "organisation_id");

-- CreateIndex
CREATE UNIQUE INDEX "programme_id_organisation_id_key" ON "programme"("id", "organisation_id");

-- CreateIndex
CREATE INDEX "recipient_organisation_id_msisdn_idx" ON "recipient"("organisation_id", "msisdn");

-- CreateIndex
CREATE UNIQUE INDEX "recipient_organisation_id_msisdn_key" ON "recipient"("organisation_id", "msisdn");

-- CreateIndex
CREATE UNIQUE INDEX "recipient_id_organisation_id_key" ON "recipient"("id", "organisation_id");

-- CreateIndex
CREATE UNIQUE INDEX "recipient_key_recipient_id_organisation_id_key" ON "recipient_key"("recipient_id", "organisation_id");

-- CreateIndex
CREATE UNIQUE INDEX "payout_batch_organisation_id_reference_key" ON "payout_batch"("organisation_id", "reference");

-- CreateIndex
CREATE UNIQUE INDEX "payout_batch_id_organisation_id_key" ON "payout_batch"("id", "organisation_id");

-- CreateIndex
CREATE INDEX "payout_item_batch_id_status_idx" ON "payout_item"("batch_id", "status");

-- CreateIndex
CREATE INDEX "payout_item_conversation_id_idx" ON "payout_item"("conversation_id");

-- CreateIndex
CREATE UNIQUE INDEX "payout_item_originator_conversation_id_key" ON "payout_item"("originator_conversation_id");

-- CreateIndex
CREATE UNIQUE INDEX "payout_item_batch_id_recipient_id_key" ON "payout_item"("batch_id", "recipient_id");

-- CreateIndex
CREATE UNIQUE INDEX "payout_item_id_organisation_id_key" ON "payout_item"("id", "organisation_id");

-- CreateIndex
CREATE INDEX "gateway_message_payout_item_id_received_at_idx" ON "gateway_message"("payout_item_id", "received_at");

-- CreateIndex
CREATE INDEX "ledger_entry_batch_id_entry_type_idx" ON "ledger_entry"("batch_id", "entry_type");

-- CreateIndex
CREATE INDEX "audit_event_organisation_id_occurred_at_idx" ON "audit_event"("organisation_id", "occurred_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "audit_event_organisation_id_chain_seq_key" ON "audit_event"("organisation_id", "chain_seq");

-- CreateIndex
CREATE UNIQUE INDEX "audit_checkpoint_organisation_id_chain_seq_key" ON "audit_checkpoint"("organisation_id", "chain_seq");

-- CreateIndex
CREATE UNIQUE INDEX "reconciliation_pack_batch_id_version_key" ON "reconciliation_pack"("batch_id", "version");

-- AddForeignKey
ALTER TABLE "membership" ADD CONSTRAINT "membership_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership" ADD CONSTRAINT "membership_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payout_channel" ADD CONSTRAINT "payout_channel_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "programme" ADD CONSTRAINT "programme_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipient" ADD CONSTRAINT "recipient_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipient_key" ADD CONSTRAINT "recipient_key_recipient_id_organisation_id_fkey" FOREIGN KEY ("recipient_id", "organisation_id") REFERENCES "recipient"("id", "organisation_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipient_key" ADD CONSTRAINT "recipient_key_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payout_batch" ADD CONSTRAINT "payout_batch_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payout_batch" ADD CONSTRAINT "payout_batch_programme_id_organisation_id_fkey" FOREIGN KEY ("programme_id", "organisation_id") REFERENCES "programme"("id", "organisation_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payout_batch" ADD CONSTRAINT "payout_batch_payout_channel_id_organisation_id_fkey" FOREIGN KEY ("payout_channel_id", "organisation_id") REFERENCES "payout_channel"("id", "organisation_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payout_batch" ADD CONSTRAINT "payout_batch_prepared_by_fkey" FOREIGN KEY ("prepared_by") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payout_batch" ADD CONSTRAINT "payout_batch_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payout_item" ADD CONSTRAINT "payout_item_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payout_item" ADD CONSTRAINT "payout_item_batch_id_organisation_id_fkey" FOREIGN KEY ("batch_id", "organisation_id") REFERENCES "payout_batch"("id", "organisation_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payout_item" ADD CONSTRAINT "payout_item_recipient_id_organisation_id_fkey" FOREIGN KEY ("recipient_id", "organisation_id") REFERENCES "recipient"("id", "organisation_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gateway_message" ADD CONSTRAINT "gateway_message_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gateway_message" ADD CONSTRAINT "gateway_message_payout_item_id_organisation_id_fkey" FOREIGN KEY ("payout_item_id", "organisation_id") REFERENCES "payout_item"("id", "organisation_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entry" ADD CONSTRAINT "ledger_entry_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entry" ADD CONSTRAINT "ledger_entry_batch_id_organisation_id_fkey" FOREIGN KEY ("batch_id", "organisation_id") REFERENCES "payout_batch"("id", "organisation_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entry" ADD CONSTRAINT "ledger_entry_payout_item_id_organisation_id_fkey" FOREIGN KEY ("payout_item_id", "organisation_id") REFERENCES "payout_item"("id", "organisation_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_event" ADD CONSTRAINT "audit_event_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_event" ADD CONSTRAINT "audit_event_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_checkpoint" ADD CONSTRAINT "audit_checkpoint_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reconciliation_pack" ADD CONSTRAINT "reconciliation_pack_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reconciliation_pack" ADD CONSTRAINT "reconciliation_pack_batch_id_organisation_id_fkey" FOREIGN KEY ("batch_id", "organisation_id") REFERENCES "payout_batch"("id", "organisation_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reconciliation_pack" ADD CONSTRAINT "reconciliation_pack_generated_by_fkey" FOREIGN KEY ("generated_by") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ============================================================================
-- Everything below is hand-written. Prisma cannot express check constraints,
-- partial indexes, triggers or row level security, and every guarantee this
-- system actually rests on is one of those four things.
--
-- Source: docs/03-data-model.md, docs/04-payout-lifecycle.md, docs/05-security.md.
-- Each constraint has an integration test that proves it rejects the bad case.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. Status and enum-like columns
--
-- docs/03 stores these as text. The application already refuses an illegal
-- value, but application checks get bypassed and constraints do not, so the
-- allowed set is written down here as well. These lists must stay in step with
-- src/domain/payout-item.ts and src/domain/payout-batch.ts.
-- ---------------------------------------------------------------------------

ALTER TABLE "payout_channel"
  ADD CONSTRAINT "payout_channel_kind_check"
  CHECK (kind IN ('mpesa_b2c'));

ALTER TABLE "membership"
  ADD CONSTRAINT "membership_role_check"
  CHECK (role IN ('viewer', 'preparer', 'approver', 'admin'));

ALTER TABLE "payout_batch"
  ADD CONSTRAINT "payout_batch_status_check"
  CHECK (status IN (
    'draft', 'validating', 'needs_fixes', 'pending_approval', 'approved',
    'disbursing', 'completed', 'completed_with_failures', 'closed', 'cancelled'
  ));

ALTER TABLE "payout_item"
  ADD CONSTRAINT "payout_item_status_check"
  CHECK (status IN (
    'pending', 'queued', 'sending', 'sent', 'unknown', 'confirmed', 'failed'
  ));

ALTER TABLE "gateway_message"
  ADD CONSTRAINT "gateway_message_direction_check"
  CHECK (direction IN ('outbound', 'inbound'));

ALTER TABLE "ledger_entry"
  ADD CONSTRAINT "ledger_entry_type_check"
  CHECK (entry_type IN ('obligation', 'disbursed', 'reversed', 'failed'));


-- ---------------------------------------------------------------------------
-- 2. Maker-checker
--
-- The approver must not be the preparer. This is the control that stands
-- between one compromised account and a disbursement, so it is enforced by the
-- database rather than by a code path that can be refactored away.
-- ---------------------------------------------------------------------------

ALTER TABLE "payout_batch"
  ADD CONSTRAINT "payout_batch_maker_checker_check"
  CHECK (approved_by IS NULL OR approved_by <> prepared_by);

-- An approved batch has an approver and a timestamp. Half-approved is not a
-- state the pack could honestly describe.
ALTER TABLE "payout_batch"
  ADD CONSTRAINT "payout_batch_approval_complete_check"
  CHECK (
    (approved_by IS NULL AND approved_at IS NULL)
    OR (approved_by IS NOT NULL AND approved_at IS NOT NULL)
  );


-- ---------------------------------------------------------------------------
-- 3. Money
--
-- Amounts are BIGINT minor units and must be positive. The whole-shilling rule
-- is rail-specific and unconditional only because v1 has exactly one rail:
-- when a second rail lands in Phase 3, denormalise channel_kind onto
-- payout_item and make this conditional on it. Do not simply drop it. See the
-- note in docs/03.
-- ---------------------------------------------------------------------------

ALTER TABLE "payout_item"
  ADD CONSTRAINT "payout_item_amount_positive_check"
  CHECK (amount_minor > 0);

ALTER TABLE "payout_item"
  ADD CONSTRAINT "payout_item_whole_shilling_check"
  CHECK (amount_minor % 100 = 0);

-- Ledger amounts may be negative: a reversal is a compensating row.
ALTER TABLE "ledger_entry"
  ADD CONSTRAINT "ledger_entry_amount_nonzero_check"
  CHECK (amount_minor <> 0);

ALTER TABLE "payout_batch"
  ADD CONSTRAINT "payout_batch_currency_check"
  CHECK (currency = 'KES');


-- ---------------------------------------------------------------------------
-- 4. Audit chain
--
-- One chain per organisation, each starting at 1. The unique index on
-- (organisation_id, chain_seq) is what stops two concurrent writers claiming
-- the same position and forking the chain.
-- ---------------------------------------------------------------------------

ALTER TABLE "audit_event"
  ADD CONSTRAINT "audit_event_chain_seq_positive_check"
  CHECK (chain_seq >= 1);

-- Only the first event in an organisation's chain has no predecessor.
ALTER TABLE "audit_event"
  ADD CONSTRAINT "audit_event_genesis_check"
  CHECK ((chain_seq = 1) = (prev_hash IS NULL));

ALTER TABLE "audit_event"
  ADD CONSTRAINT "audit_event_hash_length_check"
  CHECK (octet_length(hash) = 32 AND (prev_hash IS NULL OR octet_length(prev_hash) = 32));

ALTER TABLE "audit_checkpoint"
  ADD CONSTRAINT "audit_checkpoint_hash_length_check"
  CHECK (octet_length(hash) = 32);


-- ---------------------------------------------------------------------------
-- 5. The reconciliation sweep index
--
-- docs/03 calls this the query that runs most often and matters most: find
-- every item whose outcome nobody knows. A partial index keeps it small even
-- when the table is mostly confirmed rows.
-- ---------------------------------------------------------------------------

CREATE INDEX "payout_item_unresolved_idx"
  ON "payout_item" (status)
  WHERE status IN ('unknown', 'sending');

-- Same sweep, narrowed to one tenant, which is how the standing reconciliation
-- view actually reads it.
CREATE INDEX "payout_item_unresolved_by_org_idx"
  ON "payout_item" (organisation_id, updated_at)
  WHERE status IN ('unknown', 'sending');


-- ---------------------------------------------------------------------------
-- 6. Append-only tables
--
-- audit_event, gateway_message and ledger_entry are evidence. An UPDATE or
-- DELETE against them is not a supported operation, it is an attempt to edit
-- history, and the database refuses it outright.
--
-- Erasure does not need these rows deleted: gateway_message payloads are
-- encrypted under a per-recipient key, and erasure destroys the key instead.
-- See docs/03, "Erasure from append-only tables".
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION vantage_reject_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION
    '% is append-only: % is not permitted', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'restrict_violation',
          HINT = 'Corrections are new rows. Erasure destroys the recipient key, not the record.';
END;
$$;

CREATE TRIGGER "audit_event_append_only"
  BEFORE UPDATE OR DELETE ON "audit_event"
  FOR EACH ROW EXECUTE FUNCTION vantage_reject_mutation();

CREATE TRIGGER "gateway_message_append_only"
  BEFORE UPDATE OR DELETE ON "gateway_message"
  FOR EACH ROW EXECUTE FUNCTION vantage_reject_mutation();

CREATE TRIGGER "ledger_entry_append_only"
  BEFORE UPDATE OR DELETE ON "ledger_entry"
  FOR EACH ROW EXECUTE FUNCTION vantage_reject_mutation();

-- TRUNCATE bypasses row-level triggers, so it gets its own statement-level one.
CREATE TRIGGER "audit_event_no_truncate"
  BEFORE TRUNCATE ON "audit_event"
  FOR EACH STATEMENT EXECUTE FUNCTION vantage_reject_mutation();

CREATE TRIGGER "gateway_message_no_truncate"
  BEFORE TRUNCATE ON "gateway_message"
  FOR EACH STATEMENT EXECUTE FUNCTION vantage_reject_mutation();

CREATE TRIGGER "ledger_entry_no_truncate"
  BEFORE TRUNCATE ON "ledger_entry"
  FOR EACH STATEMENT EXECUTE FUNCTION vantage_reject_mutation();


-- ---------------------------------------------------------------------------
-- 7. Row level security
--
-- The org-scoped repository layer is the primary isolation mechanism. This is
-- the backstop, and it exists because application-only isolation is one
-- forgotten WHERE clause away from showing one NGO another NGO's
-- beneficiaries. RLS turns that into a database error instead of a breach
-- notification.
--
-- app.current_org is set per transaction. When it is unset, current_setting
-- returns NULL, the policy predicate evaluates to NULL, and no rows are
-- visible. Failing closed is the whole point.
--
-- FORCE is deliberate: without it the table owner bypasses its own policies,
-- and the application frequently connects as the owner.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION vantage_current_org()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('app.current_org', true), '')::uuid;
$$;

DO $$
DECLARE
  tenant_table text;
BEGIN
  FOREACH tenant_table IN ARRAY ARRAY[
    'membership',
    'payout_channel',
    'programme',
    'recipient',
    'recipient_key',
    'payout_batch',
    'payout_item',
    'gateway_message',
    'ledger_entry',
    'audit_event',
    'audit_checkpoint',
    'reconciliation_pack'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tenant_table);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', tenant_table);
    EXECUTE format(
      'CREATE POLICY %I ON %I USING (organisation_id = vantage_current_org())
         WITH CHECK (organisation_id = vantage_current_org())',
      tenant_table || '_tenant_isolation', tenant_table
    );
  END LOOP;
END;
$$;

-- ---------------------------------------------------------------------------
-- 8. Database roles
--
-- RLS is bypassed by superusers and by BYPASSRLS roles no matter what FORCE
-- says, so enabling the policies is only half the job: the application has to
-- connect as a role that cannot bypass them. docs/05 asks for least-privilege
-- roles that cannot DROP and cannot bypass RLS, and that is what these are.
--
-- The roles are NOLOGIN and password-less on purpose. Granting LOGIN and a
-- credential is an operator step, per environment, so no secret is ever
-- committed. The grants, which are the security-relevant part, are versioned
-- here with the schema.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'vantage_app') THEN
    CREATE ROLE vantage_app NOLOGIN;
  END IF;

  -- Migrations and the nightly chain verifier legitimately read across
  -- tenants. That is a named, auditable exemption, not an accident of
  -- ownership.
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'vantage_migrator') THEN
    CREATE ROLE vantage_migrator NOLOGIN BYPASSRLS;
  END IF;
END;
$$;

GRANT USAGE ON SCHEMA public TO vantage_app;

-- DML only. No DDL, so the application cannot DROP or ALTER anything, and the
-- append-only triggers cannot be disabled by the role that runs the app.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO vantage_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO vantage_app;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO vantage_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO vantage_app;

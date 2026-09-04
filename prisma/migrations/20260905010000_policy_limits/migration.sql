-- AlterTable
ALTER TABLE "organisation" ADD COLUMN     "deviation_warning_bps" INTEGER NOT NULL DEFAULT 5000,
ADD COLUMN     "per_batch_limit_minor" BIGINT NOT NULL DEFAULT 50000000,
ADD COLUMN     "per_item_limit_minor" BIGINT NOT NULL DEFAULT 2000000;

-- AlterTable
ALTER TABLE "payout_batch" ADD COLUMN     "per_batch_limit_minor" BIGINT,
ADD COLUMN     "per_item_limit_minor" BIGINT;


-- ---------------------------------------------------------------------------
-- Constraints for the policy limits.
--
-- These limits exist to catch a misplaced decimal, so a limit that is itself
-- nonsense would defeat the point. A zero or negative limit would block every
-- payout; a per-batch limit below the per-item limit is incoherent.
-- ---------------------------------------------------------------------------

ALTER TABLE "organisation"
  ADD CONSTRAINT "organisation_per_item_limit_positive_check"
  CHECK (per_item_limit_minor > 0);

ALTER TABLE "organisation"
  ADD CONSTRAINT "organisation_per_batch_limit_positive_check"
  CHECK (per_batch_limit_minor > 0);

ALTER TABLE "organisation"
  ADD CONSTRAINT "organisation_limits_coherent_check"
  CHECK (per_batch_limit_minor >= per_item_limit_minor);

-- Limits are amounts, and every amount in this system is whole shillings.
ALTER TABLE "organisation"
  ADD CONSTRAINT "organisation_limits_whole_shilling_check"
  CHECK (per_item_limit_minor % 100 = 0 AND per_batch_limit_minor % 100 = 0);

ALTER TABLE "organisation"
  ADD CONSTRAINT "organisation_deviation_bps_check"
  CHECK (deviation_warning_bps > 0 AND deviation_warning_bps <= 100000);

-- The frozen copy on the batch. Null until approval, both set together
-- afterwards, and an approved batch must carry them or the control attestation
-- in docs/07 has nothing truthful to print.
ALTER TABLE "payout_batch"
  ADD CONSTRAINT "payout_batch_limits_paired_check"
  CHECK (
    (per_item_limit_minor IS NULL AND per_batch_limit_minor IS NULL)
    OR (per_item_limit_minor IS NOT NULL AND per_batch_limit_minor IS NOT NULL)
  );

ALTER TABLE "payout_batch"
  ADD CONSTRAINT "payout_batch_limits_frozen_at_approval_check"
  CHECK (approved_by IS NULL OR per_item_limit_minor IS NOT NULL);

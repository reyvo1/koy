-- Additive failure reason on webhook deliveries. ASCII only. No model is dropped or renamed.
--
-- The column is nullable so the 29 rows already recorded stay valid: every existing attempt
-- either succeeded or failed for a reason that was never written down, and inventing one for
-- them would be a claim the database cannot support.
ALTER TABLE "webhook_deliveries" ADD COLUMN "reason" TEXT;
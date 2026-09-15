-- Wave 2 — durable notification delivery lease.
-- Delivery workers may overlap across API replicas, so PENDING rows are
-- atomically leased before external I/O. Stale leases can be recovered after
-- the bounded claim timeout without treating the timeout as delivery success.

ALTER TYPE "NotificationStatus" ADD VALUE IF NOT EXISTS 'DELIVERING';

ALTER TABLE "notifications"
  ADD COLUMN "deliveryLeaseId" TEXT,
  ADD COLUMN "deliveryLeaseAt" TIMESTAMP(3);

CREATE INDEX "notifications_status_deliveryLeaseAt_idx"
  ON "notifications"("status", "deliveryLeaseAt");

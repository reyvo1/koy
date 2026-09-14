-- Module 14 Slice 14.1 — Notification persistence foundation.
-- Tenant-bound notification domain: templates, recipient preferences, and a
-- durable delivery ledger with bounded retry state. No external email/webhook
-- adapter is wired; delivery attempts are recorded through an internal
-- transport abstraction that defaults to a no-op.

CREATE TABLE "notification_templates" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_templates_pkey" PRIMARY KEY ("id")
);

CREATE TYPE "NotificationChannel" AS ENUM ('WEBHOOK', 'EMAIL');
CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'EXHAUSTED');

CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "templateKey" TEXT,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "status" "NotificationStatus" NOT NULL DEFAULT 'PENDING',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "nextRetryAt" TIMESTAMP(3),
    "lastErrorCode" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "notification_templates_tenantId_key_key" ON "notification_templates"("tenantId", "key");
CREATE UNIQUE INDEX "notifications_tenantId_idempotencyKey_key" ON "notifications"("tenantId", "idempotencyKey");
CREATE INDEX "notifications_status_nextRetryAt_idx" ON "notifications"("status", "nextRetryAt");
CREATE INDEX "notifications_tenantId_createdAt_idx" ON "notifications"("tenantId", "createdAt");

CREATE TABLE "notification_preferences" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "notification_preferences_membershipId_channel_key" ON "notification_preferences"("membershipId", "channel");

ALTER TABLE "notification_templates" ADD CONSTRAINT "notification_templates_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_membership_fkey" FOREIGN KEY ("membershipId", "tenantId") REFERENCES "memberships"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

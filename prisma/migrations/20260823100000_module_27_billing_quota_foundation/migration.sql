-- Module 27 Slice 27.1 — Billing, subscription, usage & quota foundation.
-- Tenant-scoped plans, subscriptions, and usage counters with quota checks.

CREATE TYPE "SubscriptionPlanTier" AS ENUM ('FREE', 'STANDARD', 'ENTERPRISE');
CREATE TYPE "SubscriptionStatus" AS ENUM ('ACTIVE', 'CANCELLED', 'PAST_DUE');

CREATE TABLE "billing_plans" (
    "id" TEXT NOT NULL,
    "tier" "SubscriptionPlanTier" NOT NULL,
    "deviceQuota" INTEGER NOT NULL,
    "telemetryRetentionDays" INTEGER NOT NULL,
    "monthlyPriceCents" INTEGER NOT NULL,

    CONSTRAINT "billing_plans_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "billing_plans_tier_key" ON "billing_plans"("tier");

CREATE TABLE "billing_subscriptions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "currentPeriodStart" TIMESTAMP(3) NOT NULL,
    "currentPeriodEnd" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "billing_subscriptions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "billing_subscriptions_tenantId_key" ON "billing_subscriptions"("tenantId");

CREATE TABLE "billing_usage" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "deviceCount" INTEGER NOT NULL DEFAULT 0,
    "telemetryPoints" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "billing_usage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "billing_usage_tenant_period_key" ON "billing_usage"("tenantId", "periodStart");

ALTER TABLE "billing_subscriptions" ADD CONSTRAINT "billing_subscriptions_tenant_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "billing_subscriptions" ADD CONSTRAINT "billing_subscriptions_plan_fkey" FOREIGN KEY ("planId") REFERENCES "billing_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "billing_usage" ADD CONSTRAINT "billing_usage_tenant_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Seed default plans.
INSERT INTO "billing_plans" ("id", "tier", "deviceQuota", "telemetryRetentionDays", "monthlyPriceCents") VALUES
  ('plan-free', 'FREE', 10, 7, 0),
  ('plan-standard', 'STANDARD', 250, 90, 2900),
  ('plan-enterprise', 'ENTERPRISE', 10000, 365, 14900);

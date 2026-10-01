import { SuperAdminShell } from '@/components/super-admin-shell';
import SuperSubscriptionsContent from '@/components/super-subscriptions-content';

export const dynamic = 'force-dynamic';

/**
 * Quotas (blueprint §1) — the plan quota definitions.
 *
 * This page previously rendered the whole billing page, making it byte-identical to
 * /super/subscriptions apart from the heading — a second menu label over the same surface
 * rather than a second console item. It is now scoped to the plan/quota definitions that
 * actually justify a separate Quotas entry.
 *
 * Usage against quota is real, not deferred: `GET /admin/billing/subscriptions` already
 * returns persisted `BillingUsage` rows (`deviceCount`, `telemetryPoints` per tenant per
 * period), and this page renders the latest period per tenant next to its entitlement. An
 * earlier version of this comment claimed the usage read model did not exist — it does, and
 * the component simply was not declaring it.
 */
export default function QuotasPage() {
  return (
    <SuperAdminShell
      title="Quotas"
      subtitle="Kuota perangkat dan retensi telemetri per paket"
      active="/super/quotas"
    >
      <SuperSubscriptionsContent view="plans" />
    </SuperAdminShell>
  );
}

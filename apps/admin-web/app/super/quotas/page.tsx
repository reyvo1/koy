import { SuperAdminShell } from '@/components/super-admin-shell';
import SuperSubscriptionsContent from '@/components/super-subscriptions-content';

export const dynamic = 'force-dynamic';

/** Quotas page — same billing foundation, quota-focused heading. */
export default function QuotasPage() {
  return (
    <SuperAdminShell
      title="Quotas"
      subtitle="Kuota perangkat dan retensi telemetri per paket"
      active="/super/quotas"
    >
      <SuperSubscriptionsContent />
    </SuperAdminShell>
  );
}

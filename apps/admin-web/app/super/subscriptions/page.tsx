import { SuperAdminShell, SuperPage } from '@/components/super-admin-shell';
import SuperSubscriptionsContent from '@/components/super-subscriptions-content';

export const dynamic = 'force-dynamic';

/** Subscriptions page (blueprint §1) — live billing foundation. */
export default function SubscriptionsPage() {
  return (
    <SuperAdminShell
      title="Subscriptions"
      subtitle="Kelola langganan dan paket tenant"
      active="/super/subscriptions"
    >
      <SuperPage>
        <SuperSubscriptionsContent />
      </SuperPage>
    </SuperAdminShell>
  );
}

import { SuperAdminShell, SuperPage } from '@/components/super-admin-shell';
import SuperSubscriptionsContent from '@/components/super-subscriptions-content';

export const dynamic = 'force-dynamic';

/**
 * Subscriptions (blueprint §1) — the per-tenant subscription rows.
 *
 * Only the tenant subscription section is rendered here; the plan/quota definitions live on
 * /super/quotas. Both read the same billing tables, but showing the identical page under two
 * menu labels is not two console items.
 */
export default function SubscriptionsPage() {
  return (
    <SuperAdminShell
      title="Subscriptions"
      subtitle="Langganan tenant: paket, periode, dan status"
      active="/super/subscriptions"
    >
      <SuperPage>
        <SuperSubscriptionsContent view="subscriptions" />
      </SuperPage>
    </SuperAdminShell>
  );
}

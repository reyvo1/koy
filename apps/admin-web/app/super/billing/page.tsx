import { SuperAdminShell, SuperPage } from '@/components/super-admin-shell';
import SuperBillingContent from '@/components/super-billing-content';

export const dynamic = 'force-dynamic';

/** Billing page — live subscriptions & plans (Modul 27). */
export default function Page() {
  return (
    <SuperAdminShell
      title="Billing"
      subtitle="Paket, langganan, dan kuota semua tenant"
      active="/super/billing"
    >
      <SuperPage>
        <SuperBillingContent />
      </SuperPage>
    </SuperAdminShell>
  );
}

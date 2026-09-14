import { SuperAdminShell, SuperPage } from '@/components/super-admin-shell';
import SuperAlertsContent from '@/components/super-alerts-content';

export const dynamic = 'force-dynamic';

/** Alerts — WARNING/CRITICAL lintas-tenant (Modul 16 findings). */
export default function SuperAlertsPage() {
  return (
    <SuperAdminShell
      title="Alerts"
      subtitle="Peringatan & kritis dari deteksi analitik"
      active="/super/alerts"
    >
      <SuperPage>
        <SuperAlertsContent />
      </SuperPage>
    </SuperAdminShell>
  );
}

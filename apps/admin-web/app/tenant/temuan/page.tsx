import { TenantShell } from '@/components/tenant-shell';
import TenantAnalyticsFindingsContent from '@/components/tenant-analytics-findings-content';

export const dynamic = 'force-dynamic';

/** Canonical Module 16 analytics findings surface. Notification delivery stays separate. */
export default function Page() {
  return (
    <TenantShell
      title="Temuan Analitik"
      subtitle="Anomali dan rekomendasi yang tersimpan dari engine analytics"
      active="/tenant/temuan"
    >
      <TenantAnalyticsFindingsContent />
    </TenantShell>
  );
}

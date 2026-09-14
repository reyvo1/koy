import { SuperAdminShell } from '@/components/super-admin-shell';
import SuperMonitoringContent from '@/components/super-monitoring-content';

export const dynamic = 'force-dynamic';

/** Monitoring (blueprint §1) — live readiness probe + bounded workload. */
export default function SuperMonitoringPage() {
  return (
    <SuperAdminShell
      title="Monitoring"
      subtitle="Kesehatan infrastruktur platform"
      active="/super/monitoring"
    >
      <SuperMonitoringContent />
    </SuperAdminShell>
  );
}

import { TenantShell } from '@/components/tenant-shell';
import TenantHistoricalContent from '@/components/tenant-historical-content';

export const dynamic = 'force-dynamic';

/** Historical data (blueprint §2) — telemetry history & export. ui(v2). */
export default function Page() {
  return (
    <TenantShell
      title="Historis"
      subtitle="Data telemetri historis perangkat"
      active="/tenant/historis"
    >
      <TenantHistoricalContent />
    </TenantShell>
  );
}

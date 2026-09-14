import { TenantShell } from '@/components/tenant-shell';
import TenantHistoricalContent from '@/components/tenant-historical-content';

export const dynamic = 'force-dynamic';

/** Telemetry Charts (blueprint §2) — same live explorer, chart-first view. ui(v2). */
export default function Page() {
  return (
    <TenantShell
      title="Grafik Telemetri"
      subtitle="Riwayat dan agregasi data sensor"
      active="/tenant/grafik"
    >
      <TenantHistoricalContent />
    </TenantShell>
  );
}

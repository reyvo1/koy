import { TenantShell } from '@/components/tenant-shell';
import TenantReportsContent from '@/components/tenant-reports-content';

export const dynamic = 'force-dynamic';

/** Laporan & Export (blueprint §2) — CSV export dari data agregat live. ui(v2). */
export default function Page() {
  return (
    <TenantShell
      title="Laporan"
      subtitle="Ekspor data & laporan operasional"
      active="/tenant/laporan"
    >
      <TenantReportsContent />
    </TenantShell>
  );
}

import { TenantShell } from '@/components/tenant-shell';
import TenantDeviceGroupsContent from '@/components/tenant-device-groups-content';

export const dynamic = 'force-dynamic';

/** Device Groups (ADR-005) — tenant-scoped logical grouping backed by real API data. */
export default function GrupPerangkatPage() {
  return (
    <TenantShell
      title="Grup Perangkat"
      subtitle="Kelompokkan perangkat secara logis tanpa mengubah penempatan Ruangan"
      active="/tenant/grup-perangkat"
    >
      <TenantDeviceGroupsContent />
    </TenantShell>
  );
}

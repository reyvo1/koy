import { TenantShell } from '@/components/tenant-shell';
import DeviceDetailContent from '@/components/device-detail-content';

export const dynamic = 'force-dynamic';

/** Canonical tenant device detail route. */
export default function TenantDeviceDetailPage() {
  return (
    <TenantShell
      title="Detail Perangkat"
      subtitle="Informasi, capability, telemetry, dan perintah perangkat"
      active="/tenant/perangkat"
    >
      <DeviceDetailContent />
    </TenantShell>
  );
}

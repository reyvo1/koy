import { TenantShell } from '@/components/tenant-shell';
import TenantDevicesContent from '@/components/tenant-devices-content';

export const dynamic = 'force-dynamic';

/** Tenant Devices list (blueprint §2) — live, tenant-scoped. */
export default function Page() {
  return (
    <TenantShell
      title="Perangkat"
      subtitle="Semua perangkat terdaftar di tenant Anda"
      active="/tenant/perangkat"
    >
      <TenantDevicesContent />
    </TenantShell>
  );
}

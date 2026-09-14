import { SuperAdminShell, SuperPage } from '@/components/super-admin-shell';
import SuperDevicesContent from '@/components/super-devices-content';

export const dynamic = 'force-dynamic';

/** Devices page (blueprint §1 Device Management) — live list. */
export default function SuperDevicesPage() {
  return (
    <SuperAdminShell
      title="Devices"
      subtitle="Semua perangkat tenant terdaftar"
      active="/super/devices"
    >
      <SuperPage>
        <SuperDevicesContent />
      </SuperPage>
    </SuperAdminShell>
  );
}

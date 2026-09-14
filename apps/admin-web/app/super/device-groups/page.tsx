import { SuperAdminShell, SuperPage } from '@/components/super-admin-shell';
import SuperDeviceGroupsContent from '@/components/super-device-groups-content';

export const dynamic = 'force-dynamic';

export default function SuperDeviceGroupsPage() {
  return (
    <SuperAdminShell title="Device Groups" subtitle="Direktori grup perangkat lintas tenant · read-only" active="/super/device-groups">
      <SuperPage><SuperDeviceGroupsContent /></SuperPage>
    </SuperAdminShell>
  );
}

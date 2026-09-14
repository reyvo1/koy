import { SuperAdminShell, SuperPage } from '@/components/super-admin-shell';
import SuperDeviceCredentialsContent from '@/components/super-device-credentials-content';

export const dynamic = 'force-dynamic';

export default function SuperCredentialsPage() {
  return (
    <SuperAdminShell title="Device Credentials" subtitle="Metadata credential perangkat tanpa secret material" active="/super/credentials">
      <SuperPage><SuperDeviceCredentialsContent /></SuperPage>
    </SuperAdminShell>
  );
}

import { SuperAdminShell, SuperPage } from '@/components/super-admin-shell';
import SuperProvisioningContent from '@/components/super-provisioning-content';

export const dynamic = 'force-dynamic';

/** Provisioning page — real pairing-code flow (device ID + one-time token, 1 hour). */
export default function SuperProvisioningPage() {
  return (
    <SuperAdminShell title="Provisioning"
      subtitle="Onboarding perangkat baru via pairing code" active="/super/provisioning">
      <SuperPage>
        <SuperProvisioningContent />
      </SuperPage>
    </SuperAdminShell>
  );
}

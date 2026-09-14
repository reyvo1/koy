import { SuperAdminShell, SuperPage } from '@/components/super-admin-shell';
import SuperCapabilitiesContent from '@/components/super-capabilities-content';

export const dynamic = 'force-dynamic';

/** Capability Registry — semua capability lintas tenant (blueprint §1). */
export default function SuperCapabilitiesPage() {
  return (
    <SuperAdminShell
      title="Capability Registry"
      subtitle="Definisi & flag akses semua kemampuan perangkat"
      active="/super/capabilities"
    >
      <SuperPage>
        <SuperCapabilitiesContent />
      </SuperPage>
    </SuperAdminShell>
  );
}

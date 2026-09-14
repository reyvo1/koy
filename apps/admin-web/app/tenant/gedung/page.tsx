import { TenantShell } from '@/components/tenant-shell';
import TenantSpacesContent from '@/components/tenant-spaces-content';

export const dynamic = 'force-dynamic';

/** Buildings page (blueprint §2) — live Modul 17 space hierarchy. ui(v2). */
export default function GedungPage() {
  return (
    <TenantShell
      title="Gedung"
      subtitle="Bangunan di dalam lokasi tenant Anda"
      active="/tenant/gedung"
    >
      <TenantSpacesContent kind="BUILDING" />
    </TenantShell>
  );
}

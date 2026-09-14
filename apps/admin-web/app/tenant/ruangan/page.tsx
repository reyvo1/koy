import { TenantShell } from '@/components/tenant-shell';
import TenantSpacesContent from '@/components/tenant-spaces-content';

export const dynamic = 'force-dynamic';

/** Rooms page (blueprint §2) — live Modul 17 space hierarchy. ui(v2). */
export default function RuanganPage() {
  return (
    <TenantShell
      title="Ruangan"
      subtitle="Perangkat dikelompokkan per ruangan"
      active="/tenant/ruangan"
    >
      <TenantSpacesContent kind="ROOM" />
    </TenantShell>
  );
}

import { TenantShell } from '@/components/tenant-shell';
import TenantSpacesContent from '@/components/tenant-spaces-content';

export const dynamic = 'force-dynamic';

/** Locations page (blueprint §2) — top-level sites, Modul 17. ui(v2). */
export default function LokasiPage() {
  return (
    <TenantShell
      title="Lokasi"
      subtitle="Lokasi utama tempat perangkat terpasang"
      active="/tenant/lokasi"
    >
      <TenantSpacesContent kind="SITE" />
    </TenantShell>
  );
}

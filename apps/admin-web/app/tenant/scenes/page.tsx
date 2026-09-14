import { TenantShell } from '@/components/tenant-shell';
import TenantScenesContent from '@/components/tenant-scenes-content';

export const dynamic = 'force-dynamic';

/** Scenes (blueprint §2) — live Modul 12 scene list + run action. */
export default function Page() {
  return (
    <TenantShell
      title="Scene"
      subtitle="Aksi gabungan satu sentuhan"
      active="/tenant/scenes"
    >
      <TenantScenesContent />
    </TenantShell>
  );
}

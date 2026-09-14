import { TenantShell } from '@/components/tenant-shell';
import TenantUsersContent from '@/components/tenant-users-content';

export const dynamic = 'force-dynamic';

/** User Management tenant (blueprint §2). ui(v2) — live directory + provisioning. */
export default function PenggunaPage() {
  return (
    <TenantShell title="Pengguna" subtitle="Anggota tenant dan perannya" active="/tenant/pengguna">
      <TenantUsersContent />
    </TenantShell>
  );
}

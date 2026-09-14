import { SuperAdminShell, SuperPage } from '@/components/super-admin-shell';
import SuperUsersContent from '@/components/super-users-content';

export const dynamic = 'force-dynamic';

/** Users page (blueprint §1) — live bounded directory. */
export default function SuperUsersPage() {
  return (
    <SuperAdminShell
      title="User Management"
      subtitle="Semua pengguna platform — peran & status keanggotaan"
      active="/super/users"
    >
      <SuperPage>
        <SuperUsersContent />
      </SuperPage>
    </SuperAdminShell>
  );
}

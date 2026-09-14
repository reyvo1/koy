import { SuperAdminShell, SuperPage } from '@/components/super-admin-shell';
import SuperRolesContent from '@/components/super-roles-content';

export const dynamic = 'force-dynamic';

/** Roles — LIVE per-role user counts + permission matrix (Modul 20). */
export default function SuperRolesPage() {
  return (
    <SuperAdminShell title="Roles" subtitle="Peran & permission matrix"
      active="/super/roles">
      <SuperPage>
        <SuperRolesContent />
      </SuperPage>
    </SuperAdminShell>
  );
}

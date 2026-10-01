import { SuperAdminShell, SuperPage } from '@/components/super-admin-shell';
import SuperRolesContent from '@/components/super-roles-content';

export const dynamic = 'force-dynamic';

/**
 * Roles & Permissions (blueprint §1, User Management).
 *
 * The permission surface is read from the enforcement layer at runtime. It previously
 * rendered a hard-coded matrix (`dashboard:*, device:*, scene:*, …`) that matched no route
 * in the API; see `super-roles-content.tsx` for what that correction changed.
 */
export default function SuperRolesPage() {
  return (
    <SuperAdminShell
      title="Roles & Permissions"
      subtitle="Peran, custom role, dan permission yang benar-benar ditegakkan"
      active="/super/roles"
    >
      <SuperPage>
        <SuperRolesContent />
      </SuperPage>
    </SuperAdminShell>
  );
}

import { SuperAdminShell, SuperPage } from '@/components/super-admin-shell';
import SuperTenantsContent from '@/components/super-tenants-content';
import SuperOrganizationsContent from '@/components/super-organizations-content';

export const dynamic = 'force-dynamic';

/** Tenants page (blueprint §1) — live bounded directory. */
export default function SuperTenantsPage() {
  return (
    <SuperAdminShell
      title="Tenant Management"
      subtitle="Kelola seluruh tenant platform"
      active="/super/tenants"
    >
      <SuperPage>
        <SuperTenantsContent />
        <SuperOrganizationsContent />
      </SuperPage>
    </SuperAdminShell>
  );
}

import { TenantShell } from '@/components/tenant-shell';
import TenantWorkspaceContent from '@/components/tenant-workspace-content';

export const dynamic = 'force-dynamic';

/** Workspace — dashboards Modul 18 (list/detail/delete). */
export default function WorkspacePage() {
  return (
    <TenantShell
      title="Workspace"
      subtitle="Dasbor pribadi & yang dibagikan"
      active="/tenant/workspace"
    >
      <TenantWorkspaceContent />
    </TenantShell>
  );
}

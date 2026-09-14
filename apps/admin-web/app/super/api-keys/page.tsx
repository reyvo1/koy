import { SuperAdminShell, SuperPage } from '@/components/super-admin-shell';
import SuperApiKeysContent from '@/components/super-api-keys-content';

export const dynamic = 'force-dynamic';

/** API Keys page (blueprint §1) — live metadata only, never secrets. */
export default function ApiKeysPage() {
  return (
    <SuperAdminShell
      title="API Keys"
      subtitle="Kunci akses programatik tenant"
      active="/super/api-keys"
    >
      <SuperPage>
        <SuperApiKeysContent />
      </SuperPage>
    </SuperAdminShell>
  );
}

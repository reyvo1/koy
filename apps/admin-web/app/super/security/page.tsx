import { SuperAdminShell, SuperPage } from '@/components/super-admin-shell';
import SuperSecurityContent from '@/components/super-security-content';

export const dynamic = 'force-dynamic';

/** Security & Audit (blueprint §1) — live rbac/share audit logs. */
export default function SuperSecurityPage() {
  return (
    <SuperAdminShell
      title="Security & Audit"
      subtitle="Audit trail semua aksi sensitif"
      active="/super/security"
    >
      <SuperPage>
        <SuperSecurityContent />
        <p className="mt-4 text-[12px] text-slate-500">
          Sumber: rbac_audit_log + share_audit_log. Semua entri immutable.
        </p>
      </SuperPage>
    </SuperAdminShell>
  );
}

import { TenantShell } from '@/components/tenant-shell';
import TenantAutomationContent from '@/components/tenant-automation-content';

export const dynamic = 'force-dynamic';

/** Automation (blueprint §2) — rule engine status & rules. ui(v2). */
export default function Page() {
  return (
    <TenantShell
      title="Otomatisasi"
      subtitle="Aturan otomatis perangkat Anda"
      active="/tenant/otomatisasi"
    >
      <TenantAutomationContent />
    </TenantShell>
  );
}

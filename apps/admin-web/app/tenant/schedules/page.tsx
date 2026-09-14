import { TenantShell } from '@/components/tenant-shell';
import TenantSchedulesContent from '@/components/tenant-schedules-content';

export const dynamic = 'force-dynamic';

/** Schedules (blueprint §2) — jadwal otomatis perangkat. ui(v2). */
export default function Page() {
  return (
    <TenantShell
      title="Jadwal"
      subtitle="Jadwal eksekusi otomatis perangkat"
      active="/tenant/schedules"
    >
      <TenantSchedulesContent />
    </TenantShell>
  );
}

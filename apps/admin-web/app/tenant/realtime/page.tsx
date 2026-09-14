import { TenantShell } from '@/components/tenant-shell';
import TenantRealtimeContent from '@/components/tenant-realtime-content';

export const dynamic = 'force-dynamic';

/** Realtime Monitoring (blueprint §2) — live SSE + 24h aggregate chart. ui(v2). */
export default function Page() {
  return (
    <TenantShell
      title="Realtime Monitoring"
      subtitle="Telemetry dan status perangkat live"
      active="/tenant/realtime"
    >
      <TenantRealtimeContent />
    </TenantShell>
  );
}

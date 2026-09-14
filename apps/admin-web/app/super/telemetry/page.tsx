import { SuperAdminShell } from '@/components/super-admin-shell';
import TelemetryCenterContent from './telemetry-center-content';

export const dynamic = 'force-dynamic';

/** Telemetry Center (blueprint section 1). */
export default function Page() {
  return (
    <SuperAdminShell
      title="Telemetry Center"
      subtitle="Live, historical, explorer, export"
      active="/super/telemetry"
    >
      <TelemetryCenterContent />
    </SuperAdminShell>
  );
}

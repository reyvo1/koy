import { SuperAdminShell } from '@/components/super-admin-shell';
import SuperMonitoringContent from '@/components/super-monitoring-content';
import SuperWorkersPanel from '@/components/super-workers-panel';

export const dynamic = 'force-dynamic';

/**
 * Monitoring + Workers (blueprint §1).
 *
 * Readiness and workload live in SuperMonitoringContent; the Workers surface below reports
 * recorded metric families and states plainly where no liveness signal exists.
 */
export default function SuperMonitoringPage() {
  return (
    <SuperAdminShell
      title="Monitoring"
      subtitle="Kesehatan infrastruktur, worker & sinyal runtime"
      active="/super/monitoring"
    >
      <SuperMonitoringContent />
      <div className="mt-10 border-t border-slate-800 pt-8">
        <h2 className="m-0 text-[18px] font-bold text-white">Workers</h2>
        <p className="mb-5 mt-1 text-[12.5px] text-slate-400">
          Metrik yang benar-benar terekam oleh proses ini, dan worker yang memang tidak
          punya sinyal liveness.
        </p>
        <SuperWorkersPanel />
      </div>
    </SuperAdminShell>
  );
}

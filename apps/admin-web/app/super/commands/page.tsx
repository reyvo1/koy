import { SuperAdminShell, SuperPage } from '@/components/super-admin-shell';
import SuperCommandMonitorContent from '@/components/super-command-monitor-content';
import SuperCommandDispatchPanel from '@/components/super-command-dispatch-panel';

export const dynamic = 'force-dynamic';

/**
 * Command Monitor + platform dispatch (blueprint §1).
 *
 * The monitor is read-only. Dispatch is the deliberate, audited write path: it names the
 * target tenant explicitly and is fail-closed on the backend, so it is presented as a
 * separate, clearly labelled section rather than folded into the monitor.
 */
export default function SuperCommandsPage() {
  return (
    <SuperAdminShell
      title="Command Center"
      subtitle="Queue · ACK · terminal history lintas tenant, dan dispatch platform ter-audit"
      active="/super/commands"
    >
      <SuperPage>
        <SuperCommandMonitorContent />
        <div className="mt-10 border-t border-slate-800 pt-8">
          <h2 className="m-0 text-[18px] font-bold text-white">
            Dispatch platform
          </h2>
          <p className="mb-5 mt-1 text-[12.5px] text-slate-400">
            Kirim command ke device dalam tenant yang Anda sebut eksplisit. Melewati
            tenant isolation secara sadar dan tercatat di audit log.
          </p>
          <SuperCommandDispatchPanel />
        </div>
      </SuperPage>
    </SuperAdminShell>
  );
}

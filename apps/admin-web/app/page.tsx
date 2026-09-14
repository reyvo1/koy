import { OperationalSummaryExperience } from '../components/operational-summary-experience';
import { AutoForward } from '../components/auto-forward';

export const dynamic = 'force-dynamic';

/**
 * Compatibility landing page retained for the historical read-only contract.
 * Canonical day-to-day work continues under /tenant/*; JavaScript-enabled
 * clients are forwarded there automatically.
 */
export default function HomePage() {
  return (
    <div className="min-h-screen bg-[#0b1120] text-slate-200">
      <AutoForward href="/tenant/dashboard" />
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
        <span className="text-[13px] font-bold tracking-wide text-teal-300">
          IoT Platform
        </span>
        <span className="rounded-full bg-teal-500/10 px-3 py-1 text-[11px] font-bold text-teal-300">
          Read-only operations
        </span>
      </header>
      <main className="mx-auto max-w-6xl px-5 pb-10">
        <p className="mb-4 rounded-xl border border-teal-500/25 bg-teal-500/10 px-4 py-3 text-[13px] text-teal-300">
          Meneruskan ke konsol Tenant… —{' '}
          <a href="/tenant/dashboard" className="font-bold underline">
            buka sekarang
          </a>
        </p>
        <OperationalSummaryExperience />
      </main>
    </div>
  );
}

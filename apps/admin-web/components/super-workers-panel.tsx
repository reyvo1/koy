'use client';

/**
 * Workers & runtime signals — read from `GET /admin/platform-runtime-signals`.
 *
 * Blueprint §1 asks for a Workers surface (PostgreSQL, Redis, MQTT, Workers, API Health).
 * PostgreSQL/Redis/MQTT/API Health already come from `/health/ready` on the Monitoring page.
 * Workers are the missing part, and they are the ones that cannot honestly be drawn as
 * green/red tiles: the automation retry, scheduler and notification workers are on-demand
 * tick workers with no heartbeat and no liveness endpoint. A "worker healthy" tile would be
 * fabricated state.
 *
 * So this surface reports what is real and refuses to invent the rest:
 *   - every metric family this process actually recorded, with the recorded series values;
 *   - a family that has seen no events is marked `recorded: false`, never rendered as 0;
 *   - each worker's liveness signal is `null` where none exists, stated on the surface.
 */

import { useCallback, useEffect, useState } from 'react';
import { Activity, Cpu, MinusCircle } from 'lucide-react';

interface MetricSeries {
  labels: Record<string, string>;
  value: number;
  count?: number;
  sum?: number;
}

interface MetricFamily {
  name: string;
  help: string;
  type: 'counter' | 'histogram';
  recorded: boolean;
  series: MetricSeries[];
}

interface WorkerRow {
  worker: string;
  mode: string;
  livenessSignal: string | null;
  recorded: boolean;
  series: MetricSeries[];
}

interface RuntimePayload {
  recordedAt: string;
  workerLivenessContract: string;
  families: MetricFamily[];
  workers: WorkerRow[];
}

export default function SuperWorkersPanel() {
  const [payload, setPayload] = useState<RuntimePayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const response = await fetch('/api/super/runtime-signals', {
        cache: 'no-store',
      });
      if (!response.ok) throw new Error(`backend ${response.status}`);
      setPayload((await response.json()) as RuntimePayload);
    } catch (cause) {
      setPayload(null);
      setError(
        cause instanceof Error ? cause.message : 'sinyal runtime tidak dapat dimuat',
      );
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) {
    return (
      <div
        role="alert"
        className="flex items-start gap-3 rounded-2xl border border-red-500/25 bg-red-500/[.06] px-5 py-4"
      >
        <MinusCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
        <div>
          <p className="m-0 text-[13px] font-semibold text-red-200">
            Sinyal runtime tidak dapat dimuat ({error})
          </p>
          <p className="mb-0 mt-1 text-[12px] text-red-300/70">
            Status worker tidak dapat dibaca. Ini bukan berarti worker berjalan atau mati.
          </p>
        </div>
      </div>
    );
  }

  if (!payload) {
    return <div className="h-40 animate-pulse rounded-2xl bg-slate-800/50" />;
  }

  const recordedFamilies = payload.families.filter((family) => family.recorded);
  const silentFamilies = payload.families.filter((family) => !family.recorded);
  const signalWorkers = payload.workers.filter(
    (worker) => worker.livenessSignal !== null,
  );

  return (
    <div className="space-y-6">
      <section>
        <div className="mb-3 flex items-center gap-2">
          <Cpu className="h-4 w-4 text-slate-400" strokeWidth={2} />
          <h3 className="m-0 text-[16px] font-bold text-white">Worker</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] text-left text-[12.5px]">
            <thead className="border-b border-slate-800 text-[10.5px] uppercase tracking-wider text-slate-500">
              <tr>
                <th className="py-2 pr-4">Worker</th>
                <th className="pr-4">Mode</th>
                <th className="pr-4">Sinyal liveness</th>
                <th>Terukur</th>
              </tr>
            </thead>
            <tbody>
              {payload.workers.map((worker) => (
                <tr key={worker.worker} className="border-b border-slate-800/60">
                  <td className="py-3 pr-4 text-slate-200">{worker.worker}</td>
                  <td className="pr-4 font-mono text-[11px] text-slate-500">
                    {worker.mode}
                  </td>
                  <td className="pr-4">
                    {worker.livenessSignal ? (
                      <code className="font-mono text-[11px] text-teal-300">
                        {worker.livenessSignal}
                      </code>
                    ) : (
                      <span className="text-[11.5px] text-amber-400/80">
                        tidak ada
                      </span>
                    )}
                  </td>
                  <td>
                    {worker.livenessSignal ? (
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10.5px] font-bold ${
                          worker.recorded
                            ? 'bg-teal-500/10 text-teal-300'
                            : 'bg-slate-700/40 text-slate-400'
                        }`}
                      >
                        {worker.recorded ? 'ADA DATA' : 'BELUM ADA DATA'}
                      </span>
                    ) : (
                      <span className="text-[11.5px] text-slate-600">
                        UNAVAILABLE_BY_CONTRACT
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[11.5px] leading-relaxed text-slate-500">
          {payload.workerLivenessContract}
        </p>
      </section>

      <section>
        <div className="mb-3 flex items-center gap-2">
          <Activity className="h-4 w-4 text-slate-400" strokeWidth={2} />
          <h3 className="m-0 text-[16px] font-bold text-white">
            Metrik terekam
          </h3>
          <span className="text-[11.5px] text-slate-500">
            {recordedFamilies.length} aktif · {silentFamilies.length} belum pernah
            terekam
          </span>
        </div>
        {recordedFamilies.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-slate-700 px-5 py-6 text-center text-[12.5px] text-slate-500">
            Belum ada metrik terekam pada proses ini. Ini bukan angka nol — ini tidak
            ada observasi.
          </p>
        ) : (
          <div className="space-y-3">
            {recordedFamilies.map((family) => (
              <div
                key={family.name}
                className="rounded-2xl border border-slate-800/80 bg-[#111c2e] p-4"
              >
                <div className="flex flex-wrap items-baseline gap-2">
                  <code className="font-mono text-[12px] text-teal-300">
                    {family.name}
                  </code>
                  <span className="rounded bg-slate-800/70 px-1.5 py-0.5 text-[10.5px] uppercase text-slate-500">
                    {family.type}
                  </span>
                </div>
                <p className="mb-0 mt-1 text-[11.5px] text-slate-500">
                  {family.help}
                </p>
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {family.series.map((series, index) => (
                    <span
                      key={`${family.name}-${index}`}
                      className="rounded-lg bg-slate-800/60 px-2 py-1 font-mono text-[11px] text-slate-300"
                    >
                      {Object.entries(series.labels)
                        .map(([key, value]) => `${key}=${value}`)
                        .join(' ') || 'total'}{' '}
                      <span className="font-bold text-teal-300">
                        {family.type === 'histogram'
                          ? `${series.count ?? 0} / ${series.sum ?? 0}`
                          : series.value}
                      </span>
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {silentFamilies.length > 0 ? (
        <section>
          <h3 className="m-0 text-[13px] font-bold text-slate-400">
            Family metrik tanpa observasi
          </h3>
          <p className="mb-2 mt-1 text-[11.5px] text-slate-500">
            Family ini instrumented tetapi belum menerima event, jadi tidak ada nilai yang
            ditampilkan.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {silentFamilies.map((family) => (
              <code
                key={family.name}
                className="rounded bg-slate-800/50 px-1.5 py-0.5 font-mono text-[10.5px] text-slate-500"
              >
                {family.name}
              </code>
            ))}
          </div>
        </section>
      ) : null}

      {signalWorkers.length === 0 && recordedFamilies.length > 0 ? (
        <p className="m-0 text-[11.5px] text-slate-600">
          Proses ini merekam metrik, tetapi tidak ada worker dengan sinyal liveness
          terinstrumentasi.
        </p>
      ) : null}

      <p className="m-0 text-[11px] text-slate-600">
        Direkam {new Date(payload.recordedAt).toLocaleString('id-ID')} · sumber
        GET /admin/platform-runtime-signals (snapshot terstruktur dari MetricsService yang
        sama dengan /metrics).
      </p>
    </div>
  );
}

'use client';

/**
 * NOC / Control Room (blueprint §4) — global tiles from live operational
 * summary + readiness probe + realtime telemetry stream (SSE) + command
 * queue context. Fail-closed.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  CircleSlash,
  RadioTower,
  Server,
  Zap,
  Plug,
  Timer,
  Bell,
} from 'lucide-react';
import { CountUp, shadow } from '@/components/ui-polish';

interface Summary {
  generatedAt?: string;
  devices?: {
    total?: number;
    byStatus?: Record<string, number>;
    staleHeartbeat?: number;
  };
  commands?: { total?: number };
  capabilities?: { readable?: number; writable?: number };
}

interface StreamEvent {
  id: number;
  text: string;
}

export default function NocContent() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [ready, setReady] = useState<boolean | null>(null);
  const [events, setEvents] = useState<StreamEvent[]>([]);

  const probe = useCallback(async () => {
    try {
      const res = await fetch('/api/super/health');
      setReady((await res.json()).status === 'ready');
    } catch {
      setReady(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/admin/operational-summary')
      .then(async (res) => {
        if (!res.ok) throw new Error(`backend ${res.status}`);
        return res.json();
      })
      .then((data: Summary) => {
        if (!cancelled) setSummary(data);
      })
      .catch(() => {
        if (!cancelled) setSummary(null);
      });
    void probe();
    const timer = setInterval(() => void probe(), 30_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [probe]);

  // Live telemetry stream — first device with numeric capability.
  useEffect(() => {
    let source: EventSource | null = null;
    fetch('/api/admin/devices')
      .then(async (res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((data: unknown) => {
        const items = Array.isArray(data)
          ? data
          : ((data as { items?: Array<{ id: string }> }).items ?? []);
        const deviceId = items[0]?.id;
        if (!deviceId) return;
        source = new EventSource(`/api/admin/telemetry-stream?deviceId=${deviceId}`);
        source.addEventListener('telemetry', (event) => {
          try {
            const payload = JSON.parse((event as MessageEvent).data) as Record<string, unknown>;
            setEvents((prev) =>
              [
                {
                  id: Date.now(),
                  text:
                    `${new Date().toLocaleTimeString('id-ID')} · ` +
                    Object.entries(payload)
                      .slice(0, 3)
                      .map(([k, v]) => `${k}=${String(v)}`)
                      .join(' '),
                },
                ...prev,
              ].slice(0, 20),
            );
          } catch {
            /* ignore malformed frame */
          }
        });
      })
      .catch(() => {
        /* fail-closed: stream stays empty */
      });
    return () => {
      source?.close();
    };
  }, []);

  const byStatus = summary?.devices?.byStatus ?? {};
  const online = byStatus.ONLINE ?? byStatus.ACTIVE ?? 0;
  const total = summary?.devices?.total ?? 0;
  const offline = Math.max(total - online - (summary?.devices?.staleHeartbeat ?? 0), 0);

  const tiles: Array<[string, string, typeof Activity]> = [
    ['Devices Online', String(online), Activity],
    ['Devices Offline', String(offline), CircleSlash],
    ['Total Perangkat', String(total), RadioTower],
    ['Backend Ready', ready === null ? '…' : ready ? 'YA' : 'TIDAK', Server],
    ['Perintah Terkirim', String(summary?.commands?.total ?? 0), Zap],
    ['Capability Readable', String(summary?.capabilities?.readable ?? 0), Plug],
    ['Heartbeat Stale', String(summary?.devices?.staleHeartbeat ?? 0), Timer],
    ['Alerts Active', String(events.length > 0 ? events.length : 0), Bell],
  ];

  return (
    <div className="space-y-5">
      {/* Global tiles */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {tiles.map(([label, value, Icon]) => (
          <div
            key={label}
            className={`rounded-2xl border border-slate-800/80 bg-[#111c2e] p-5 transition-all duration-200 ease-out hover:-translate-y-1 hover:border-teal-500/30 ${shadow.card} ${shadow.cardHover}`}
          >
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-teal-500/10">
              <Icon className="h-4.5 w-4.5 text-teal-300" strokeWidth={1.8} />
            </span>
            <div className="mt-3 text-[12px] font-medium uppercase tracking-wide text-slate-400">{label}</div>
            <div className="text-[26px] font-extrabold tabular-nums text-white">
              {/^\d+$/.test(value) ? <CountUp value={parseInt(value, 10)} /> : value}
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* World map placeholder — device GPS contract belum ada */}
        <div className="iot2-panel on-dark rounded-2xl border-slate-800/80 bg-[#111c2e] p-5">
          <h3 className="m-0 mb-2 text-[15px] font-bold text-white">World Map</h3>
          <div className="grid h-[220px] place-items-center rounded-xl border border-dashed border-slate-700/70 text-center">
            <span className="text-slate-500">
              Peta global menunggu kontrak lokasi perangkat
              <br />
              (model DeviceLocation tersedia, UI peta menyusul).
            </span>
          </div>
        </div>

        {/* Live telemetry stream */}
        <div className="iot2-panel on-dark rounded-2xl border-slate-800/80 bg-[#111c2e] p-5">
          <h3 className="m-0 mb-2 flex items-center gap-2 text-[15px] font-bold text-white">
            Live Telemetry Stream
            <span
              className={`h-2 w-2 rounded-full ${events.length > 0 ? 'animate-pulse bg-emerald-400' : 'bg-slate-600'}`}
            />
          </h3>
          <div className="h-[220px] overflow-y-auto rounded-xl border border-dashed border-slate-700/70 p-3">
            {events.length === 0 ? (
              <span className="text-slate-500">
                Menunggu event telemetry…
              </span>
            ) : (
              <ul className="m-0 list-none space-y-1.5 p-0 font-mono text-[11.5px] text-teal-300">
                {events.map((event) => (
                  <li key={event.id}>{event.text}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

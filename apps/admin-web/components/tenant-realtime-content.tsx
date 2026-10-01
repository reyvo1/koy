'use client';

/**
 * Tenant Realtime Monitoring content (blueprint §2) — live telemetry via
 * SSE (useTelemetryStream) + 24h aggregate chart per device.
 * Domain-bound: /api/admin/devices + /api/admin/telemetry-chart only.
 * ui(v2): iot2-panel, iot2-badge, iot2-search tokens applied.
 */

import { useEffect, useMemo, useState } from 'react';
import { Activity, ServerCrash } from 'lucide-react';
import { useTelemetryStream } from '@/lib/use-telemetry-stream';

interface DeviceRow {
  id: string;
  name?: string;
  type?: string;
  status?: string;
}

interface Bucket {
  start?: string;
  avg?: number;
}

const W = 560;
const H = 200;
const PAD = { l: 34, r: 12, t: 14, b: 22 };

function Chart({
  buckets,
  live,
}: {
  buckets: Bucket[];
  live: { value: number | null; connected: boolean };
}) {
  const values = buckets.map((b) => b.avg ?? 0);
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const span = max - min || 1;

  const points = buckets.map((b, i) => {
    const x = PAD.l + (i / Math.max(buckets.length - 1, 1)) * (W - PAD.l - PAD.r);
    const y = H - PAD.b - ((b.avg ?? 0) - min) / span * (H - PAD.t - PAD.b);
    return `${x},${y}`;
  });

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Grafik telemetri 24 jam">
        <line x1={PAD.l} y1={H - PAD.b} x2={W - PAD.r} y2={H - PAD.b} stroke="var(--iot-color-border)" />
        <line x1={PAD.l} y1={PAD.t} x2={PAD.l} y2={H - PAD.b} stroke="var(--iot-color-border)" />
        <polyline points={points.join(' ')} fill="none" stroke="var(--iot-color-accent)" strokeWidth={2} />
      </svg>
      <div className="mt-1 flex items-center gap-2 text-[12px]" style={{ color: 'var(--iot-color-muted)' }}>
        <span
          className={`h-2 w-2 rounded-full ${live.connected ? 'animate-pulse bg-emerald-500' : 'bg-slate-300'}`}
        />
        {live.connected ? 'Live' : 'Menunggu data realtime'}
        {live.value !== null && (
          <span className="ml-auto font-semibold" style={{ color: 'var(--iot-color-accent)' }}>
            {live.value}
          </span>
        )}
      </div>
    </div>
  );
}

export default function TenantRealtimeContent() {
  const [devices, setDevices] = useState<DeviceRow[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [buckets, setBuckets] = useState<Bucket[]>([]);
  const [loadingChart, setLoadingChart] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/admin/devices')
      .then(async (res) => {
        if (!res.ok) throw new Error(`backend ${res.status}`);
        return res.json();
      })
      .then((data: unknown) => {
        if (cancelled) return;
        const items = Array.isArray(data)
          ? (data as DeviceRow[])
          : ((data as { items?: DeviceRow[] }).items ?? []);
        setDevices(items);
        if (items.length > 0 && !cancelled) setSelectedId(items[0].id);
      })
      .catch((cause: unknown) => {
        if (!cancelled)
          setError(cause instanceof Error ? cause.message : 'gagal memuat');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const stream = useTelemetryStream(selectedId);
  const liveValue = useMemo(() => {
    const raw = stream?.data;
    if (raw === null || raw === undefined) return null;
    const n =
      typeof raw === 'number'
        ? raw
        : typeof raw === 'object' && raw !== null && 'value' in raw
          ? Number((raw as { value: unknown }).value)
          : NaN;
    return Number.isFinite(n) ? Math.round(n * 10) / 10 : null;
  }, [stream]);

  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    setLoadingChart(true);
    fetch(`/api/admin/telemetry-chart?deviceId=${selectedId}&range=24h`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`backend ${res.status}`);
        return res.json();
      })
      .then((data: { buckets?: Bucket[] }) => {
        if (!cancelled) setBuckets(data.buckets ?? []);
      })
      .catch(() => {
        if (!cancelled) setBuckets([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingChart(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  if (error) {
    return (
      <div className="iot2-panel flex flex-col items-center py-14 text-center">
        <span className="grid h-16 w-16 place-items-center rounded-2xl bg-slate-100">
          <ServerCrash className="h-8 w-8 text-slate-400" strokeWidth={1.5} />
        </span>
        <p className="mb-0 mt-5 text-[15px] font-bold">Data realtime tidak tersedia</p>
        <p className="mt-2 mb-0 text-[13px]" style={{ color: 'var(--iot-color-muted)' }}>
          Backend ({error}). Coba lagi nanti.
        </p>
      </div>
    );
  }

  if (!devices) {
    return (
      <div className="iot2-panel">
        <div className="h-64 animate-pulse rounded-xl bg-slate-200/70" />
      </div>
    );
  }

  const selected = devices.find((d) => d.id === selectedId);
  const selectedStatus = (selected?.status ?? '').toUpperCase();
  const badgeCls =
    selectedStatus === 'ONLINE' || selectedStatus === 'ACTIVE'
      ? 'iot2-badge--online'
      : 'iot2-badge--offline';

  return (
    <div className="space-y-5">
      {/* Device selector chips */}
      <div className="flex flex-wrap gap-2">
        {devices.slice(0, 12).map((device) => (
          <button
            key={device.id}
            onClick={() => setSelectedId(device.id)}
            className={`rounded-full px-4 py-1.5 text-[12.5px] font-semibold transition-all duration-150 hover:-translate-y-px ${
              device.id === selectedId
                ? 'text-white shadow-md'
                : 'bg-white text-slate-500 shadow-sm ring-1 ring-slate-200 hover:text-teal-700'
            }`}
            style={device.id === selectedId ? { background: 'var(--iot-color-accent)' } : {}}
          >
            {device.name ?? device.id.slice(0, 8)}
          </button>
        ))}
      </div>

      <div className="iot2-panel">
        <div className="mb-4 flex items-baseline justify-between gap-3">
          <h2 className="m-0 text-[16.5px] font-bold tracking-tight">
            {selected?.name ?? '—'} · 24 jam terakhir
          </h2>
          <span className={`iot2-badge ${badgeCls}`}>
            {(selected?.status ?? '—').toUpperCase()}
          </span>
        </div>
        {loadingChart ? (
          <div className="h-[200px] animate-pulse rounded-xl bg-slate-100" />
        ) : (
          <Chart buckets={buckets} live={{ value: liveValue, connected: stream.connected }} />
        )}
      </div>

      {/* Empty-state hint */}
      <div className="flex items-center gap-3 rounded-xl border border-dashed border-slate-300 px-4 py-3">
        <Activity className="h-4 w-4 shrink-0" style={{ color: 'var(--iot-color-accent)' }} strokeWidth={2} />
        <p className="m-0 text-[12.5px]" style={{ color: 'var(--iot-color-muted)' }}>
          Data realtime mengalir via SSE setelah perangkat online dan mengirim heartbeat.
        </p>
      </div>
    </div>
  );
}

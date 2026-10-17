'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SeriesChart } from '@iot-platform/design-system';
import { SuperPage } from '@/components/super-admin-shell';
import { createLoadGuard } from '@/lib/safe-fetch';

interface Bucket { start: string; end: string; count: number; min: number; max: number; avg: number; }
interface DeviceRow { id: string; name: string; status: string; tenantName?: string | null; }
interface CapabilityRow { id: string; deviceId?: string | null; key: string; dataType: string; isReadable: boolean; isReportable: boolean; }
interface TelemetryRow { id: string; eventId: string; createdAt: string; payload: Record<string, unknown>; capability: string | null; value: unknown; }

export default function SuperTelemetryPage() {
  const [devices, setDevices] = useState<DeviceRow[]>([]);
  const [capabilities, setCapabilities] = useState<CapabilityRow[]>([]);
  const [deviceId, setDeviceId] = useState('');
  const [capabilityKey, setCapabilityKey] = useState('');
  const [buckets, setBuckets] = useState<Bucket[]>([]);
  const [explorerRows, setExplorerRows] = useState<TelemetryRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [explorerLoading, setExplorerLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch('/api/super/platform-devices').then(async (res) => { if (!res.ok) throw new Error(`device directory ${res.status}`); return res.json().catch(() => { throw new Error('Backend mengembalikan respons yang tidak dapat dibaca.'); }); }),
      fetch('/api/super/capabilities').then(async (res) => { if (!res.ok) throw new Error(`capability registry ${res.status}`); return res.json().catch(() => { throw new Error('Backend mengembalikan respons yang tidak dapat dibaca.'); }); }),
    ]).then(([devicePayload, capabilityPayload]) => {
      if (cancelled) return;
      const deviceList: DeviceRow[] = Array.isArray(devicePayload) ? devicePayload : (devicePayload.items ?? []);
      const capabilityList: CapabilityRow[] = (Array.isArray(capabilityPayload) ? capabilityPayload : (capabilityPayload.items ?? [])).filter((cap: CapabilityRow) => Boolean(cap.deviceId) && cap.isReadable && cap.isReportable);
      setDevices(deviceList); setCapabilities(capabilityList);
      const first = capabilityList[0];
      if (first?.deviceId) { setDeviceId(first.deviceId); setCapabilityKey(first.key); }
      else if (deviceList[0]) setDeviceId(deviceList[0].id);
    }).catch((cause: unknown) => { if (!cancelled) setError(cause instanceof Error ? cause.message : 'gagal memuat registry platform'); });
    return () => { cancelled = true; };
  }, []);

  const deviceCapabilities = useMemo(() => capabilities.filter((cap) => cap.deviceId === deviceId), [capabilities, deviceId]);
  const numericCapabilities = useMemo(() => deviceCapabilities.filter((cap) => cap.dataType === 'number' || cap.dataType === 'integer'), [deviceCapabilities]);
  useEffect(() => {
    if (!deviceId) return setCapabilityKey('');
    if (!deviceCapabilities.some((cap) => cap.key === capabilityKey)) setCapabilityKey(deviceCapabilities[0]?.key ?? '');
  }, [deviceCapabilities, deviceId, capabilityKey]);

  const chartGuard = useRef(createLoadGuard());
  const loadChart = useCallback(async () => {
    const isCurrent = chartGuard.current.begin();
    if (!deviceId || !capabilityKey || !numericCapabilities.some((cap) => cap.key === capabilityKey)) { setBuckets([]); return; }
    setLoading(true); setError(null);
    try {
      const query = new URLSearchParams({ deviceId, capability: capabilityKey, hours: '24' });
      const response = await fetch(`/api/super/telemetry-chart?${query}`); const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error?.message ?? `telemetry backend ${response.status}`);
      if (!isCurrent()) return;
      setBuckets(Array.isArray(body.buckets) ? body.buckets : []);
    } catch (cause) {
      if (!isCurrent()) return;
      setBuckets([]); setError(cause instanceof Error ? cause.message : 'telemetry tidak tersedia');
    }
    finally { if (isCurrent()) setLoading(false); }
  }, [capabilityKey, deviceId, numericCapabilities]);

  const explorerGuard = useRef(createLoadGuard());
  const loadExplorer = useCallback(async () => {
    const isCurrent = explorerGuard.current.begin();
    if (!deviceId) { setExplorerRows([]); return; }
    setExplorerLoading(true); setError(null);
    try {
      const query = new URLSearchParams({ deviceId, limit: '150' }); if (capabilityKey) query.set('capability', capabilityKey);
      const response = await fetch(`/api/super/telemetry-explorer?${query}`); const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error?.message ?? `explorer backend ${response.status}`);
      if (!isCurrent()) return;
      setExplorerRows(Array.isArray(body.items) ? body.items : []);
    } catch (cause) {
      if (!isCurrent()) return;
      setExplorerRows([]); setError(cause instanceof Error ? cause.message : 'telemetry explorer tidak tersedia');
    }
    finally { if (isCurrent()) setExplorerLoading(false); }
  }, [capabilityKey, deviceId]);

  useEffect(() => { void loadChart(); void loadExplorer(); }, [loadChart, loadExplorer]);

  const exportCsv = () => {
    if (!explorerRows.length) return;
    const rows = explorerRows.map((row) => [row.createdAt, row.eventId, capabilityKey || '*', capabilityKey ? JSON.stringify(row.value) : JSON.stringify(row.payload)]);
    const csv = [['created_at','event_id','capability','value_or_payload'], ...rows].map((row) => row.map(csvCell).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); const a = document.createElement('a'); a.href = url; a.download = `telemetry-${deviceId}-${capabilityKey || 'all'}.csv`; a.click(); URL.revokeObjectURL(url);
  };

  const selectedDevice = devices.find((device) => device.id === deviceId);
  const chartSeries = useMemo(() => [{ key: capabilityKey || 'avg', label: capabilityKey || 'Rata-rata', points: buckets.map((bucket) => ({ at: bucket.start, value: bucket.avg })) }], [buckets, capabilityKey]);
  const chartBand = useMemo(() => (buckets.length > 1
    ? {
        upper: buckets.map((bucket) => ({ at: bucket.start, value: bucket.max })),
        lower: buckets.map((bucket) => ({ at: bucket.start, value: bucket.min })),
      }
    : undefined), [buckets]);

  return (
    <div className="space-y-5">
      <SuperPage>
        <div className="mb-5 flex flex-wrap items-center gap-3">
          <select value={deviceId} onChange={(e) => setDeviceId(e.target.value)} className="rounded-xl border border-slate-700 bg-slate-900/70 px-4 py-2.5 text-sm text-slate-200 outline-none focus:border-teal-500/50">{devices.map((device) => <option key={device.id} value={device.id}>{device.name}{device.tenantName ? ` · ${device.tenantName}` : ''}</option>)}</select>
          <select value={capabilityKey} onChange={(e) => setCapabilityKey(e.target.value)} disabled={!deviceCapabilities.length} className="rounded-xl border border-slate-700 bg-slate-900/70 px-4 py-2.5 text-sm text-slate-200 outline-none focus:border-teal-500/50 disabled:opacity-50"><option value="">Semua payload</option>{deviceCapabilities.map((cap) => <option key={cap.id} value={cap.key}>{cap.key} · {cap.dataType}</option>)}</select>
          <button type="button" onClick={() => { void loadChart(); void loadExplorer(); }} disabled={!deviceId || loading || explorerLoading} className="rounded-xl bg-teal-500/15 px-4 py-2.5 text-[13px] font-bold text-teal-300 hover:bg-teal-500/25 disabled:opacity-50">{loading || explorerLoading ? 'Memuat…' : '↻ Refresh'}</button>
        </div>
        {error ? <p role="alert" className="mb-4 rounded-xl border border-red-500/25 bg-red-500/5 px-4 py-2.5 text-[13px] text-red-300">{error}</p> : null}
        <h2 className="mb-3 text-[15px] font-bold text-white">Aggregate 24 jam</h2>
        {!deviceId ? <StateBox title="Belum ada perangkat pada platform" /> : !capabilityKey || !numericCapabilities.some((cap) => cap.key === capabilityKey) ? <StateBox title="Pilih capability numerik untuk grafik aggregate" detail={`${selectedDevice?.name ?? 'Perangkat'} dapat tetap dieksplor di tabel raw evidence di bawah.`} /> : loading ? <div className="h-[220px] animate-pulse rounded-xl bg-slate-800/40" /> : buckets.length === 0 ? <StateBox title="Belum ada aggregate telemetry pada 24 jam terakhir" /> : (
          <div className="rounded-xl border border-slate-800/60 p-4">
            <SeriesChart ariaLabel={`Grafik aggregate telemetry ${capabilityKey}`} band={chartBand} series={chartSeries} />
          </div>
        )}
      </SuperPage>

      <SuperPage>
        <div className="mb-4 flex flex-wrap items-center gap-3"><div><h2 className="m-0 text-[15px] font-bold text-white">Telemetry Explorer</h2><p className="mt-1 text-[11.5px] text-slate-500">Bounded evidence rows dari device terpilih; capability divalidasi terhadap registry.</p></div><button type="button" onClick={exportCsv} disabled={!explorerRows.length} className="ml-auto rounded-xl border border-teal-500/30 bg-teal-500/10 px-4 py-2 text-[12.5px] font-bold text-teal-300 disabled:opacity-40">Export CSV</button></div>
        {explorerLoading ? <div className="h-40 animate-pulse rounded-xl bg-slate-800/40" /> : explorerRows.length === 0 ? <StateBox title="Tidak ada telemetry evidence pada pilihan ini" /> : <div className="max-h-[480px] overflow-auto rounded-xl border border-slate-800/80"><table className="min-w-full text-left text-[11.5px]"><thead className="sticky top-0 bg-slate-900 text-[10px] uppercase tracking-wide text-slate-500"><tr><th className="px-3 py-2.5">Waktu</th><th className="px-3 py-2.5">Event</th><th className="px-3 py-2.5">Value / Payload</th></tr></thead><tbody>{explorerRows.map((row) => <tr key={row.id} className="border-t border-slate-800/70"><td className="whitespace-nowrap px-3 py-2.5 text-slate-500">{new Date(row.createdAt).toLocaleString('id-ID')}</td><td className="px-3 py-2.5"><code className="text-slate-500">{row.eventId}</code></td><td className="px-3 py-2.5"><code className="text-teal-300">{JSON.stringify(capabilityKey ? row.value : row.payload)}</code></td></tr>)}</tbody></table></div>}
      </SuperPage>
    </div>
  );
}
function csvCell(value: unknown) { return `"${String(value ?? '').replace(/"/g, '""')}"`; }
function StateBox({ title, detail }: { title: string; detail?: string }) { return <div className="rounded-xl border border-dashed border-slate-700/70 py-10 text-center"><p className="m-0 text-[13.5px] text-slate-500">{title}</p>{detail ? <p className="mt-1 text-[11.5px] text-slate-600">{detail}</p> : null}</div>; }

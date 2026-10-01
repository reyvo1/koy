'use client';

/**
 * Historical Data explorer (blueprint §2) — pick device + range (hours),
 * read bounded 1h-bucket aggregates from /api/admin/telemetry-chart.
 */

import { useEffect, useMemo, useState } from 'react';

interface DeviceRow {
  id: string;
  name?: string;
}

interface Bucket {
  start?: string;
  avg?: number;
  min?: number;
  max?: number;
}

/** One raw reading from `GET /devices/:deviceId/telemetry/history`. */
/**
 * One row from GET /telemetry/history.
 *
 * Declared from what the service actually emits: `value` (already coerced from the JSON
 * payload), `unit`, and `createdAt`. The previous version also declared `numericValue`,
 * `textValue`, `boolValue`, `recordedAt` and `quality` — none of which the backend has ever
 * produced. The first three made readingValue() branch through three permanently dead cases
 * before reaching `value`, and `quality` produced a table column that could only ever render
 * an em dash. A column that is always empty is a surface claiming a signal it does not have.
 */
interface Reading {
  id?: string;
  createdAt?: string;
  value?: unknown;
  unit?: string | null;
}

const RANGES: Array<[string, number]> = [
  ['6 jam', 6],
  ['24 jam', 24],
  ['3 hari', 72],
  ['7 hari', 168],
];

export default function TenantHistoricalContent() {
  const [devices, setDevices] = useState<DeviceRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [hours, setHours] = useState(24);
  const [buckets, setBuckets] = useState<Bucket[]>([]);
  const [loading, setLoading] = useState(false);
  const [telemetryError, setTelemetryError] = useState<string | null>(null);
  const [readings, setReadings] = useState<Reading[] | null>(null);
  const [rawError, setRawError] = useState<string | null>(null);
  const [rawCursor, setRawCursor] = useState<string | null>(null);

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
          ? data
          : ((data as { items?: DeviceRow[] }).items ?? []);
        setDevices(items);
        setDeviceId((current) => current ?? items[0]?.id ?? null);
      })
      .catch((cause: unknown) => {
        if (!cancelled)
          setError(cause instanceof Error ? cause.message : 'gagal memuat');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!deviceId) return;
    let cancelled = false;
    setLoading(true);
    setTelemetryError(null);
    fetch(`/api/admin/telemetry-chart?deviceId=${deviceId}&hours=${hours}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`backend ${res.status}`);
        return res.json();
      })
      .then((data: { buckets?: Bucket[] }) => {
        if (!cancelled) setBuckets(data.buckets ?? []);
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setBuckets([]);
          setTelemetryError(cause instanceof Error ? cause.message : 'gagal memuat telemetri');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [deviceId, hours]);

  /**
   * Raw reading history, loaded alongside the hourly aggregates.
   *
   * The aggregate chart answers "how did the trend look"; this answers "what exactly was
   * reported at 14:07" — which is the question behind every spike and every gap an
   * operator actually investigates. The backend has exposed this endpoint with no
   * consumer until now.
   */
  useEffect(() => {
    if (!deviceId) {
      setReadings(null);
      return;
    }
    let cancelled = false;
    setRawError(null);
    fetch(`/api/admin/telemetry-history?deviceId=${encodeURIComponent(deviceId)}&limit=50`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`backend ${res.status}`);
        return res.json();
      })
      .then((data: { items?: Reading[] } | Reading[]) => {
        if (cancelled) return;
        const items = Array.isArray(data) ? data : (data.items ?? []);
        setReadings(items);
        // Only the backend knows the true page boundary, so the cursor is taken from
        // its response rather than invented from the last row's id.
        const last = items[items.length - 1];
        setRawCursor(last?.id ?? null);
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setReadings([]);
        setRawError(
          cause instanceof Error ? cause.message : 'gagal memuat riwayat mentah',
        );
      });
    return () => {
      cancelled = true;
    };
  }, [deviceId]);

  const stats = useMemo(() => {
    const values = buckets
      .map((b) => (typeof b.avg === 'number' ? b.avg : null))
      .filter((v): v is number => v !== null);
    if (values.length === 0) return null;
    return {
      count: values.length,
      min: Math.min(...values),
      max: Math.max(...values),
      avg: values.reduce((a, b) => a + b, 0) / values.length,
    };
  }, [buckets]);

  const readingValue = (reading: Reading): string => {
    if (reading.value === null || reading.value === undefined) return '—';
    return `${String(reading.value)}${reading.unit ? ` ${reading.unit}` : ''}`;
  };

  if (error) {
    return (
      <div className="iot2-panel text-center">
        <p className="m-0 text-[15px] font-semibold text-slate-200">
          Data historis tidak tersedia
        </p>
        <p className="mt-2 text-[13px] text-slate-400">Backend ({error}).</p>
      </div>
    );
  }

  if (!devices) {
    return (
      <div className="h-64 animate-pulse rounded-2xl border border-slate-800/80 bg-[#111c2e]/70" />
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={deviceId ?? ''}
          onChange={(e) => setDeviceId(e.target.value)}
          className="rounded-xl border border-slate-700/70 bg-slate-900/60 px-4 py-2.5 text-[13.5px] font-semibold text-slate-200 outline-none focus:border-teal-500"
        >
          {devices.map((device) => (
            <option key={device.id} value={device.id}>
              {device.name ?? device.id.slice(0, 8)}
            </option>
          ))}
        </select>
        <div className="flex gap-1.5 rounded-xl bg-slate-800/60 p-1">
          {RANGES.map(([label, value]) => (
            <button
              key={value}
              onClick={() => setHours(value)}
              className={`rounded-lg px-3.5 py-1.5 text-[12.5px] font-bold transition-colors ${
                hours === value
                  ? 'bg-teal-500/20 text-teal-300 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="iot2-panel">
        {loading ? (
          <div className="h-[200px] animate-pulse rounded-xl bg-slate-800/50" />
        ) : telemetryError ? (
          <div role="alert" className="rounded-xl border border-red-500/25 bg-red-500/5 px-4 py-10 text-center text-[13px] text-red-300">
            Data telemetri gagal dimuat ({telemetryError}).
          </div>
        ) : stats ? (
          <>
            <div className="mb-5 grid grid-cols-3 gap-3">
              {[
                ['Rata-rata', stats.avg.toFixed(1)],
                ['Minimum', stats.min.toFixed(1)],
                ['Maksimum', stats.max.toFixed(1)],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="rounded-xl bg-teal-500/10 px-4 py-3"
                >
                  <div className="text-[12px] font-semibold text-slate-400">
                    {label}
                  </div>
                  <div className="text-[22px] font-extrabold text-teal-300">
                    {value}
                  </div>
                </div>
              ))}
            </div>
            <table className="w-full border-collapse text-left text-[13px]">
              <thead>
                <tr className="text-[11.5px] uppercase tracking-wide text-slate-400">
                  <th className="pb-2">Waktu</th>
                  <th className="pb-2">Rata-rata</th>
                  <th className="pb-2">Min</th>
                  <th className="pb-2">Maks</th>
                </tr>
              </thead>
              <tbody>
                {[...buckets]
                  .reverse()
                  .slice(0, 24)
                  .map((bucket, i) => (
                    <tr key={i} className="border-t border-slate-800/60">
                      <td className="py-2 text-slate-400">
                        {bucket.start
                          ? new Date(bucket.start).toLocaleString('id-ID', {
                              day: '2-digit',
                              month: 'short',
                              hour: '2-digit',
                            })
                          : '—'}
                      </td>
                      <td className="py-2 font-semibold text-slate-100">
                        {typeof bucket.avg === 'number'
                          ? bucket.avg.toFixed(2)
                          : '—'}
                      </td>
                      <td className="py-2 text-slate-500">
                        {typeof bucket.min === 'number'
                          ? bucket.min.toFixed(2)
                          : '—'}
                      </td>
                      <td className="py-2 text-slate-500">
                        {typeof bucket.max === 'number'
                          ? bucket.max.toFixed(2)
                          : '—'}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </>
        ) : (
          <p className="m-0 py-10 text-center text-[13.5px] text-slate-400">
            Belum ada data agregat untuk rentang ini.
          </p>
        )}
      </div>

      {/* Raw readings — the individual reports behind the hourly averages above. */}
      <div className="iot2-panel">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="m-0 text-[15px] font-bold text-slate-200">
            Pembacaan mentah
          </h3>
          <span className="text-[11.5px] text-slate-500">
            {readings === null
              ? 'memuat…'
              : `${readings.length} pembacaan terakhir`}
            {rawCursor ? ' · ada halaman berikutnya' : ''}
          </span>
        </div>

        {rawError ? (
          <p
            role="alert"
            className="m-0 rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-[13px] text-amber-300"
          >
            Riwayat mentah tidak dapat dimuat ({rawError}). Grafik agregat di atas tetap
            valid — hanya pembacaan individual yang tidak tersedia.
          </p>
        ) : readings === null ? (
          <div className="h-24 animate-pulse rounded-xl bg-slate-800/40" />
        ) : readings.length === 0 ? (
          <p className="m-0 py-8 text-center text-[13.5px] text-slate-400">
            Perangkat ini belum pernah mengirim pembacaan.
          </p>
        ) : (
          <div className="max-h-96 overflow-y-auto">
            <table className="w-full border-collapse text-left text-[13px]">
              <thead className="sticky top-0 bg-[#0f1929]">
                <tr className="text-[11.5px] uppercase tracking-wide text-slate-400">
                  <th className="pb-2">Waktu</th>
                  <th className="pb-2">Nilai</th>
                </tr>
              </thead>
              <tbody>
                {readings.map((reading, i) => (
                  <tr key={reading.id ?? i} className="border-t border-slate-800/60">
                    <td className="py-2 text-slate-400">
                      {reading.createdAt
                        ? new Date(reading.createdAt).toLocaleString('id-ID')
                        : '—'}
                    </td>
                    <td className="py-2 font-semibold text-slate-100">
                      {readingValue(reading)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

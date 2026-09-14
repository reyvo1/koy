'use client';

/**
 * Reports & Export (blueprint §2) — CSV export of real aggregate telemetry
 * per device over a bounded range. Domain-bound: /api/admin/devices +
 * /api/admin/telemetry-chart. No fabricated report rows.
 */

import { useEffect, useState } from 'react';

interface DeviceRow {
  id: string;
  name?: string;
}

interface Bucket {
  start?: string;
  avg?: number;
}

const RANGES: Array<[string, number]> = [
  ['24 jam', 24],
  ['3 hari', 72],
  ['7 hari', 168],
];

function toCsv(rows: Array<Record<string, string | number>>): string {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  const escape = (value: string | number) =>
    `"${String(value).replace(/"/g, '""')}"`;
  return [
    headers.join(','),
    ...rows.map((row) => headers.map((h) => escape(row[h] ?? '')).join(',')),
  ].join('\n');
}

export default function TenantReportsContent() {
  const [devices, setDevices] = useState<DeviceRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hours, setHours] = useState(24);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

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
      })
      .catch((cause: unknown) => {
        if (!cancelled)
          setError(cause instanceof Error ? cause.message : 'gagal memuat');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const exportDevice = async (device: DeviceRow) => {
    setBusyId(device.id);
    setNotice(null);
    try {
      const res = await fetch(
        `/api/admin/telemetry-chart?deviceId=${device.id}&hours=${hours}`,
      );
      if (!res.ok) throw new Error(`backend ${res.status}`);
      const data = (await res.json()) as { buckets?: Bucket[] };
      const rows = (data.buckets ?? [])
        .filter((b) => typeof b.avg === 'number')
        .map((b) => ({
          waktu: b.start ?? '',
          rata_rata: Number(b.avg).toFixed(3),
        }));
      if (rows.length === 0) {
        setNotice('Tidak ada data pada rentang ini untuk diekspor.');
        return;
      }
      const csv = toCsv(rows);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `laporan-${(device.name ?? device.id).replace(/[^a-z0-9-]+/gi, '-')}-${hours}j.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
      setNotice('Ekspor CSV berhasil diunduh ');
    } catch (cause) {
      setNotice(
        cause instanceof Error ? `Gagal: ${cause.message}` : 'Gagal mengekspor.',
      );
    } finally {
      setBusyId(null);
    }
  };

  if (error && !devices) {
    return (
      <div className="iot2-panel text-center">
        <p className="m-0 text-[15px] font-semibold text-slate-700">
          Laporan tidak tersedia
        </p>
        <p className="mt-2 text-[13px] text-slate-400">Backend ({error}).</p>
      </div>
    );
  }

  if (!devices) {
    return <div className="h-64 animate-pulse rounded-2xl bg-slate-200/70" />;
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {RANGES.map(([label, value]) => (
          <button
            key={value}
            onClick={() => setHours(value)}
            className={`rounded-full px-4 py-1.5 text-[12.5px] font-bold transition-colors ${
              hours === value
                ? 'bg-teal-600 text-white shadow'
                : 'bg-white text-slate-500 shadow-sm hover:bg-teal-50'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {notice ? (
        <p className="mb-4 rounded-xl bg-teal-50 px-4 py-2.5 text-[13px] font-semibold text-teal-800">
          {notice}
        </p>
      ) : null}

      <div className="space-y-3">
        {devices.slice(0, 20).map((device) => (
          <div
            key={device.id}
            className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-slate-50 text-xl">
              
            </span>
            <div>
              <div className="text-[14.5px] font-bold text-slate-900">
                Laporan Telemetri — {device.name ?? device.id.slice(0, 8)}
              </div>
              <div className="text-[12px] text-slate-400">
                Agregat per jam · {hours} jam terakhir · format CSV
              </div>
            </div>
            <button
              onClick={() => void exportDevice(device)}
              disabled={busyId === device.id}
              className="ml-auto rounded-xl bg-teal-50 px-4 py-2.5 text-[12.5px] font-bold text-teal-700 hover:bg-teal-100 disabled:opacity-50"
            >
              {busyId === device.id ? 'Menyiapkan…' : 'Export CSV ⬇'}
            </button>
          </div>
        ))}
      </div>

      <p className="mt-5 text-[12px] text-slate-400">
        Ekspor dibatasi rentang waktu sesuai kebijakan retensi data platform.
      </p>
    </div>
  );
}

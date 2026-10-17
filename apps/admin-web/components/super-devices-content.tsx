'use client';

/**
 * Super Admin device directory (blueprint §1).
 * Uses the platform-scoped device endpoint and never falls back to the active
 * tenant device list. Device detail remains intentionally unlinked until a
 * platform-scoped detail contract exists.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';

interface DeviceRow {
  id: string;
  name?: string;
  type?: string;
  status?: string;
  tenantName?: string | null;
  lastHeartbeatAt?: string | null;
  claimPending?: boolean;
}

const STATUS_STYLE: Record<string, string> = {
  ONLINE: 'bg-emerald-500/10 text-emerald-400',
  ACTIVE: 'bg-emerald-500/10 text-emerald-400',
  PAIRED: 'bg-emerald-500/10 text-emerald-400',
  PROVISIONING: 'bg-amber-500/10 text-amber-400',
  OFFLINE: 'bg-slate-700/50 text-slate-400',
  REVOKED: 'bg-red-500/10 text-red-400',
};

function timeAgo(iso?: string | null): string {
  if (!iso) return 'belum pernah';
  const delta = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(delta) || delta < 0) return 'baru saja';
  const mins = Math.floor(delta / 60000);
  if (mins < 1) return 'baru saja';
  if (mins < 60) return `${mins} mnt lalu`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} jam lalu`;
  return `${Math.floor(hours / 24)} hari lalu`;
}

export default function SuperDevicesContent() {
  const [devices, setDevices] = useState<DeviceRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    fetch('/api/super/platform-devices')
      .then(async (res) => {
        if (!res.ok) throw new Error(`backend ${res.status}`);
        return res.json().catch(() => { throw new Error('Backend mengembalikan respons yang tidak dapat dibaca.'); });
      })
      .then((data: unknown) => {
        const items = Array.isArray(data)
          ? data
          : ((data as { items?: DeviceRow[] }).items ?? []);
        setDevices(items);
      })
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : 'gagal memuat');
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const revoke = async (device: DeviceRow) => {
    setBusy(device.id);
    setError(null);
    try {
      const res = await fetch(`/api/super/platform-devices/${encodeURIComponent(device.id)}/revoke`, {
        method: 'PATCH',
      });
      const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
      if (!res.ok) throw new Error(body.error?.message ?? 'Gagal menonaktifkan');
      load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Gagal menonaktifkan perangkat');
    } finally {
      setBusy(null);
    }
  };

  const filtered = useMemo(() => {
    if (!devices) return [];
    const q = search.trim().toLowerCase();
    if (!q) return devices;
    return devices.filter((device) =>
      `${device.name ?? ''} ${device.type ?? ''} ${device.id} ${device.tenantName ?? ''}`
        .toLowerCase()
        .includes(q),
    );
  }, [devices, search]);

  if (error && !devices) {
    return (
      <div className="rounded-xl border border-dashed border-slate-700/70 p-10 text-center">
        <p className="m-0 text-[15px] font-semibold text-slate-300">
          Daftar perangkat platform tidak tersedia
        </p>
        <p className="mt-2 text-[13px] text-slate-500">Backend ({error}).</p>
      </div>
    );
  }

  if (!devices) {
    return <div className="h-48 animate-pulse rounded-xl bg-slate-800/60" />;
  }

  return (
    <div>
      {error ? (
        <p role="alert" className="mb-4 rounded-xl border border-red-500/25 bg-red-500/5 px-4 py-2.5 text-[13px] text-red-300">
          {error}
        </p>
      ) : null}
      <input
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Cari nama, tenant, tipe, atau id…"
        className="mb-4 w-full rounded-xl border border-slate-700/70 bg-slate-900/60 px-4 py-2.5 text-[13.5px] text-slate-200 outline-none placeholder:text-slate-500 focus:border-teal-500"
      />
      {filtered.length === 0 ? (
        <p className="m-0 py-10 text-center text-[13.5px] text-slate-500">
          Tidak ada perangkat yang cocok.
        </p>
      ) : (
        <div className="max-h-[540px] space-y-2 overflow-y-auto pr-1">
          {filtered.map((device) => {
            const status = (device.status ?? 'OFFLINE').toUpperCase();
            const revocable = status !== 'REVOKED';
            return (
              <div
                key={device.id}
                className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-800/70 px-5 py-3 transition-colors hover:border-teal-600/50"
              >
                <div className="min-w-[220px] flex-1">
                  <div className="text-[14px] font-bold text-slate-100">
                    {device.name ?? device.id.slice(0, 8)}
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                    <code className="text-teal-300">{device.id}</code>
                    {device.tenantName ? <span>· {device.tenantName}</span> : null}
                    {device.type ? <span>· {device.type}</span> : null}
                    {device.claimPending ? <span>· claim pending</span> : null}
                  </div>
                </div>
                <span className="flex shrink-0 items-center gap-3">
                  <span className="text-[11.5px] text-slate-500">
                    {timeAgo(device.lastHeartbeatAt)}
                  </span>
                  <span
                    className={`rounded-full px-3 py-1 text-[11px] font-bold ${
                      STATUS_STYLE[status] ?? STATUS_STYLE.OFFLINE
                    }`}
                  >
                    {status}
                  </span>
                  {revocable ? (
                    <button
                      type="button"
                      onClick={() => void revoke(device)}
                      disabled={busy !== null}
                      className="rounded-lg border border-red-500/30 px-3 py-1.5 text-[12px] font-semibold text-red-400 transition-colors hover:bg-red-500/10 disabled:opacity-50"
                    >
                      {busy === device.id ? '…' : 'Nonaktifkan'}
                    </button>
                  ) : null}
                </span>
              </div>
            );
          })}
        </div>
      )}
      <p className="mt-4 text-[11.5px] text-slate-600">
        Detail perangkat lintas tenant belum dibuka sampai kontrak detail platform-scoped tersedia; daftar ini tidak melakukan fallback ke konteks tenant aktif.
      </p>
    </div>
  );
}

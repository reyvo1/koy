'use client';

/**
 * Tenant Devices (blueprint §2) — full lifecycle: add device via one-time pairing code
 * (POST /api/admin/tenant-devices, token shown once), list, deactivate.
 * Dark unified v2.2. Fail-closed on errors.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Thermometer,
  Plug,
  Camera,
  RadioTower,
  Search,
  SearchX,
  Inbox,
  ServerCrash,
  ChevronRight,
  type LucideIcon,
} from 'lucide-react';
import { EmptyState, SkeletonTable, StatusPill, shadow } from '@/components/ui-polish';

interface DeviceRow {
  id: string;
  name?: string;
  type?: string;
  status?: string;
  lastHeartbeatAt?: string | null;
}

const TYPE_ICON: Record<string, LucideIcon> = {
  SENSOR: Thermometer,
  ACTUATOR: Plug,
  CAMERA: Camera,
  GATEWAY: RadioTower,
};

const DEVICE_TYPES = ['SENSOR', 'ACTUATOR', 'GATEWAY', 'CAMERA'] as const;

const STATUS_TONE: Record<string, 'online' | 'offline' | 'warn' | 'neutral'> = {
  ONLINE: 'online',
  ACTIVE: 'online',
  PAIRED: 'neutral',
  PROVISIONING: 'warn',
  OFFLINE: 'offline',
  INACTIVE: 'offline',
  REVOKED: 'offline',
};

function effectiveStatus(d: { status?: string; lastHeartbeatAt?: string | null }): string {
  const s = (d.status ?? '').toUpperCase();
  if ((s === 'ACTIVE' || s === 'ONLINE') && !d.lastHeartbeatAt) return 'STANDBY';
  return s;
}

function timeAgo(iso?: string | null): string {
  if (!iso) return 'belum pernah';
  const delta = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(delta) || delta < 0) return 'baru saja';
  const mins = Math.floor(delta / 60000);
  if (mins < 1) return 'baru saja';
  if (mins < 60) return `${mins} menit lalu`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} jam lalu`;
  return `${Math.floor(hours / 24)} hari lalu`;
}

export default function TenantDevicesContent() {
  const [devices, setDevices] = useState<DeviceRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [issued, setIssued] = useState<{ name: string; deviceId: string; pairingCode: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(() => {
    setError(null);
    fetch('/api/admin/devices')
      .then(async (res) => {
        if (!res.ok) throw new Error(`backend ${res.status}`);
        return res.json();
      })
      .then((data: unknown) => {
        const items = Array.isArray(data)
          ? data
          : ((data as { items?: DeviceRow[] }).items ?? []);
        setDevices(items);
      })
      .catch((cause: unknown) =>
        setError(cause instanceof Error ? cause.message : 'gagal memuat'),
      );
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy('create');
    setFormError(null);
    setIssued(null);
    const form = new FormData(event.currentTarget);
    try {
      const res = await fetch('/api/admin/tenant-devices', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: String(form.get('name') ?? '').trim(),
          type: form.get('type'),
        }),
      });
      const body = (await res.json()) as {
        provisioningToken?: string;
        pairingCode?: string;
        device?: { id: string; name: string };
        error?: { message?: string };
      };
      if (!res.ok || !body.provisioningToken || !body.device?.id) {
        throw new Error(body.error?.message ?? 'Gagal mendaftarkan perangkat');
      }
      setIssued({
        name: body.device.name ?? '',
        deviceId: body.device.id,
        pairingCode: body.pairingCode ?? `${body.device.id}:${body.provisioningToken}`,
      });
      setCopied(false);
      event.currentTarget.reset();
      setShowForm(false);
      load();
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : 'Gagal mendaftarkan perangkat');
    } finally {
      setBusy(null);
    }
  };

  const revoke = async (deviceId: string) => {
    setBusy(`revoke-${deviceId}`);
    try {
      const res = await fetch(`/api/devices/${deviceId}/revoke`, { method: 'PATCH' });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
        throw new Error(body.error?.message ?? 'Gagal menonaktifkan');
      }
      load();
    } catch {
      setError('Gagal menonaktifkan perangkat');
    } finally {
      setBusy(null);
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return devices ?? [];
    return (devices ?? []).filter((d) =>
      `${d.name ?? ''} ${d.type ?? ''}`.toLowerCase().includes(q),
    );
  }, [devices, search]);

  if (error && !devices) {
    return (
      <EmptyState
        icon={ServerCrash}
        title="Daftar perangkat tidak tersedia"
        description={`Backend belum dapat dihubungi (${error}). Coba beberapa saat lagi.`}
      />
    );
  }

  if (!devices) {
    return <SkeletonTable rows={5} />;
  }

  return (
    <div className="animate-in fade-in duration-200">
      {issued ? (
        <div className="mb-5 rounded-2xl border border-teal-500/40 bg-teal-500/[.07] p-5">
          <h3 className="m-0 text-[14px] font-bold text-white">
            Perangkat &ldquo;{issued.name}&rdquo; terdaftar — pairing code diterbitkan
          </h3>
          <p className="mt-1 mb-3 text-[12.5px] text-slate-400">
            Pairing code hanya ditampilkan SEKALI ini (berlaku 1 jam). Kode berisi ID perangkat + token sekali pakai.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <code className="flex-1 rounded-xl border border-teal-500/30 bg-slate-950/80 px-4 py-3 text-center text-[14px] font-bold tracking-wider text-teal-300">
              {issued.pairingCode}
            </code>
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard?.writeText(issued.pairingCode);
                setCopied(true);
              }}
              className="rounded-xl bg-teal-500 px-5 py-2.5 text-[13px] font-bold text-white hover:brightness-110"
            >
              {copied ? 'Tersalin ✓' : 'Salin Pairing Code'}
            </button>
          </div>
        </div>
      ) : null}

      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" strokeWidth={2} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari perangkat…"
            className="w-full rounded-xl border border-slate-700/70 bg-slate-900/60 py-2.5 pl-10 pr-4 text-[13.5px] text-slate-200 outline-none transition-all placeholder:text-slate-500 focus:border-teal-500"
          />
        </div>
        <button
          type="button"
          onClick={() => {
            setShowForm((v) => !v);
            setFormError(null);
          }}
          className="iot-button shrink-0"
        >
          {showForm ? 'Tutup' : '+ Tambah Perangkat'}
        </button>
      </div>

      {showForm ? (
        <form
          onSubmit={onSubmit}
          className="iot2-panel mb-5 grid gap-4 sm:grid-cols-2"
          style={{ padding: 20 }}
        >
          <label className="block">
            <span className="mb-1.5 block text-[12px] font-semibold" style={{ color: 'var(--iot-text-muted)' }}>
              Nama perangkat *
            </span>
            <input
              name="name"
              required
              maxLength={80}
              placeholder="Sensor Suhu Kamar"
              className="w-full rounded-xl border border-slate-700/70 bg-slate-900/60 px-3.5 py-2.5 text-[13.5px] text-slate-200 outline-none placeholder:text-slate-500 focus:border-teal-500"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[12px] font-semibold" style={{ color: 'var(--iot-text-muted)' }}>
              Tipe *
            </span>
            <select
              name="type"
              required
              defaultValue="SENSOR"
              className="w-full rounded-xl border border-slate-700/70 bg-slate-900/60 px-3.5 py-2.5 text-[13.5px] text-slate-200 outline-none focus:border-teal-500"
            >
              {DEVICE_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </label>
          <div className="flex items-end sm:col-span-2">
            <button disabled={busy !== null} className="iot-button w-full">
              {busy === 'create' ? 'Memproses…' : 'Daftarkan & Terbitkan Pairing Code'}
            </button>
          </div>
          {formError ? (
            <p role="alert" className="sm:col-span-2 m-0 rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-[13px] text-red-400">
              {formError}
            </p>
          ) : null}
        </form>
      ) : null}

      {filtered.length === 0 ? (
        search ? (
          <EmptyState
            icon={SearchX}
            title="Tidak ada hasil"
            description={`Tidak ditemukan perangkat untuk pencarian "${search}". Coba kata kunci lain.`}
          />
        ) : (
          <EmptyState
            icon={Inbox}
            title="Belum ada perangkat"
            description="Daftarkan perangkat pertama Anda dan gunakan pairing code untuk menghubungkannya ke platform."
            action={{ label: '+ Tambah Perangkat', onClick: () => setShowForm(true) }}
          />
        )
      ) : (
        <div className="space-y-2.5">
          {filtered.map((device, i) => {
            const status = effectiveStatus(device);
            const Icon = TYPE_ICON[(device.type ?? '').toUpperCase()] ?? RadioTower;
            const revocable = status !== 'REVOKED';
            return (
              <div
                key={device.id}
                style={{ animationDelay: `${i * 40}ms` }}
                className={`group flex items-center gap-4 rounded-2xl border border-slate-800/80 bg-[#111c2e] px-5 py-4 transition-all duration-200 ease-out hover:-translate-y-0.5 hover:border-teal-500/40 animate-in fade-in slide-in-from-bottom-1 fill-mode-both ${shadow.card} ${shadow.cardHover}`}
              >
                <Link href={`/tenant/perangkat/${device.id}`} className="flex min-w-0 flex-1 items-center gap-4">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-teal-500/15 to-emerald-500/15 transition-transform duration-200 group-hover:scale-110">
                    <Icon className="h-5 w-5 text-teal-300" strokeWidth={1.8} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[14.5px] font-bold text-slate-100">
                      {device.name ?? device.id.slice(0, 8)}
                    </div>
                    <div className="text-[12px] font-medium text-slate-500">
                      {(device.type ?? 'DEVICE').toLowerCase()} · heartbeat {timeAgo(device.lastHeartbeatAt)}
                    </div>
                  </div>
                  <StatusPill tone={STATUS_TONE[status] ?? 'offline'} label={status} />
                  <ChevronRight className="h-4 w-4 shrink-0 text-slate-600 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-teal-400" strokeWidth={2} />
                </Link>
                {revocable ? (
                  <button
                    type="button"
                    onClick={() => void revoke(device.id)}
                    disabled={busy !== null}
                    className="shrink-0 rounded-lg border border-red-500/30 px-3 py-1.5 text-[12px] font-semibold text-red-400 transition-colors hover:bg-red-500/10 disabled:opacity-50"
                  >
                    {busy === `revoke-${device.id}` ? '…' : 'Nonaktifkan'}
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

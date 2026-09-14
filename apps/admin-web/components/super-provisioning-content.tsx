'use client';

/**
 * Provisioning content — real device provisioning with one-time pairing code
 * via /api/super/platform-devices. Token rendered once; list refreshes live.
 */

import { useCallback, useEffect, useState } from 'react';

interface TenantOption {
  id: string;
  name: string;
}

interface DeviceRow {
  id: string;
  name: string;
  type: string;
  status: string;
  tenantName: string;
  claimPending: boolean;
  createdAt: string;
}

const inputClass =
  'w-full rounded-xl border border-slate-700/70 bg-slate-900/60 px-3.5 py-2.5 text-[13.5px] text-slate-200 outline-none placeholder:text-slate-500 focus:border-teal-500';

const DEVICE_TYPES = ['SENSOR', 'ACTUATOR', 'GATEWAY', 'CAMERA'] as const;

export default function SuperProvisioningContent() {
  const [tenants, setTenants] = useState<TenantOption[]>([]);
  const [devices, setDevices] = useState<DeviceRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [tenantLoadError, setTenantLoadError] = useState<string | null>(null);
  const [deviceLoadError, setDeviceLoadError] = useState<string | null>(null);
  const [issued, setIssued] = useState<{
    pairingCode: string;
    deviceId: string;
    name: string;
    type: string;
    tenantName: string;
    expiresInSeconds: number;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  const loadDevices = useCallback(() => {
    setDeviceLoadError(null);
    fetch('/api/super/platform-devices')
      .then(async (res) => {
        if (!res.ok) throw new Error(`backend ${res.status}`);
        return res.json();
      })
      .then((data: { items?: DeviceRow[] }) => {
        setDevices(Array.isArray(data.items) ? data.items : []);
        setDeviceLoadError(null);
      })
      .catch((cause: unknown) => {
        setDevices(null);
        setDeviceLoadError(cause instanceof Error ? cause.message : 'gagal memuat perangkat');
      });
  }, []);

  useEffect(() => {
    setTenantLoadError(null);
    fetch('/api/super/tenants')
      .then(async (res) => {
        if (!res.ok) throw new Error(`backend ${res.status}`);
        return res.json();
      })
      .then((data: { items?: TenantOption[] }) => {
        setTenants(Array.isArray(data.items) ? data.items : []);
        setTenantLoadError(null);
      })
      .catch((cause: unknown) => {
        setTenants([]);
        setTenantLoadError(cause instanceof Error ? cause.message : 'gagal memuat tenant');
      });
    loadDevices();
  }, [loadDevices]);

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setFormError(null);
    setIssued(null);
    const form = new FormData(event.currentTarget);
    try {
      const res = await fetch('/api/super/platform-devices', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          tenantId: form.get('tenantId'),
          name: String(form.get('name') ?? '').trim(),
          type: form.get('type'),
        }),
      });
      const body = (await res.json()) as {
        device?: { id: string; name: string; type: string };
        tenantName?: string;
        provisioningToken?: string;
        pairingCode?: string;
        expiresInSeconds?: number;
        error?: { message?: string };
      };
      if (!res.ok || !body.device || !body.provisioningToken) {
        throw new Error(body.error?.message ?? 'Gagal provisioning perangkat');
      }
      setIssued({
        pairingCode: body.pairingCode ?? `${body.device.id}:${body.provisioningToken}`,
        deviceId: body.device.id,
        name: body.device.name,
        type: body.device.type,
        tenantName:
          tenants.find((tenant) => tenant.id === String(form.get('tenantId') ?? ''))?.name ??
          String(form.get('tenantId') ?? ''),
        expiresInSeconds: body.expiresInSeconds ?? 3600,
      });
      setCopied(false);
      event.currentTarget.reset();
      loadDevices();
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : 'Gagal provisioning perangkat');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      {issued ? (
        <div className="mb-6 rounded-2xl border border-teal-500/40 bg-teal-500/[.07] p-5">
          <h3 className="m-0 text-[14px] font-bold text-white">
            Perangkat &ldquo;{issued.name}&rdquo; terdaftar — pairing code diterbitkan
          </h3>
          <p className="mt-1 mb-3 text-[12.5px] text-slate-400">
            Pairing code hanya ditampilkan SEKALI ini. Masukkan ke perangkat untuk pairing
            (berlaku {Math.round(issued.expiresInSeconds / 60)} menit).
          </p>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <code className="flex-1 rounded-xl border border-teal-500/30 bg-slate-950/80 px-4 py-3 text-center text-[15px] font-bold tracking-wider text-teal-300">
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

      {tenantLoadError ? (
        <p role="alert" className="mb-4 rounded-xl border border-red-500/25 bg-red-500/5 px-4 py-3 text-[13px] text-red-300">
          Direktori tenant tidak dapat dimuat ({tenantLoadError}). Provisioning dinonaktifkan sampai data tenant tersedia.
        </p>
      ) : tenants.length === 0 ? (
        <p className="mb-4 rounded-xl border border-amber-500/25 bg-amber-500/5 px-4 py-3 text-[13px] text-amber-300">
          Belum ada tenant yang dapat dipilih untuk provisioning.
        </p>
      ) : null}

      <form
        onSubmit={onSubmit}
        className="mb-8 grid gap-4 rounded-2xl border border-slate-800/80 bg-[#0d1526] p-5 sm:grid-cols-3"
      >
        <label className="block">
          <span className="mb-1.5 block text-[12px] font-semibold text-slate-400">Tenant *</span>
          <select name="tenantId" required className={inputClass} defaultValue="">
            <option value="" disabled>Pilih tenant…</option>
            {tenants.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-[12px] font-semibold text-slate-400">Nama perangkat *</span>
          <input name="name" required maxLength={80} placeholder="Sensor Suhu Lantai 2" className={inputClass} />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-[12px] font-semibold text-slate-400">Tipe *</span>
          <select name="type" required className={inputClass} defaultValue="SENSOR">
            {DEVICE_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </label>
        <div className="flex items-end sm:col-span-3">
          <button
            disabled={busy || Boolean(tenantLoadError) || tenants.length === 0}
            className="rounded-xl bg-gradient-to-r from-teal-500 to-emerald-500 px-6 py-2.5 text-[13px] font-bold text-white shadow-[0_4px_16px_rgba(20,184,166,.3)] transition-all hover:brightness-110 disabled:opacity-60"
          >
            {busy ? 'Memproses…' : 'Terbitkan Pairing Code'}
          </button>
        </div>
        {formError ? (
          <p role="alert" className="sm:col-span-3 m-0 rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-[13px] text-red-400">
            {formError}
          </p>
        ) : null}
      </form>

      <h3 className="mb-3 text-[14px] font-bold text-white">Perangkat Terprovisioning</h3>
      {deviceLoadError ? (
        <div role="alert" className="rounded-xl border border-red-500/25 bg-red-500/5 p-6 text-center text-[13px] text-red-300">
          Direktori perangkat tidak dapat dimuat ({deviceLoadError}).
        </div>
      ) : devices === null ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-12 animate-pulse rounded-xl bg-slate-800/60" />
          ))}
        </div>
      ) : devices.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-700/70 p-8 text-center">
          <p className="m-0 text-[13.5px] text-slate-400">
            Belum ada perangkat — terbitkan pairing code pertama di atas.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {devices.map((d) => (
            <div
              key={d.id}
              className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-800/70 px-5 py-3.5"
            >
              <div className="min-w-0 flex-1">
                <div className="text-[14px] font-bold text-slate-100">{d.name}</div>
                <div className="text-[12px] text-slate-500">
                  {d.tenantName} · {d.type} · {new Date(d.createdAt).toLocaleDateString('id-ID')}
                </div>
              </div>
              <span
                className={`rounded-full px-3 py-1 text-[11px] font-bold ${
                  d.status === 'ACTIVE'
                    ? 'bg-emerald-500/10 text-emerald-400'
                    : d.status === 'PAIRED'
                      ? 'bg-sky-500/10 text-sky-400'
                      : d.claimPending
                        ? 'bg-amber-500/10 text-amber-400'
                        : 'bg-slate-500/10 text-slate-400'
                }`}
              >
                {d.claimPending ? 'MENUNGGU KLAIM' : d.status}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

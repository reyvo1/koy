'use client';

/**
 * Platform command dispatch — the write side of the cross-tenant command surface.
 *
 * This is the most security-sensitive form in the console: it actuates a device that belongs
 * to a tenant the operator is not currently operating as. Three deliberate choices:
 *
 *   1. Nothing is pre-selected. Tenant and device must both be typed/chosen explicitly, so
 *      the operator states the target instead of inheriting it from session state.
 *   2. Reason is required. The backend rejects a dispatch without one so every
 *      cross-tenant actuation is attributable in the RBAC audit log.
 *   3. The form shows the tenant-isolation consequence before the operator commits, rather
 *      than after.
 *
 * The backend is fail-closed regardless of what this form sends: it re-verifies that the
 * device belongs to the named tenant, and it takes the actor from the session, never the body.
 */

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, RadioTower, Send } from 'lucide-react';

// Tenant exposes id, name, createdAt and updatedAt — there is no `slug` column on the
// model, so declaring one here described a field the tenant directory can never return.
interface TenantRow {
  id: string;
  name?: string;
}

interface DeviceRow {
  id: string;
  name?: string;
  status?: string;
  tenantId?: string;
}

interface DispatchResult {
  dispatched: boolean;
  deviceId: string;
  deviceName: string;
  tenantId: string;
  reason: string;
  command: { commandId?: string; status?: string };
}

export default function SuperCommandDispatchPanel() {
  const [tenants, setTenants] = useState<TenantRow[] | null>(null);
  const [tenantId, setTenantId] = useState('');
  const [devices, setDevices] = useState<DeviceRow[] | null>(null);
  const [deviceId, setDeviceId] = useState('');
  const [reason, setReason] = useState('');
  const [payload, setPayload] = useState('{\n  "action": "identify"\n}');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DispatchResult | null>(null);

  const loadTenants = useCallback(async () => {
    setError(null);
    try {
      const response = await fetch('/api/super/tenants', { cache: 'no-store' });
      if (!response.ok) throw new Error(`tenant directory ${response.status}`);
      const body = await response.json();
      setTenants(Array.isArray(body) ? body : (body.items ?? []));
    } catch (cause) {
      setTenants(null);
      setError(
        cause instanceof Error ? cause.message : 'tenant directory tidak dapat dimuat',
      );
    }
  }, []);

  useEffect(() => {
    void loadTenants();
  }, [loadTenants]);

  // The device list is filtered by the chosen tenant in the UI, but the backend re-verifies
  // ownership server-side; this filter is operator convenience, not the security boundary.
  useEffect(() => {
    if (!tenantId) {
      setDevices(null);
      setDeviceId('');
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch('/api/super/platform-devices', {
          cache: 'no-store',
        });
        if (!response.ok) throw new Error(`device directory ${response.status}`);
        const body = await response.json();
        if (cancelled) return;
        const all: DeviceRow[] = Array.isArray(body) ? body : (body.items ?? []);
        setDevices(all.filter((device) => device.tenantId === tenantId));
        setDeviceId('');
      } catch (cause) {
        if (cancelled) return;
        setDevices(null);
        setError(
          cause instanceof Error
            ? cause.message
            : 'device directory tidak dapat dimuat',
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tenantId]);

  const payloadError = (() => {
    if (!payload.trim()) return 'Payload tidak boleh kosong.';
    try {
      JSON.parse(payload);
      return null;
    } catch {
      return 'Payload harus berupa JSON yang valid.';
    }
  })();

  const ready = Boolean(tenantId) && Boolean(deviceId) && reason.trim().length > 0 && !payloadError;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const response = await fetch('/api/super/commands/dispatch', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          tenantId,
          deviceId,
          reason: reason.trim(),
          payload: JSON.parse(payload),
        }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(
          body?.message ?? body?.error ?? `dispatch gagal (${response.status})`,
        );
      }
      setResult(body as DispatchResult);
      setReason('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'dispatch gagal');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="flex items-start gap-3 rounded-2xl border border-amber-500/25 bg-amber-500/[.06] px-5 py-4">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
        <p className="m-0 text-[12px] leading-relaxed text-amber-200/90">
          Dispatch ini menembus tenant isolation secara sengaja. Device harus benar-benar
          milik tenant yang Anda sebut, dan setiap pengiriman — berhasil atau gagal —
          dicatat ke audit log RBAC dengan alasan yang Anda isi dan identitas sesi Anda.
        </p>
      </div>

      {error ? (
        <p
          role="alert"
          className="m-0 rounded-xl border border-red-500/25 bg-red-500/[.06] px-4 py-2.5 text-[12.5px] text-red-300"
        >
          {error}
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className="text-[11.5px] font-bold uppercase tracking-wider text-slate-400">
            Tenant target *
          </span>
          {tenants === null ? (
            <span className="text-[12px] text-red-300">
              Direktori tenant tidak dapat dimuat — dispatch dimatikan.
            </span>
          ) : (
            <select
              required
              value={tenantId}
              onChange={(event) => setTenantId(event.target.value)}
              className="rounded-xl border border-slate-700 bg-[#0d1626] px-3 py-2.5 text-[13px] text-slate-100"
            >
              <option value="">— pilih tenant secara eksplisit —</option>
              {tenants.map((tenant) => (
                <option key={tenant.id} value={tenant.id}>
                  {tenant.name ?? tenant.id}
                </option>
              ))}
            </select>
          )}
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-[11.5px] font-bold uppercase tracking-wider text-slate-400">
            Device *
          </span>
          {!tenantId ? (
            <span className="text-[12px] text-slate-500">
              Pilih tenant dulu untuk memuat device.
            </span>
          ) : devices === null ? (
            <span className="text-[12px] text-red-300">
              Device tidak dapat dimuat — dispatch dimatikan.
            </span>
          ) : devices.length === 0 ? (
            <span className="text-[12px] text-slate-500">
              Tenant ini tidak punya device terdaftar.
            </span>
          ) : (
            <select
              required
              value={deviceId}
              onChange={(event) => setDeviceId(event.target.value)}
              className="rounded-xl border border-slate-700 bg-[#0d1626] px-3 py-2.5 text-[13px] text-slate-100"
            >
              <option value="">— pilih device —</option>
              {devices.map((device) => (
                <option key={device.id} value={device.id}>
                  {device.name ?? device.id}
                  {device.status ? ` · ${device.status}` : ''}
                </option>
              ))}
            </select>
          )}
        </label>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-[11.5px] font-bold uppercase tracking-wider text-slate-400">
          Alasan *
        </span>
        <input
          required
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="mis. Pemulihan terjadwal — HVAC controller macet, tenant sudah mengonfirmasi"
          className="rounded-xl border border-slate-700 bg-[#0d1626] px-3 py-2.5 text-[13px] text-slate-100"
        />
        <span className="text-[11.5px] text-slate-500">
          Disimpan apa adanya di audit log bersama identitas penerima tugas.
        </span>
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-[11.5px] font-bold uppercase tracking-wider text-slate-400">
          Payload (JSON) *
        </span>
        <textarea
          required
          rows={5}
          value={payload}
          onChange={(event) => setPayload(event.target.value)}
          spellCheck={false}
          className="rounded-xl border border-slate-700 bg-[#0d1626] px-3 py-2.5 font-mono text-[12px] text-slate-100"
        />
        {payloadError ? (
          <span className="text-[11.5px] text-red-300">{payloadError}</span>
        ) : null}
      </label>

      <button
        type="submit"
        disabled={!ready || busy}
        className="flex items-center gap-2 rounded-xl bg-amber-500/15 px-4 py-2.5 text-[12.5px] font-bold text-amber-300 ring-1 ring-inset ring-amber-500/30 transition-colors hover:bg-amber-500/25 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {busy ? (
          'Mengirim…'
        ) : (
          <>
            <Send className="h-4 w-4" strokeWidth={2.2} />
            Kirim command platform
          </>
        )}
      </button>

      {!ready && !busy ? (
        <p className="m-0 text-[11.5px] text-slate-500">
          Kirim dinonaktifkan sampai tenant, device, alasan, dan payload JSON lengkap
          terpenuhi.
        </p>
      ) : null}

      {result ? (
        <div className="flex items-start gap-3 rounded-2xl border border-emerald-500/25 bg-emerald-500/[.06] px-5 py-4">
          <RadioTower className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
          <div>
            <p className="m-0 text-[13px] font-semibold text-emerald-200">
              Command dikirim ke {result.deviceName}
            </p>
            <p className="mb-0 mt-1 text-[12px] text-emerald-300/70">
              tenant {result.tenantId} · status {result.command?.status ?? 'PENDING'} ·
              alasan &ldquo;{result.reason}&rdquo;
            </p>
          </div>
        </div>
      ) : null}
    </form>
  );
}

'use client';

/**
 * Otomatisasi (Modul 14) — rule CRUD nyata: trigger capability perangkat,
 * kondisi ALWAYS, aksi set capability perangkat lain. Rule dibuat NONAKTIF,
 * lalu owner dapat mengaktifkan/menonaktifkan secara eksplisit hanya ketika
 * runtime otomasi operator aktif. Hapus didukung.
 */

import { useCallback, useEffect, useState } from 'react';
import { Bot, Plus, Trash2, Loader2, X } from 'lucide-react';
import { EmptyState, SkeletonCard, useToast } from '@/components/ui-polish';
import { CapabilityValueInput } from '@/components/capability-value-input';
import { parseCapabilityValue } from '@/lib/capability-value';

interface AutomationRow {
  id: string;
  name?: string;
  enabled?: boolean;
  revision?: number;
  trigger?: { deviceId?: string; capabilityKey?: string };
  actions?: Array<{ deviceId?: string; capabilityKey?: string; value?: unknown }>;
}

interface DeviceRow {
  id: string;
  name?: string;
}

interface CapabilityRow {
  id: string;
  key: string;
  dataType?: string;
  isWritable?: boolean;
  isReportable?: boolean;
  constraints?: unknown;
}

interface ActionRow {
  deviceId: string;
  capabilityId: string;
  capabilityKey: string;
  value: string;
}

const inputClass =
  'w-full rounded-xl border border-slate-700/70 bg-slate-900/60 px-3.5 py-2.5 text-[13.5px] text-slate-200 outline-none focus:border-teal-500';


export default function TenantAutomationContent() {
  const [rows, setRows] = useState<AutomationRow[] | null>(null);
  const [runtimeEnabled, setRuntimeEnabled] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [triggerDeviceId, setTriggerDeviceId] = useState('');
  const [triggerCapId, setTriggerCapId] = useState('');
  const [actions, setActions] = useState<ActionRow[]>([
    { deviceId: '', capabilityId: '', capabilityKey: '', value: '' },
  ]);
  const [devices, setDevices] = useState<DeviceRow[]>([]);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [capsCache, setCapsCache] = useState<Record<string, CapabilityRow[]>>({});
  const toast = useToast();

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/tenant/automations');
      if (!res.ok) throw new Error(`backend ${res.status}`);
      const data = (await res.json()) as { items?: AutomationRow[]; runtimeEnabled?: boolean };
      setRows(Array.isArray(data.items) ? data.items : []);
      setRuntimeEnabled(data.runtimeEnabled === true);
      setError(null);
    } catch (cause) {
      setRows([]);
      setRuntimeEnabled(null);
      setError(cause instanceof Error ? cause.message : 'gagal memuat');
    }
  }, []);

  useEffect(() => {
    void load();
    setCatalogError(null);
    fetch('/api/admin/devices')
      .then(async (res) => {
        if (!res.ok) throw new Error(`backend ${res.status}`);
        return res.json();
      })
      .then((data: { items?: DeviceRow[] } | DeviceRow[]) =>
        setDevices(Array.isArray(data) ? data : (data.items ?? [])),
      )
      .catch((cause: unknown) => {
        setCatalogError(cause instanceof Error ? cause.message : 'gagal memuat perangkat');
      });
  }, [load]);

  const loadCaps = async (deviceId: string) => {
    if (capsCache[deviceId]) return capsCache[deviceId];
    try {
      const res = await fetch(`/api/admin/device-capabilities?deviceId=${encodeURIComponent(deviceId)}`);
      if (!res.ok) throw new Error(`capability backend ${res.status}`);
      const data = (await res.json()) as { items?: CapabilityRow[] } | CapabilityRow[];
      const caps = Array.isArray(data) ? data : (data.items ?? []);
      setCapsCache((prev) => ({ ...prev, [deviceId]: caps }));
      return caps;
    } catch (cause) {
      setCatalogError(cause instanceof Error ? cause.message : 'gagal memuat capability');
      return [];
    }
  };

  const updateAction = async (index: number, patch: Partial<ActionRow>) => {
    const next = [...actions];
    next[index] = { ...next[index], ...patch };
    if (patch.deviceId) {
      const caps = await loadCaps(patch.deviceId);
      const writable = caps.find((c) => c.isWritable === true && ['boolean', 'number', 'string'].includes(String(c.dataType ?? '').toLowerCase()));
      if (writable) {
        next[index].capabilityId = writable.id;
        next[index].capabilityKey = writable.key;
      }
    }
    setActions(next);
  };

  const create = async () => {
    setBusy('create');
    setFormError(null);
    try {
      const caps = capsCache[triggerDeviceId] ?? [];
      const triggerCap = caps.find((c) => c.id === triggerCapId);
      if (!name.trim() || !triggerDeviceId || !triggerCap) {
        throw new Error('Nama, perangkat pemicu, dan capability wajib diisi');
      }
      const definition = {
        schemaVersion: '1.0.0',
        name: name.trim(),
        trigger: { kind: 'CAPABILITY_REPORTED', deviceId: triggerDeviceId, capabilityKey: triggerCap.key },
        condition: { kind: 'ALWAYS' },
        actions: actions
          .filter((a) => a.deviceId && a.capabilityId && a.value !== '')
          .map((a, i) => {
            const capability = (capsCache[a.deviceId] ?? []).find((candidate) => candidate.id === a.capabilityId);
            if (!capability || capability.isWritable !== true || !['boolean', 'number', 'string'].includes(String(capability.dataType ?? '').toLowerCase())) {
              throw new Error(`Capability aksi ${i + 1} tidak tersedia atau tidak writable`);
            }
            const parsed = parseCapabilityValue(a.value, capability);
            if (!parsed.ok) throw new Error(`Aksi ${i + 1}: ${parsed.error}`);
            return {
              actionId: `act-${i + 1}`,
              deviceId: a.deviceId,
              capabilityId: a.capabilityId,
              capabilityKey: a.capabilityKey,
              value: parsed.value,
            };
          }),
      };
      const res = await fetch('/api/tenant/automations', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ definition }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
      if (!res.ok) throw new Error(body.error?.message ?? 'Gagal membuat otomasi');
      toast.push('success', `Otomasi "${definition.name}" dibuat nonaktif. Aktifkan saat siap.`);
      setName('');
      setTriggerDeviceId('');
      setTriggerCapId('');
      setActions([{ deviceId: '', capabilityId: '', capabilityKey: '', value: '' }]);
      setShowForm(false);
      await load();
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : 'Gagal membuat otomasi');
    } finally {
      setBusy(null);
    }
  };

  const remove = async (row: AutomationRow) => {
    setBusy(`delete-${row.id}`);
    try {
      const res = await fetch(`/api/tenant/automations/${row.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Gagal menghapus otomasi');
      toast.push('success', `Otomasi "${row.name}" dihapus.`);
      await load();
    } catch (cause) {
      toast.push('error', cause instanceof Error ? cause.message : 'Gagal menghapus');
    } finally {
      setBusy(null);
    }
  };

  const setEnabled = async (row: AutomationRow, enabled: boolean) => {
    if (!row.revision || busy !== null) return;
    const operation = enabled ? 'activate' : 'deactivate';
    setBusy(`${operation}-${row.id}`);
    try {
      const res = await fetch(`/api/tenant/automations/${encodeURIComponent(row.id)}/${operation}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ expectedRevision: row.revision }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: { message?: string };
      };
      if (!res.ok) {
        throw new Error(
          body.error?.message ??
            (enabled ? 'Gagal mengaktifkan otomasi' : 'Gagal menonaktifkan otomasi'),
        );
      }
      toast.push(
        'success',
        enabled
          ? `Otomasi "${row.name ?? row.id.slice(0, 8)}" aktif dan menunggu telemetry pemicu.`
          : `Otomasi "${row.name ?? row.id.slice(0, 8)}" dinonaktifkan.`,
      );
      await load();
    } catch (cause) {
      toast.push(
        'error',
        cause instanceof Error ? cause.message : 'Gagal mengubah status otomasi',
      );
    } finally {
      setBusy(null);
    }
  };

  if (rows === null && !error) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    );
  }

  return (
    <div>
      {runtimeEnabled === false ? (
        <p className="mb-5 m-0 rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-[13px] text-amber-300">
          Runtime otomasi sedang dinonaktifkan oleh operator. Rule tetap dapat dibuat dan disimpan,
          tetapi tidak dapat diaktifkan sampai <code>AUTOMATION_RUNTIME_ENABLED=true</code> pada runtime API.
        </p>
      ) : null}
      <div className="mb-5 flex justify-end">
        <button type="button" onClick={() => setShowForm((v) => !v)} className="iot-button">
          {showForm ? 'Tutup' : '+ Buat Otomasi'}
        </button>
      </div>

      {showForm ? (
        <div className="iot2-panel mb-6" style={{ padding: 20 }}>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-[12px] font-semibold" style={{ color: 'var(--iot-text-muted)' }}>Nama otomasi *</span>
              <input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} placeholder="Nyalakan Lampu saat GELAP" className={inputClass} />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[12px] font-semibold" style={{ color: 'var(--iot-text-muted)' }}>Perangkat pemicu *</span>
              <select
                value={triggerDeviceId}
                onChange={async (e) => {
                  setTriggerDeviceId(e.target.value);
                  setTriggerCapId('');
                  if (e.target.value) await loadCaps(e.target.value);
                }}
                className={inputClass}
              >
                <option value="">Pilih perangkat…</option>
                {devices.map((d) => (
                  <option key={d.id} value={d.id}>{d.name ?? d.id.slice(0, 8)}</option>
                ))}
              </select>
            </label>
            <label className="block sm:col-span-2">
              <span className="mb-1.5 block text-[12px] font-semibold" style={{ color: 'var(--iot-text-muted)' }}>Capability pemicu *</span>
              <select value={triggerCapId} onChange={(e) => setTriggerCapId(e.target.value)} disabled={!triggerDeviceId} className={inputClass}>
                <option value="">Pilih capability…</option>
                {(capsCache[triggerDeviceId] ?? []).filter((c) => c.isReportable === true).map((c) => (
                  <option key={c.id} value={c.id}>{c.key}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="mt-4 space-y-3">
            {actions.map((action, i) => {
              const caps = action.deviceId ? (capsCache[action.deviceId] ?? []) : [];
              const cap = caps.find((c) => c.id === action.capabilityId);
              return (
                <div key={i} className="grid gap-2 rounded-xl border border-slate-800/70 p-3 sm:grid-cols-[1fr_1fr_120px_auto]">
                  <select value={action.deviceId} onChange={(e) => void updateAction(i, { deviceId: e.target.value, capabilityId: '', capabilityKey: '', value: '' })} className={inputClass}>
                    <option value="">Perangkat aksi…</option>
                    {devices.map((d) => (
                      <option key={d.id} value={d.id}>{d.name ?? d.id.slice(0, 8)}</option>
                    ))}
                  </select>
                  <select value={action.capabilityId} onChange={(e) => { const c = caps.find((x) => x.id === e.target.value); void updateAction(i, { capabilityId: e.target.value, capabilityKey: c?.key ?? '', value: '' }); }} disabled={!action.deviceId} className={inputClass}>
                    <option value="">Capability…</option>
                    {caps.filter((c) => c.isWritable === true && ['boolean', 'number', 'string'].includes(String(c.dataType ?? '').toLowerCase())).map((c) => (
                      <option key={c.id} value={c.id}>{c.key}</option>
                    ))}
                  </select>
                  <CapabilityValueInput
                    capability={cap}
                    value={action.value}
                    onChange={(value) => void updateAction(i, { value })}
                    disabled={!cap}
                    className={inputClass}
                  />
                  <button type="button" onClick={() => setActions(actions.filter((_, j) => j !== i))} className="grid h-10 w-10 place-items-center self-center rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10" aria-label="Hapus aksi">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              );
            })}
            <button
              type="button"
              onClick={() => setActions([...actions, { deviceId: '', capabilityId: '', capabilityKey: '', value: '' }])}
              className="flex items-center gap-2 rounded-lg border border-slate-700/70 px-3 py-2 text-[12.5px] font-semibold text-slate-300 hover:border-teal-500/50 hover:text-teal-300"
            >
              <Plus className="h-4 w-4" /> Tambah aksi
            </button>
          </div>
          {catalogError ? (
            <p role="alert" className="mt-4 m-0 rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-[13px] text-red-400">
              Katalog perangkat/capability tidak tersedia ({catalogError}). Pembuatan otomasi dinonaktifkan sampai katalog berhasil dimuat.
            </p>
          ) : devices.length === 0 ? (
            <p className="mt-4 m-0 rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-[13px] text-amber-300">
              Belum ada perangkat yang dapat dipakai untuk otomasi.
            </p>
          ) : null}
          <button type="button" onClick={() => void create()} disabled={busy !== null || !name.trim() || Boolean(catalogError) || devices.length === 0} className="iot-button mt-4">
            {busy === 'create' ? 'Menyimpan…' : 'Simpan Otomasi'}
          </button>
          {formError ? (
            <p role="alert" className="mt-3 mb-0 rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-[13px] text-red-400">
              {formError}
            </p>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <div className="iot2-panel text-center">
          <p className="m-0 text-[14px] font-semibold">Otomasi tidak tersedia</p>
          <p className="mt-1 mb-0 text-[12.5px]" style={{ color: 'var(--iot-text-muted)' }}>{error}</p>
        </div>
      ) : !rows || rows.length === 0 ? (
        <EmptyState
          icon={Bot}
          title="Belum ada otomasi"
          description="Buat aturan: saat capability perangkat terlapor → jalankan aksi ke perangkat lain. Rule baru selalu dibuat nonaktif dan memerlukan aktivasi eksplisit."
          action={{ label: '+ Buat Otomasi', onClick: () => setShowForm(true) }}
        />
      ) : (
        <div className="space-y-2.5">
          {rows.map((row) => (
            <div key={row.id} className="iot2-panel flex flex-wrap items-center gap-4" style={{ padding: '16px 20px' }}>
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-teal-500/15">
                <Bot className="h-5 w-5 text-teal-300" strokeWidth={1.9} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[15px] font-bold text-slate-100">{row.name ?? row.id.slice(0, 8)}</div>
                <div className="text-[12px]" style={{ color: 'var(--iot-text-muted)' }}>
                  pemicu: {row.trigger?.capabilityKey ?? '—'} · {row.actions?.length ?? 0} aksi
                </div>
              </div>
              <span
                className={`iot2-badge ${
                  row.enabled && runtimeEnabled
                    ? 'iot2-badge--online'
                    : row.enabled
                      ? 'iot2-badge--warning'
                      : 'iot2-badge--offline'
                }`}
              >
                {row.enabled
                  ? runtimeEnabled
                    ? 'AKTIF'
                    : 'AKTIF · RUNTIME OFF'
                  : 'NONAKTIF'}
              </span>
              <button
                type="button"
                onClick={() => void setEnabled(row, !row.enabled)}
                disabled={
                  busy !== null ||
                  !row.revision ||
                  (!row.enabled && runtimeEnabled !== true)
                }
                className="rounded-xl border border-teal-500/30 px-3.5 py-2 text-[12.5px] font-bold text-teal-300 transition-colors hover:bg-teal-500/10 disabled:cursor-not-allowed disabled:opacity-45"
              >
                {busy === `${row.enabled ? 'deactivate' : 'activate'}-${row.id}`
                  ? 'Memproses…'
                  : row.enabled
                    ? 'Nonaktifkan'
                    : 'Aktifkan'}
              </button>
              <button
                type="button"
                onClick={() => void remove(row)}
                disabled={busy !== null}
                aria-label={`Hapus ${row.name}`}
                className="grid h-10 w-10 place-items-center rounded-xl border border-red-500/30 text-red-400 transition-colors hover:bg-red-500/10 disabled:opacity-50"
              >
                {busy === `delete-${row.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" strokeWidth={2} />}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
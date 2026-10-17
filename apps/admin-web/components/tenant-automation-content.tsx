'use client';

/**
 * Otomatisasi (Modul 14) — rule CRUD nyata: trigger capability perangkat,
 * kondisi ALWAYS, aksi set capability perangkat lain. Rule dibuat NONAKTIF,
 * lalu owner dapat mengaktifkan/menonaktifkan secara eksplisit hanya ketika
 * runtime otomasi operator aktif. Hapus didukung.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Bot, Plus, Trash2, Loader2, X, Pencil } from 'lucide-react';
import { EmptyState, SkeletonCard, useToast } from '@/components/ui-polish';
import { CapabilityValueInput } from '@/components/capability-value-input';
import { parseCapabilityValue } from '@/lib/capability-value';
import { createLoadGuard } from '@/lib/safe-fetch';

interface AutomationRow {
  id: string;
  name?: string;
  enabled?: boolean;
  revision?: number;
  // The list endpoint returns a flat summary (AutomationSummaryRecord): it carries the
  // trigger kind and ids but not the capability key and not the action count. Rendering
  // "—" and "0 aksi" for those read as a broken or empty rule; the row below states what
  // the summary actually knows.
  triggerKind?: string;
  triggerDeviceId?: string;
  triggerCapabilityId?: string;
  // Present only on the single-automation GET, which returns the full definition.
  trigger?: { deviceId?: string; capabilityKey?: string };
  actions?: Array<{ deviceId?: string; capabilityKey?: string; value?: unknown }>;
  actionCount?: number;
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
  const [editing, setEditing] = useState<AutomationRow | null>(null);
  const toast = useToast();

  const loadGuard = useRef(createLoadGuard());

  const load = useCallback(async () => {
    const isCurrent = loadGuard.current.begin();
    try {
      const res = await fetch('/api/tenant/automations');
      if (!res.ok) throw new Error(`backend ${res.status}`);
      const data = (await res.json().catch(() => { throw new Error('Backend mengembalikan respons yang tidak dapat dibaca.'); })) as { items?: AutomationRow[]; runtimeEnabled?: boolean };
      if (!isCurrent()) return;
      setRows(Array.isArray(data.items) ? data.items : []);
      setRuntimeEnabled(data.runtimeEnabled === true);
      setError(null);
    } catch (cause) {
      if (!isCurrent()) return;
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
        return res.json().catch(() => { throw new Error('Backend mengembalikan respons yang tidak dapat dibaca.'); });
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
      const data = (await res.json().catch(() => { throw new Error('Backend mengembalikan respons yang tidak dapat dibaca.'); })) as { items?: CapabilityRow[] } | CapabilityRow[];
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

  /**
   * Build a definition from the form state, or throw with a message the operator can act
   * on. Shared by create and replace so the two paths cannot drift: an edit that
   * validated differently from a create would let an invalid automation in after the fact.
   */
  const buildDefinition = () => {
    const caps = capsCache[triggerDeviceId] ?? [];
    const triggerCap = caps.find((c) => c.id === triggerCapId);
    if (!name.trim() || !triggerDeviceId || !triggerCap) {
      throw new Error('Nama, perangkat pemicu, dan capability wajib diisi');
    }
    return {
      schemaVersion: '1.0.0',
      name: name.trim(),
      trigger: {
        kind: 'CAPABILITY_REPORTED',
        deviceId: triggerDeviceId,
        capabilityKey: triggerCap.key,
      },
      condition: { kind: 'ALWAYS' },
      actions: actions
        .filter((a) => a.deviceId && a.capabilityId && a.value !== '')
        .map((a, i) => {
          const capability = (capsCache[a.deviceId] ?? []).find(
            (candidate) => candidate.id === a.capabilityId,
          );
          if (
            !capability ||
            capability.isWritable !== true ||
            !['boolean', 'number', 'string'].includes(
              String(capability.dataType ?? '').toLowerCase(),
            )
          ) {
            throw new Error(`Capability aksi ${i + 1} tidak tersedia atau tidak writable`);
          }
          const parsed = parseCapabilityValue(a.value, capability);
          if (!parsed.ok) throw new Error(`Aksi ${i + 1}: ${parsed.error}`);
          return {
            actionId: `act-${i + 1}`,
            // `kind` is required by the domain validator and was missing here, so every
            // automation created through this form was rejected. The failure surfaced as
            // a 500 INTERNAL_ERROR rather than a validation message, so it read as a
            // backend outage rather than a malformed request.
            kind: 'DEVICE_COMMAND' as const,
            deviceId: a.deviceId,
            capabilityKey: a.capabilityKey,
            value: parsed.value,
          };
        }),
    };
  };

  /** Load an existing automation back into the form. */
  const startEdit = async (row: AutomationRow) => {
    setBusy(`edit-${row.id}`);
    setFormError(null);
    try {
      const res = await fetch(`/api/tenant/automations/${row.id}`, {
        cache: 'no-store',
      });
      const payload = (await res.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      if (!res.ok) {
        throw new Error(payload?.error?.message ?? `backend ${res.status}`);
      }
      if (payload === null) {
        throw new Error('Backend mengembalikan respons yang tidak dapat dibaca.');
      }
      // `GET /automations/:id` returns a FLAT record, not a `{ definition: {...} }`
      // envelope: triggerKind / triggerDeviceId / triggerCapabilityId plus a resolved
      // `triggerCapability.key` and an `actions` array. The earlier read looked for
      // `definition.trigger.capabilityKey`, which is always undefined, so Edit could
      // never populate the form and silently did nothing.
      const record = payload as unknown as {
        name?: string;
        triggerDeviceId?: string;
        triggerCapabilityId?: string;
        triggerCapability?: { key?: string };
        actions?: Array<{
          deviceId?: string;
          capabilityId?: string;
          capabilityKey?: string;
          value?: unknown;
        }>;
      };

      const triggerDeviceId = record.triggerDeviceId ?? '';
      const triggerCapKey =
        record.triggerCapability?.key ?? record.triggerCapabilityId ?? '';
      // Resolve the trigger to a row in the form's own capability list. The list cache is
      // keyed by device and is populated lazily per device, so a device the operator has
      // not selected in the form yet is simply absent from it — reading only the cache made
      // Edit fail with "capability tidak ditemukan" for any automation whose trigger was
      // not the last device touched. Fetch it instead of assuming the cache is warm.
      let triggerCaps = capsCache[triggerDeviceId] ?? [];
      if (!triggerCaps.some((c) => c.id === record.triggerCapabilityId)) {
        const fetched = await fetch(
          `/api/admin/device-capabilities?deviceId=${encodeURIComponent(triggerDeviceId)}`,
          { cache: 'no-store' },
        );
        if (fetched.ok) {
          const body = (await fetched.json().catch(() => { throw new Error('Backend mengembalikan respons yang tidak dapat dibaca.'); })) as CapabilityRow[] | {
            items?: CapabilityRow[];
          };
          triggerCaps = Array.isArray(body) ? body : (body.items ?? []);
          setCapsCache((current) => ({ ...current, [triggerDeviceId]: triggerCaps }));
        }
      }
      const triggerCap =
        triggerCaps.find((c) => c.id === record.triggerCapabilityId) ??
        triggerCaps.find((c) => c.key === triggerCapKey);
      if (!triggerCap) {
        throw new Error(
          'Capability pemicu tidak ditemukan — perangkat mungkin sudah dilepas',
        );
      }

      // Warm the capability cache for every action device too, otherwise the action's
      // capability dropdown renders with no options and saving drops the action.
      for (const action of record.actions ?? []) {
        const deviceId = action.deviceId ?? '';
        if (!deviceId || capsCache[deviceId]?.length) continue;
        const fetched = await fetch(
          `/api/admin/device-capabilities?deviceId=${encodeURIComponent(deviceId)}`,
          { cache: 'no-store' },
        );
        if (!fetched.ok) continue;
        const body = (await fetched.json().catch(() => { throw new Error('Backend mengembalikan respons yang tidak dapat dibaca.'); })) as CapabilityRow[] | {
          items?: CapabilityRow[];
        };
        const caps = Array.isArray(body) ? body : (body.items ?? []);
        setCapsCache((current) => ({ ...current, [deviceId]: caps }));
      }

      setName(record.name ?? row.name ?? '');
      setTriggerDeviceId(triggerDeviceId);
      setTriggerCapId(triggerCap.id);
      setActions(
        record.actions?.length
          ? record.actions.map((action) => ({
              deviceId: action.deviceId ?? '',
              // The GET returns each action's `capabilityId`, but the form's dropdown is
              // driven by the capability list for that device, and the value it holds is
              // the same id. Reading `action.capabilityKey` (which this action row does not
              // carry) left the select empty, so saving the form would have silently
              // dropped the action's capability.
              capabilityId: action.capabilityId ?? '',
              capabilityKey: action.capabilityKey ?? '',
              value: action.value === undefined || action.value === null
                ? ''
                : String(action.value),
            }))
          : [{ deviceId: '', capabilityId: '', capabilityKey: '', value: '' }],
      );
      setEditing(row);
      setShowForm(true);
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : 'Gagal memuat otomasi');
    } finally {
      setBusy(null);
    }
  };

  const create = async () => {
    setBusy('create');
    setFormError(null);
    try {
      const definition = buildDefinition();
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
      setEditing(null);
      await load();
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : 'Gagal membuat otomasi');
    } finally {
      setBusy(null);
    }
  };

  /**
   * Replace an existing automation's definition.
   *
   * The backend takes an `expectedRevision` and rejects a stale one rather than
   * overwriting a concurrent change, so the revision captured when the form was opened is
   * sent back. If someone else saved in the meantime this fails loudly instead of
   * silently discarding their edit — a lost update is worse here than a rejected save.
   */
  const saveEdit = async () => {
    if (!editing) return;
    if (typeof editing.revision !== 'number') {
      setFormError('Revisi otomasi tidak diketahui — muat ulang halaman lalu coba lagi.');
      return;
    }
    setBusy('save');
    setFormError(null);
    try {
      const definition = buildDefinition();
      const res = await fetch(`/api/tenant/automations/${editing.id}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ expectedRevision: editing.revision, definition }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: { message?: string };
      };
      if (!res.ok) {
        throw new Error(body.error?.message ?? 'Gagal memperbarui otomasi');
      }
      toast.push('success', `Otomasi "${definition.name}" diperbarui.`);
      setEditing(null);
      setShowForm(false);
      setName('');
      setTriggerDeviceId('');
      setTriggerCapId('');
      setActions([{ deviceId: '', capabilityId: '', capabilityKey: '', value: '' }]);
      await load();
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : 'Gagal memperbarui otomasi');
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
          {editing ? (
            <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-slate-800/70 pt-4">
              <button
                type="button"
                onClick={() => void saveEdit()}
                disabled={
                  busy !== null ||
                  !name.trim() ||
                  Boolean(catalogError) ||
                  devices.length === 0
                }
                className="iot-button"
              >
                {busy === 'save' ? 'Menyimpan…' : 'Simpan Perubahan'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditing(null);
                  setShowForm(false);
                  setFormError(null);
                }}
                className="text-[12.5px] font-medium text-slate-400 hover:text-slate-200"
              >
                Batal edit
              </button>
              <span className="text-[11.5px] text-slate-500">
                Mengedit &quot;{editing.name ?? editing.id.slice(0, 8)}&quot; (revisi{' '}
                {editing.revision ?? '?'})
              </span>
            </div>
          ) : (
            <button type="button" onClick={() => void create()} disabled={busy !== null || !name.trim() || Boolean(catalogError) || devices.length === 0} className="iot-button mt-4">
              {busy === 'create' ? 'Menyimpan…' : 'Simpan Otomasi'}
            </button>
          )}
          {formError ? (
            <p role="alert" className="mt-3 mb-0 rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-[13px] text-red-400">
              {formError}
            </p>
          ) : null}
        </div>
      ) : null}

      {/*
        A formError raised before the form opens — e.g. Edit failing to load a definition
        — had nowhere to render: the only alert lives inside the form, which the failure
        itself keeps closed. The button therefore did nothing at all, with no message.
        This banner is outside the form so a failure is always visible.
      */}
      {formError && !showForm ? (
        <p
          role="alert"
          className="mt-3 mb-0 rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-[13px] text-red-400"
        >
          {formError}
        </p>
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
                  {/*
                    The list endpoint returns a flat summary (triggerKind, triggerDeviceId,
                    triggerCapabilityId) with no capability key and no action count, so the
                    old line rendered "pemicu: — · 0 aksi" for every rule — which reads as an
                    empty or broken automation. It now shows the trigger kind and points at
                    Edit for the detail rather than inventing zeros.
                  */}
                  pemicu: {row.triggerKind ?? row.trigger?.capabilityKey ?? '—'}
                  {typeof row.actionCount === 'number'
                    ? ` · ${row.actionCount} aksi`
                    : ' · buka Edit untuk melihat aksi'}
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
                onClick={() => void startEdit(row)}
                disabled={busy !== null}
                aria-label={`Edit ${row.name ?? row.id}`}
                title="Edit definisi otomasi"
                className="grid h-10 w-10 place-items-center rounded-xl border border-slate-700 text-slate-300 transition-colors hover:border-amber-500/40 hover:text-amber-300 disabled:opacity-50"
              >
                {busy === `edit-${row.id}` ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Pencil className="h-4 w-4" strokeWidth={2} />
                )}
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
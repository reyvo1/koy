'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Boxes, Loader2, Plus, Trash2, Unlink } from 'lucide-react';
import { EmptyState, useToast } from '@/components/ui-polish';
import { createLoadGuard } from '@/lib/safe-fetch';

interface DeviceRow {
  id: string;
  name: string;
  status?: string;
}

interface DeviceGroupRow {
  id: string;
  name: string;
  description?: string | null;
  createdAt?: string;
  devices: DeviceRow[];
}

const inputClass =
  'w-full rounded-xl border border-slate-700/70 bg-slate-900/60 px-3.5 py-2.5 text-[13.5px] text-slate-200 outline-none focus:border-teal-500';

function errorMessage(body: unknown, fallback: string): string {
  if (!body || typeof body !== 'object') return fallback;
  const record = body as Record<string, unknown>;
  if (typeof record.message === 'string' && record.message.trim()) return record.message;
  const error = record.error;
  if (error && typeof error === 'object') {
    const message = (error as Record<string, unknown>).message;
    if (typeof message === 'string' && message.trim()) return message;
  }
  return fallback;
}

export default function TenantDeviceGroupsContent() {
  const [groups, setGroups] = useState<DeviceGroupRow[] | null>(null);
  const [devices, setDevices] = useState<DeviceRow[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [selectedDeviceByGroup, setSelectedDeviceByGroup] = useState<Record<string, string>>({});
  const toast = useToast();

  const loadGuard = useRef(createLoadGuard());

  const load = useCallback(async () => {
    const isCurrent = loadGuard.current.begin();
    try {
      const [groupsResponse, devicesResponse] = await Promise.all([
        fetch('/api/tenant/device-groups', { cache: 'no-store' }),
        fetch('/api/admin/devices', { cache: 'no-store' }),
      ]);
      if (!groupsResponse.ok) {
        const body = await groupsResponse.json().catch(() => null);
        throw new Error(errorMessage(body, `Grup perangkat gagal dimuat (${groupsResponse.status})`));
      }
      if (!devicesResponse.ok) {
        const body = await devicesResponse.json().catch(() => null);
        throw new Error(errorMessage(body, `Perangkat gagal dimuat (${devicesResponse.status})`));
      }

      const groupsBody = (await groupsResponse.json().catch(() => { throw new Error('Backend mengembalikan respons yang tidak dapat dibaca.'); })) as { items?: DeviceGroupRow[] };
      const devicesBody = (await devicesResponse.json().catch(() => { throw new Error('Backend mengembalikan respons yang tidak dapat dibaca.'); })) as DeviceRow[] | { items?: DeviceRow[] };
      if (!isCurrent()) return;
      setGroups(Array.isArray(groupsBody.items) ? groupsBody.items : []);
      setDevices(Array.isArray(devicesBody) ? devicesBody : (devicesBody.items ?? []));
      setLoadError(null);
    } catch (cause) {
      if (!isCurrent()) return;
      setGroups([]);
      setDevices([]);
      setLoadError(cause instanceof Error ? cause.message : 'Grup perangkat tidak tersedia');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const groupedDeviceIds = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const group of groups ?? []) {
      map.set(group.id, new Set(group.devices.map((device) => device.id)));
    }
    return map;
  }, [groups]);

  const createGroup = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy('create');
    setCreateError(null);
    const form = new FormData(event.currentTarget);
    const payload = {
      name: String(form.get('name') ?? '').trim(),
      description: String(form.get('description') ?? '').trim() || undefined,
    };

    try {
      const response = await fetch('/api/tenant/device-groups', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(errorMessage(body, 'Gagal membuat grup perangkat'));
      toast.push('success', `Grup "${payload.name}" dibuat.`);
      setShowCreate(false);
      event.currentTarget.reset();
      await load();
    } catch (cause) {
      setCreateError(cause instanceof Error ? cause.message : 'Gagal membuat grup perangkat');
    } finally {
      setBusy(null);
    }
  };

  const deleteGroup = async (group: DeviceGroupRow) => {
    setBusy(`delete-group:${group.id}`);
    try {
      const response = await fetch(`/api/tenant/device-groups/${encodeURIComponent(group.id)}`, {
        method: 'DELETE',
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(errorMessage(body, 'Gagal menghapus grup'));
      toast.push('success', `Grup "${group.name}" dihapus. Perangkat tetap tersimpan.`);
      await load();
    } catch (cause) {
      toast.push('error', cause instanceof Error ? cause.message : 'Gagal menghapus grup');
    } finally {
      setBusy(null);
    }
  };

  const addMember = async (group: DeviceGroupRow) => {
    const deviceId = selectedDeviceByGroup[group.id];
    if (!deviceId) return;
    setBusy(`add:${group.id}`);
    try {
      const response = await fetch(
        `/api/tenant/device-groups/${encodeURIComponent(group.id)}/members`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ deviceId }),
        },
      );
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(errorMessage(body, 'Gagal menambah perangkat ke grup'));
      setSelectedDeviceByGroup((current) => ({ ...current, [group.id]: '' }));
      toast.push('success', 'Perangkat ditambahkan ke grup.');
      await load();
    } catch (cause) {
      toast.push('error', cause instanceof Error ? cause.message : 'Gagal menambah perangkat ke grup');
    } finally {
      setBusy(null);
    }
  };

  const removeMember = async (group: DeviceGroupRow, device: DeviceRow) => {
    setBusy(`remove:${group.id}:${device.id}`);
    try {
      const response = await fetch(
        `/api/tenant/device-groups/${encodeURIComponent(group.id)}/members/${encodeURIComponent(device.id)}`,
        { method: 'DELETE' },
      );
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(errorMessage(body, 'Gagal mengeluarkan perangkat dari grup'));
      toast.push('success', `${device.name} dikeluarkan dari ${group.name}.`);
      await load();
    } catch (cause) {
      toast.push('error', cause instanceof Error ? cause.message : 'Gagal mengeluarkan perangkat dari grup');
    } finally {
      setBusy(null);
    }
  };

  if (groups === null && !loadError) {
    return <div className="h-44 animate-pulse rounded-2xl bg-slate-800/60" />;
  }

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <p className="m-0 text-[13px] text-slate-400">
          {groups ? `${groups.length} grup · ${devices.length} perangkat tenant` : 'Memuat…'}
        </p>
        <button
          type="button"
          className="iot-button inline-flex items-center gap-2"
          onClick={() => {
            setShowCreate((value) => !value);
            setCreateError(null);
          }}
        >
          <Plus className="h-4 w-4" />
          {showCreate ? 'Tutup' : 'Buat Grup'}
        </button>
      </div>

      {showCreate ? (
        <form onSubmit={createGroup} className="iot2-panel mb-6 grid gap-4 sm:grid-cols-2" style={{ padding: 20 }}>
          <label className="block">
            <span className="mb-1.5 block text-[12px] font-semibold text-slate-400">Nama grup *</span>
            <input name="name" required maxLength={80} className={inputClass} placeholder="Contoh: Lampu Lantai 1" />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[12px] font-semibold text-slate-400">Deskripsi</span>
            <input name="description" maxLength={300} className={inputClass} placeholder="Opsional" />
          </label>
          <div className="sm:col-span-2 flex justify-end">
            <button disabled={busy !== null} className="iot-button min-w-36">
              {busy === 'create' ? 'Menyimpan…' : 'Simpan Grup'}
            </button>
          </div>
          {createError ? (
            <p role="alert" className="sm:col-span-2 m-0 rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-[13px] text-red-400">
              {createError}
            </p>
          ) : null}
        </form>
      ) : null}

      {loadError ? (
        <EmptyState
          icon={Boxes}
          title="Grup perangkat tidak tersedia"
          description={`${loadError}. Tidak ada data simulasi yang ditampilkan.`}
          action={{ label: 'Coba lagi', onClick: () => void load() }}
        />
      ) : groups && groups.length === 0 ? (
        <EmptyState
          icon={Boxes}
          title="Belum ada grup perangkat"
          description="Buat grup logis untuk mengelola perangkat tanpa mengubah penempatan fisiknya di Ruangan."
          action={{ label: '+ Buat Grup', onClick: () => setShowCreate(true) }}
        />
      ) : (
        <div className="space-y-4">
          {(groups ?? []).map((group) => {
            const memberIds = groupedDeviceIds.get(group.id) ?? new Set<string>();
            const availableDevices = devices.filter((device) => !memberIds.has(device.id));
            const selectedDevice = selectedDeviceByGroup[group.id] ?? '';
            return (
              <section key={group.id} className="iot2-panel" style={{ padding: 20 }}>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Boxes className="h-5 w-5 text-teal-300" strokeWidth={1.9} />
                      <h2 className="m-0 text-[16px] font-bold text-slate-100">{group.name}</h2>
                    </div>
                    <p className="mt-1 mb-0 text-[12.5px] text-slate-500">
                      {group.description || `${group.devices.length} perangkat`}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void deleteGroup(group)}
                    disabled={busy !== null}
                    className="inline-flex items-center gap-2 rounded-xl border border-red-500/30 px-3 py-2 text-[12.5px] font-semibold text-red-400 transition-colors hover:bg-red-500/10 disabled:opacity-50"
                  >
                    {busy === `delete-group:${group.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                    Hapus Grup
                  </button>
                </div>

                <div className="mt-5 overflow-hidden rounded-xl border border-slate-800/80">
                  {group.devices.length === 0 ? (
                    <div className="px-4 py-5 text-center text-[12.5px] text-slate-500">Belum ada perangkat di grup ini.</div>
                  ) : (
                    group.devices.map((device, index) => (
                      <div
                        key={device.id}
                        className={`flex flex-wrap items-center gap-3 px-4 py-3 ${index ? 'border-t border-slate-800/80' : ''}`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="text-[13.5px] font-semibold text-slate-200">{device.name}</div>
                          <div className="text-[11.5px] text-slate-500">{device.status ?? 'UNKNOWN'}</div>
                        </div>
                        <button
                          type="button"
                          aria-label={`Keluarkan ${device.name} dari ${group.name}`}
                          onClick={() => void removeMember(group, device)}
                          disabled={busy !== null}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700/70 px-2.5 py-1.5 text-[11.5px] font-semibold text-slate-400 hover:border-red-500/40 hover:text-red-400 disabled:opacity-50"
                        >
                          {busy === `remove:${group.id}:${device.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Unlink className="h-3.5 w-3.5" />}
                          Keluarkan
                        </button>
                      </div>
                    ))
                  )}
                </div>

                <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                  <select
                    value={selectedDevice}
                    onChange={(event) =>
                      setSelectedDeviceByGroup((current) => ({ ...current, [group.id]: event.target.value }))
                    }
                    disabled={availableDevices.length === 0 || busy !== null}
                    className={`${inputClass} sm:flex-1`}
                  >
                    <option value="">
                      {availableDevices.length ? 'Pilih perangkat untuk ditambahkan…' : 'Semua perangkat sudah menjadi anggota'}
                    </option>
                    {availableDevices.map((device) => (
                      <option key={device.id} value={device.id}>
                        {device.name} · {device.status ?? 'UNKNOWN'}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => void addMember(group)}
                    disabled={!selectedDevice || busy !== null}
                    className="iot-button sm:min-w-40"
                  >
                    {busy === `add:${group.id}` ? 'Menambahkan…' : 'Tambah Anggota'}
                  </button>
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

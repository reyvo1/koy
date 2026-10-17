'use client';

/**
 * Tenant Scenes (Modul 12) — full lifecycle: create (name + action builder
 * with per-device writable capabilities), run, delete. Dark unified v2.2.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Play,
  MoonStar,
  Sun,
  Lock,
  Clapperboard,
  ServerCrash,
  Loader2,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { EmptyState, SkeletonCard, useToast, shadow } from '@/components/ui-polish';
import { CapabilityValueInput } from '@/components/capability-value-input';
import { parseCapabilityValue } from '@/lib/capability-value';
import { createLoadGuard } from '@/lib/safe-fetch';

interface SceneCard {
  id: string;
  name: string;
  enabled?: boolean;
  actions?: Array<{ id?: string }>;
}

interface ExecutionRow {
  id: string;
  status?: string;
  startedAt?: string | null;
  completedAt?: string | null;
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
  constraints?: unknown;
}

interface ActionRow {
  deviceId: string;
  capabilityId: string;
  capabilityKey: string;
  value: string;
}

const SCENE_ICONS: LucideIcon[] = [MoonStar, Sun, Lock, Clapperboard];
const SCENE_TONES = [
  'from-indigo-500/15 to-slate-500/10 text-indigo-300',
  'from-amber-500/15 to-orange-500/10 text-amber-300',
  'from-slate-500/15 to-slate-400/10 text-slate-300',
  'from-teal-500/15 to-emerald-500/10 text-teal-300',
];

const inputClass =
  'w-full rounded-xl border border-slate-700/70 bg-slate-900/60 px-3.5 py-2.5 text-[13.5px] text-slate-200 outline-none focus:border-teal-500';


export default function TenantScenesContent() {
  const [scenes, setScenes] = useState<SceneCard[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [actions, setActions] = useState<ActionRow[]>([
    { deviceId: '', capabilityId: '', capabilityKey: '', value: '' },
  ]);
  const [devices, setDevices] = useState<DeviceRow[]>([]);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [capsCache, setCapsCache] = useState<Record<string, CapabilityRow[]>>({});
  const [historyId, setHistoryId] = useState<string | null>(null);
  const [history, setHistory] = useState<ExecutionRow[] | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const toast = useToast();

  const loadHistory = useCallback(async (sceneId: string) => {
    setHistoryId((prev) => (prev === sceneId ? null : sceneId));
    setHistory(null);
    setHistoryError(null);
    try {
      const res = await fetch(`/api/tenant/scenes/${sceneId}/executions?limit=8`);
      if (!res.ok) throw new Error('gagal');
      const data = (await res.json().catch(() => { throw new Error('Backend mengembalikan respons yang tidak dapat dibaca.'); })) as { items?: ExecutionRow[] } | ExecutionRow[];
      setHistory(Array.isArray(data) ? data : (data.items ?? []));
    } catch (cause) {
      setHistory([]);
      setHistoryError(cause instanceof Error ? cause.message : 'gagal memuat riwayat scene');
    }
  }, []);

  const loadGuard = useRef(createLoadGuard());

  const load = useCallback(async () => {
    const isCurrent = loadGuard.current.begin();
    try {
      const response = await fetch('/api/tenant/scenes');
      if (!response.ok) throw new Error(`backend ${response.status}`);
      const body = (await response.json().catch(() => { throw new Error('Backend mengembalikan respons yang tidak dapat dibaca.'); })) as { items?: SceneCard[] } | SceneCard[];
      if (!isCurrent()) return;
      setScenes(Array.isArray(body) ? body : (body.items ?? []));
      setError(null);
    } catch (cause) {
      if (!isCurrent()) return;
      setScenes([]);
      setError(cause instanceof Error ? cause.message : 'gagal memuat scene');
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
      const writable = caps.find((c) => c.isWritable === true && String(c.dataType ?? '').toLowerCase() !== 'object');
      if (writable) {
        next[index].capabilityId = writable.id;
        next[index].capabilityKey = writable.key;
      }
    }
    setActions(next);
  };

  const createScene = async () => {
    setBusy('create');
    setFormError(null);
    try {
      const payload = {
        name: name.trim(),
        actions: actions
          .filter((a) => a.deviceId && a.capabilityId && a.value !== '')
          .map((a, i) => {
            const capability = (capsCache[a.deviceId] ?? []).find((candidate) => candidate.id === a.capabilityId);
            if (!capability || capability.isWritable !== true || String(capability.dataType ?? '').toLowerCase() === 'object') {
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
      const res = await fetch('/api/tenant/scenes', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = (await res.json().catch(() => ({}))) as { id?: string; error?: { message?: string }; message?: string };
      if (!res.ok) throw new Error(body.error?.message ?? body.message ?? 'Gagal membuat scene');
      if (!body.id) {
        throw new Error('Backend tidak mengembalikan id scene yang baru dibuat');
      }
      const enableResponse = await fetch(`/api/tenant/scenes/${body.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ enabled: true }),
      });
      const enableBody = (await enableResponse.json().catch(() => ({}))) as {
        error?: { message?: string };
        message?: string;
      };
      if (!enableResponse.ok) {
        // Creation did succeed; report that exact partial state instead of claiming the scene
        // is active. The operator can retry activation from the card after the list reloads.
        await load();
        throw new Error(
          `Scene dibuat tetapi gagal diaktifkan: ${
            enableBody.error?.message ?? enableBody.message ?? `HTTP ${enableResponse.status}`
          }`,
        );
      }
      toast.push('success', `Scene "${payload.name}" dibuat & aktif.`);
      setName('');
      setActions([{ deviceId: '', capabilityId: '', capabilityKey: '', value: '' }]);
      setShowForm(false);
      await load();
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : 'Gagal membuat scene');
    } finally {
      setBusy(null);
    }
  };

  const toggleScene = async (scene: SceneCard) => {
    setBusy(`toggle-${scene.id}`);
    try {
      const res = await fetch(`/api/tenant/scenes/${scene.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ enabled: !scene.enabled }),
      });
      if (!res.ok) throw new Error('Gagal mengubah status scene');
      await load();
    } catch (cause) {
      toast.push('error', cause instanceof Error ? cause.message : 'Gagal mengubah status scene');
    } finally {
      setBusy(null);
    }
  };

  const deleteScene = async (sceneId: string, sceneName: string) => {
    setBusy(`delete-${sceneId}`);
    try {
      const res = await fetch(`/api/tenant/scenes/${sceneId}`, { method: 'DELETE' });
      const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
      if (!res.ok) throw new Error(body.error?.message ?? 'Gagal menghapus scene');
      toast.push('success', `Scene "${sceneName}" dihapus.`);
      await load();
    } catch (cause) {
      toast.push('error', cause instanceof Error ? cause.message : 'Gagal menghapus scene');
    } finally {
      setBusy(null);
    }
  };

  const runScene = async (sceneId: string, sceneName: string) => {
    setRunningId(sceneId);
    try {
      const response = await fetch(`/api/tenant/scenes/${sceneId}/run`, { method: 'POST' });
      if (response.ok) {
        toast.push('success', `Scene "${sceneName}" berhasil dijalankan.`);
      } else {
        toast.push('error', `Gagal menjalankan scene (HTTP ${response.status}).`);
      }
      await load();
    } catch {
      toast.push('error', 'Gagal menjalankan scene.');
    } finally {
      setRunningId(null);
    }
  };

  if (!scenes && !error) {
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
      <div className="mb-5 flex justify-end">
        <button type="button" onClick={() => setShowForm((v) => !v)} className="iot-button">
          {showForm ? 'Tutup' : '+ Buat Scene'}
        </button>
      </div>

      {showForm ? (
        <div className="iot2-panel mb-6" style={{ padding: 20 }}>
          <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
            <label className="block">
              <span className="mb-1.5 block text-[12px] font-semibold" style={{ color: 'var(--iot-text-muted)' }}>Nama scene *</span>
              <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="Malam Hari" className={inputClass} />
            </label>
          </div>
          <div className="mt-4 space-y-3">
            {actions.map((action, i) => {
              const caps = action.deviceId ? (capsCache[action.deviceId] ?? []) : [];
              const cap = caps.find((c) => c.id === action.capabilityId);
              return (
                <div key={i} className="grid gap-2 rounded-xl border border-slate-800/70 p-3 sm:grid-cols-[1fr_1fr_120px_auto]">
                  <select
                    value={action.deviceId}
                    onChange={(e) => void updateAction(i, { deviceId: e.target.value, capabilityId: '', capabilityKey: '', value: '' })}
                    className={inputClass}
                  >
                    <option value="">Pilih perangkat…</option>
                    {devices.map((d) => (
                      <option key={d.id} value={d.id}>{d.name ?? d.id.slice(0, 8)}</option>
                    ))}
                  </select>
                  <select
                    value={action.capabilityId}
                    onChange={(e) => {
                      const c = caps.find((x) => x.id === e.target.value);
                      void updateAction(i, { capabilityId: e.target.value, capabilityKey: c?.key ?? '', value: '' });
                    }}
                    disabled={!action.deviceId}
                    className={inputClass}
                  >
                    <option value="">Pilih kemampuan…</option>
                    {caps.filter((c) => c.isWritable === true && String(c.dataType ?? '').toLowerCase() !== 'object').map((c) => (
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
                  <button
                    type="button"
                    onClick={() => setActions(actions.filter((_, j) => j !== i))}
                    className="grid h-10 w-10 place-items-center self-center rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10"
                    aria-label="Hapus aksi"
                  >
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
              Katalog perangkat/capability tidak tersedia ({catalogError}). Pembuatan scene dinonaktifkan sampai katalog berhasil dimuat.
            </p>
          ) : devices.length === 0 ? (
            <p className="mt-4 m-0 rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-[13px] text-amber-300">
              Belum ada perangkat yang dapat dipakai untuk scene.
            </p>
          ) : null}
          <button
            type="button"
            onClick={() => void createScene()}
            disabled={busy !== null || !name.trim() || Boolean(catalogError) || devices.length === 0}
            className="iot-button mt-4"
          >
            {busy === 'create' ? 'Menyimpan…' : 'Simpan Scene'}
          </button>
          {formError ? (
            <p role="alert" className="mt-3 mb-0 rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-[13px] text-red-400">
              {formError}
            </p>
          ) : null}
        </div>
      ) : null}

      {error || !scenes || scenes.length === 0 ? (
        <EmptyState
          icon={error ? ServerCrash : Clapperboard}
          title={error ? 'Daftar scene tidak tersedia' : 'Belum ada scene'}
          description={
            error
              ? `${error}. Coba beberapa saat lagi.`
              : 'Buat scene pertama untuk menjalankan beberapa aksi sekaligus satu sentuhan.'
          }
          action={error ? undefined : { label: '+ Buat Scene', onClick: () => setShowForm(true) }}
        />
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {scenes.map((scene, index) => {
            const Icon = SCENE_ICONS[index % SCENE_ICONS.length];
            const tone = SCENE_TONES[index % SCENE_TONES.length];
            const running = runningId === scene.id;
            const deleting = busy === `delete-${scene.id}`;
            return (
              <div
                key={scene.id}
                style={{ animationDelay: `${index * 50}ms` }}
                className={`group flex flex-col rounded-3xl border border-slate-800/80 bg-[#111c2e] p-6 transition-all duration-200 ease-out hover:-translate-y-1.5 hover:border-teal-500/40 animate-in fade-in slide-in-from-bottom-1 fill-mode-both ${shadow.card} ${shadow.cardHover}`}
              >
                <span className={`grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br transition-transform duration-200 group-hover:scale-110 ${tone}`}>
                  <Icon className="h-6 w-6" strokeWidth={1.8} />
                </span>
                <div className="mt-4 text-[16px] font-bold tracking-tight text-slate-100">
                  {scene.name}
                </div>
                <div className="mt-1 line-clamp-2 min-h-[36px] text-[12.5px] font-medium text-slate-500">
                  {`${scene.actions?.length ?? 0} aksi terkait`}
                </div>
                <div className="mt-4 flex gap-2">
                  <button
                    onClick={() => void runScene(scene.id, scene.name)}
                    disabled={running || busy !== null || scene.enabled === false}
                    title={scene.enabled === false ? 'Scene nonaktif — aktifkan dulu' : 'Jalankan scene'}
                    className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-teal-500/15 px-4 py-2.5 text-[13px] font-bold text-teal-300 ring-1 ring-inset ring-teal-500/25 transition-all duration-200 hover:-translate-y-0.5 hover:bg-teal-500/25 disabled:pointer-events-none disabled:opacity-50"
                  >
                    {running ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.2} />
                        Menjalankan…
                      </>
                    ) : (
                      <>
                        <Play className="h-4 w-4" strokeWidth={2.4} />
                        Jalankan
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => void loadHistory(scene.id)}
                    className={`rounded-xl px-3 py-2.5 text-[12px] font-bold ring-1 ring-inset transition-colors ${
                      historyId === scene.id
                        ? 'bg-sky-500/15 text-sky-300 ring-sky-500/30'
                        : 'bg-slate-500/10 text-slate-400 ring-slate-500/25 hover:bg-slate-500/20'
                    }`}
                  >
                    Riwayat
                  </button>
                  <button
                    onClick={() => void toggleScene(scene)}
                    disabled={busy !== null}
                    className={`w-[86px] rounded-xl px-2 py-2.5 text-[12px] font-bold ring-1 ring-inset transition-colors disabled:opacity-50 ${
                      scene.enabled === false
                        ? 'bg-slate-500/10 text-slate-400 ring-slate-500/25 hover:bg-slate-500/20'
                        : 'bg-emerald-500/10 text-emerald-400 ring-emerald-500/25 hover:bg-emerald-500/20'
                    }`}
                  >
                    {busy === `toggle-${scene.id}` ? '…' : scene.enabled === false ? 'MATI' : 'AKTIF'}
                  </button>
                  <button
                    onClick={() => void deleteScene(scene.id, scene.name)}
                    disabled={busy !== null}
                    aria-label={`Hapus ${scene.name}`}
                    className="grid w-11 place-items-center rounded-xl border border-red-500/30 text-red-400 transition-colors hover:bg-red-500/10 disabled:opacity-50"
                  >
                    {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" strokeWidth={2} />}
                  </button>
                </div>
                {historyId === scene.id ? (
                  <div className="mt-3 rounded-xl border border-slate-800/70 bg-slate-900/50 p-3">
                    <div className="mb-2 text-[11px] font-bold uppercase tracking-widest text-slate-500">
                      Riwayat eksekusi
                    </div>
                    {historyError ? (
                      <p role="alert" className="m-0 text-[12px] text-red-400">Riwayat eksekusi gagal dimuat ({historyError}).</p>
                    ) : history === null ? (
                      <div className="h-16 animate-pulse rounded-lg bg-slate-800/50" />
                    ) : history.length === 0 ? (
                      <p className="m-0 text-[12px] text-slate-500">Belum pernah dijalankan.</p>
                    ) : (
                      <ul className="m-0 space-y-1.5 p-0">
                        {history.map((exec) => (
                          <li key={exec.id} className="flex items-center gap-2 text-[12px]">
                            <span
                              className={`rounded-full px-2 py-0.5 text-[10.5px] font-bold ${
                                exec.status === 'SUCCEEDED'
                                  ? 'bg-emerald-500/10 text-emerald-400'
                                  : exec.status === 'PARTIALLY_FAILED'
                                    ? 'bg-amber-500/10 text-amber-400'
                                    : 'bg-red-500/10 text-red-400'
                              }`}
                            >
                              {exec.status ?? '?'}
                            </span>
                            <span className="text-slate-500">
                              {exec.startedAt ? new Date(exec.startedAt).toLocaleString('id-ID') : '—'}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

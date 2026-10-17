'use client';

/**
 * Schedules (Modul 13) — full lifecycle: create (CRON/COUNTDOWN → target
 * scene), enable/disable toggle, delete. Dark unified v2.2. Fail-closed.
 */

import { Fragment, useCallback, useEffect, useState } from 'react';
import { Clock, Trash2, Loader2 } from 'lucide-react';
import { EmptyState, useToast } from '@/components/ui-polish';

interface ScheduleRow {
  id: string;
  name: string;
  kind?: string;
  expression?: string;
  countdownSeconds?: number | null;
  enabled?: boolean;
  timezone?: string;
  repeat?: string;
  targetSceneId?: string;
}

interface RunRow {
  id: string;
  scheduledFor?: string;
  status?: string;
  completedAt?: string | null;
}

interface SceneOption {
  id: string;
  name: string;
}

const inputClass =
  'w-full rounded-xl border border-slate-700/70 bg-slate-900/60 px-3.5 py-2.5 text-[13.5px] text-slate-200 outline-none focus:border-teal-500';

export default function TenantSchedulesContent() {
  const [rows, setRows] = useState<ScheduleRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [scenes, setScenes] = useState<SceneOption[]>([]);
  const [sceneCatalogError, setSceneCatalogError] = useState<string | null>(null);
  const [kind, setKind] = useState<'CRON' | 'COUNTDOWN'>('CRON');
  const [repeat, setRepeat] = useState<'INDEFINITE' | 'LIMITED' | 'ONCE'>('INDEFINITE');
  const [historyId, setHistoryId] = useState<string | null>(null);
  const [history, setHistory] = useState<RunRow[] | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const toast = useToast();

  const loadHistory = useCallback(async (scheduleId: string) => {
    setHistoryId((prev) => (prev === scheduleId ? null : scheduleId));
    setHistory(null);
    setHistoryError(null);
    try {
      const res = await fetch(`/api/tenant/schedules/${scheduleId}/runs?limit=8`);
      if (!res.ok) throw new Error('gagal');
      const data = (await res.json().catch(() => { throw new Error('Backend mengembalikan respons yang tidak dapat dibaca.'); })) as { items?: RunRow[] } | RunRow[];
      setHistory(Array.isArray(data) ? data : (data.items ?? []));
    } catch (cause) {
      setHistory([]);
      setHistoryError(cause instanceof Error ? cause.message : 'gagal memuat riwayat jadwal');
    }
  }, []);

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/tenant/schedules');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const body = (await response.json().catch(() => { throw new Error('Backend mengembalikan respons yang tidak dapat dibaca.'); })) as { items?: ScheduleRow[] } | ScheduleRow[];
      setRows(Array.isArray(body) ? body : (body.items ?? []));
      setError(null);
    } catch (cause) {
      setRows([]);
      setError(cause instanceof Error ? cause.message : 'gagal memuat jadwal');
    }
  }, []);

  useEffect(() => {
    void load();
    setSceneCatalogError(null);
    fetch('/api/tenant/scenes')
      .then(async (res) => {
        if (!res.ok) throw new Error(`backend ${res.status}`);
        return res.json().catch(() => { throw new Error('Backend mengembalikan respons yang tidak dapat dibaca.'); });
      })
      .then((data: { items?: SceneOption[] } | SceneOption[]) =>
        setScenes(Array.isArray(data) ? data : (data.items ?? [])),
      )
      .catch((cause: unknown) => {
        setSceneCatalogError(cause instanceof Error ? cause.message : 'gagal memuat scene');
      });
  }, [load]);

  const createSchedule = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy('create');
    setFormError(null);
    const form = new FormData(event.currentTarget);
    const payload: Record<string, unknown> = {
      name: String(form.get('name') ?? '').trim(),
      kind,
      timezone: String(form.get('timezone') ?? 'Asia/Jakarta'),
      targetSceneId: String(form.get('targetSceneId') ?? ''),
      repeat,
    };
    if (repeat === 'LIMITED') {
      payload.maxRuns = Number(form.get('maxRuns') ?? 1);
    }
    if (kind === 'CRON') payload.expression = String(form.get('expression') ?? '').trim();
    else payload.countdownSeconds = Number(form.get('countdownSeconds') ?? 60);
    try {
      const res = await fetch('/api/tenant/schedules', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: { message?: string }; message?: string };
      if (!res.ok) throw new Error(body.error?.message ?? body.message ?? 'Gagal membuat jadwal');
      toast.push('success', `Jadwal "${payload.name}" dibuat (nonaktif — aktifkan untuk mulai).`);
      setShowForm(false);
      await load();
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : 'Gagal membuat jadwal');
    } finally {
      setBusy(null);
    }
  };

  const toggle = async (row: ScheduleRow) => {
    setBusy(`toggle-${row.id}`);
    try {
      const res = await fetch(`/api/tenant/schedules/${row.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ enabled: !row.enabled }),
      });
      if (!res.ok) throw new Error('Gagal mengubah status');
      await load();
    } catch (cause) {
      toast.push('error', cause instanceof Error ? cause.message : 'Gagal mengubah status');
    } finally {
      setBusy(null);
    }
  };

  const remove = async (row: ScheduleRow) => {
    setBusy(`delete-${row.id}`);
    try {
      const res = await fetch(`/api/tenant/schedules/${row.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Gagal menghapus jadwal');
      toast.push('success', `Jadwal "${row.name}" dihapus.`);
      await load();
    } catch (cause) {
      toast.push('error', cause instanceof Error ? cause.message : 'Gagal menghapus jadwal');
    } finally {
      setBusy(null);
    }
  };

  if (rows === null && !error) {
    return (
      <div className="space-y-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-16 animate-pulse rounded-2xl bg-slate-800/60" />
        ))}
      </div>
    );
  }

  return (
    <div>
      <div className="mb-5 flex justify-end">
        <button type="button" onClick={() => setShowForm((v) => !v)} className="iot-button">
          {showForm ? 'Tutup' : '+ Buat Jadwal'}
        </button>
      </div>

      {showForm ? (
        <form onSubmit={createSchedule} className="iot2-panel mb-6 grid gap-4 sm:grid-cols-2" style={{ padding: 20 }}>
          <label className="block">
            <span className="mb-1.5 block text-[12px] font-semibold" style={{ color: 'var(--iot-text-muted)' }}>Nama jadwal *</span>
            <input name="name" required maxLength={60} placeholder="Lampu Taman Malam" className={inputClass} />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[12px] font-semibold" style={{ color: 'var(--iot-text-muted)' }}>Scene tujuan *</span>
            <select name="targetSceneId" required className={inputClass} defaultValue="">
              <option value="" disabled>Pilih scene…</option>
              {scenes.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[12px] font-semibold" style={{ color: 'var(--iot-text-muted)' }}>Tipe</span>
            <select value={kind} onChange={(e) => setKind(e.target.value as 'CRON' | 'COUNTDOWN')} className={inputClass}>
              <option value="CRON">CRON (berulang)</option>
              <option value="COUNTDOWN">Hitung mundur (detik)</option>
            </select>
          </label>
          {kind === 'CRON' ? (
            <label className="block">
              <span className="mb-1.5 block text-[12px] font-semibold" style={{ color: 'var(--iot-text-muted)' }}>Ekspresi CRON *</span>
              <input name="expression" required placeholder="0 19 * * *" className={inputClass} />
            </label>
          ) : (
            <label className="block">
              <span className="mb-1.5 block text-[12px] font-semibold" style={{ color: 'var(--iot-text-muted)' }}>Detik *</span>
              <input name="countdownSeconds" type="number" min={10} max={86400} required defaultValue={300} className={inputClass} />
            </label>
          )}
          <label className="block">
            <span className="mb-1.5 block text-[12px] font-semibold" style={{ color: 'var(--iot-text-muted)' }}>Pengulangan</span>
            <select
              name="repeat"
              value={repeat}
              onChange={(e) =>
                setRepeat(e.target.value as 'INDEFINITE' | 'LIMITED' | 'ONCE')
              }
              className={inputClass}
            >
              <option value="INDEFINITE">Terus berulang</option>
              <option value="LIMITED">Batasi jumlah run</option>
              <option value="ONCE">Sekali saja</option>
            </select>
          </label>
          {repeat === 'LIMITED' ? (
            <label className="block">
              <span className="mb-1.5 block text-[12px] font-semibold" style={{ color: 'var(--iot-text-muted)' }}>Maksimum run *</span>
              <input
                name="maxRuns"
                type="number"
                min={1}
                max={10000}
                required
                defaultValue={10}
                className={inputClass}
              />
            </label>
          ) : null}
          <label className="block">
            <span className="mb-1.5 block text-[12px] font-semibold" style={{ color: 'var(--iot-text-muted)' }}>Zona waktu</span>
            <select name="timezone" defaultValue="Asia/Jakarta" className={inputClass}>
              <option value="Asia/Jakarta">Asia/Jakarta (WIB)</option>
              <option value="Asia/Makassar">Asia/Makassar (WITA)</option>
              <option value="Asia/Jayapura">Asia/Jayapura (WIT)</option>
              <option value="UTC">UTC</option>
            </select>
          </label>
          {sceneCatalogError ? (
            <p role="alert" className="sm:col-span-2 m-0 rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-[13px] text-red-400">
              Katalog scene tidak tersedia ({sceneCatalogError}). Pembuatan jadwal dinonaktifkan sampai scene berhasil dimuat.
            </p>
          ) : scenes.length === 0 ? (
            <p className="sm:col-span-2 m-0 rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-[13px] text-amber-300">
              Belum ada scene. Buat scene terlebih dahulu sebelum membuat jadwal.
            </p>
          ) : null}
          <div className="flex items-end">
            <button disabled={busy !== null || Boolean(sceneCatalogError) || scenes.length === 0} className="iot-button w-full">
              {busy === 'create' ? 'Menyimpan…' : 'Simpan Jadwal'}
            </button>
          </div>
          {formError ? (
            <p role="alert" className="sm:col-span-2 m-0 rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-[13px] text-red-400">
              {formError}
            </p>
          ) : null}
        </form>
      ) : null}

      {error ? (
        <EmptyState icon={Clock} title="Jadwal tidak tersedia" description={`${error}. Coba beberapa saat lagi.`} />
      ) : !rows || rows.length === 0 ? (
        <EmptyState
          icon={Clock}
          title="Belum ada jadwal"
          description="Buat jadwal berbasis CRON atau hitung mundur yang memicu scene otomatis."
          action={{ label: '+ Buat Jadwal', onClick: () => setShowForm(true) }}
        />
      ) : (
        <div className="space-y-3">
          {rows.map((row) => (
            <Fragment key={row.id}>
            <div className="iot2-panel flex flex-wrap items-center gap-4" style={{ padding: '16px 20px' }}>
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-teal-500/15">
                <Clock className="h-5 w-5 text-teal-300" strokeWidth={1.9} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[15px] font-bold text-slate-100">{row.name}</div>
                <div className="text-[12px]" style={{ color: 'var(--iot-text-muted)' }}>
                  {row.kind === 'COUNTDOWN'
                    ? `setiap ${row.countdownSeconds ?? '?'} detik`
                    : row.expression || '—'}{' '}
                  · {row.timezone ?? 'UTC'} ·{' '}
                  {row.repeat === 'ONCE'
                    ? 'sekali'
                    : row.repeat === 'LIMITED'
                      ? 'terbatas'
                      : 'berulang'}
                </div>
              </div>
              <button
                type="button"
                onClick={() => void toggle(row)}
                disabled={busy !== null}
                className={`iot2-badge cursor-pointer ${row.enabled ? 'iot2-badge--online' : 'iot2-badge--offline'}`}
                style={{ border: '1px solid rgba(148,163,184,.25)' }}
              >
                {busy === `toggle-${row.id}` ? '…' : row.enabled ? 'AKTIF — klik matikan' : 'MATI — klik aktifkan'}
              </button>
              <button
                type="button"
                onClick={() => void loadHistory(row.id)}
                className={`iot2-badge cursor-pointer ${historyId === row.id ? 'iot2-badge--warning' : ''}`}
                style={{ border: '1px solid rgba(148,163,184,.25)' }}
              >
                Riwayat
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
            {historyId === row.id ? (
              <div className="mt-3 rounded-xl border border-slate-800/70 bg-slate-900/50 p-4">
                <div className="mb-2 text-[11px] font-bold uppercase tracking-widest text-slate-500">
                  Riwayat run
                </div>
                {historyError ? (
                  <p role="alert" className="m-0 text-[12.5px] text-red-400">Riwayat jadwal gagal dimuat ({historyError}).</p>
                ) : history === null ? (
                  <div className="h-16 animate-pulse rounded-lg bg-slate-800/50" />
                ) : history.length === 0 ? (
                  <p className="m-0 text-[12.5px] text-slate-500">
                    Belum ada run — jadwal dijalankan scheduler saat aktif.
                  </p>
                ) : (
                  <ul className="m-0 space-y-1.5 p-0">
                    {history.map((run) => (
                      <li key={run.id} className="flex flex-wrap items-center gap-2 text-[12.5px]">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10.5px] font-bold ${
                            run.status === 'SUCCEEDED'
                              ? 'bg-emerald-500/10 text-emerald-400'
                              : run.status === 'PENDING'
                                ? 'bg-sky-500/10 text-sky-400'
                                : 'bg-red-500/10 text-red-400'
                          }`}
                        >
                          {run.status ?? '?'}
                        </span>
                        <span className="text-slate-500">
                          {run.scheduledFor ? new Date(run.scheduledFor).toLocaleString('id-ID') : '—'}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : null}
          </Fragment>
          ))}
        </div>
      )}
    </div>
  );
}

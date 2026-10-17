'use client';

/**
 * Super Admin Firmware & OTA (blueprint §1) — live artifacts + rollouts
 * via /api/super/firmware (Modul 15). Fail-closed.
 */

import { useCallback, useEffect, useState } from 'react';

interface ArtifactRow {
  id: string;
  version: string;
  sha256Prefix: string;
  sizeBytes: number;
  createdAt: string;
}

interface RolloutRow {
  id: string;
  firmwareId: string;
  status: string;
  targetCount: number;
  completedCount: number;
  failedCount: number;
  updatedAt: string;
}

/**
 * `OtaRolloutStatus` as Prisma declares it. Terminal states are COMPLETED and ROLLED_BACK.
 *
 * This list previously compared against `'COMPLETE'` and `'ABORTED'`, which are not members
 * of the enum, so the filter never excluded anything and every finished rollout was counted
 * as active. A wrong count is worse than no count: the operator reads it as fleet state.
 */
const TERMINAL_STATUSES = new Set(['COMPLETED', 'ROLLED_BACK']);

/** The transitions an operator may drive. COMPLETED is derived by the backend, not chosen. */
const OPERATOR_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ['PUBLISHED'],
  PUBLISHED: ['IN_PROGRESS', 'ROLLED_BACK'],
  IN_PROGRESS: ['ROLLED_BACK'],
};

export default function SuperFirmwareContent() {
  const [data, setData] = useState<{
    items: ArtifactRow[];
    rollouts: RolloutRow[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);

  const load = useCallback(async () => {
    const res = await fetch('/api/super/firmware');
    if (!res.ok) throw new Error(`backend ${res.status}`);
    const payload: { items?: ArtifactRow[]; rollouts?: RolloutRow[] } = await res.json().catch(() => { throw new Error('Backend mengembalikan respons yang tidak dapat dibaca.'); });
    setData({ items: payload.items ?? [], rollouts: payload.rollouts ?? [] });
  }, []);

  useEffect(() => {
    let cancelled = false;
    load()
      .catch((cause: unknown) => {
        if (!cancelled)
          setError(cause instanceof Error ? cause.message : 'gagal memuat');
      })
      .finally(() => {
        /* fail-closed: the panel above renders the error, this one never masks it */
      });
    return () => {
      cancelled = true;
    };
  }, [load]);

  const post = async (key: string, url: string, body: unknown) => {
    setBusy(key);
    setNotice(null);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        setNotice({
          tone: 'bad',
          text: (payload as { message?: string }).message ?? `Gagal (${res.status})`,
        });
        return false;
      }
      await load();
      return true;
    } catch (cause) {
      setNotice({
        tone: 'bad',
        text: cause instanceof Error ? cause.message : 'Permintaan gagal',
      });
      return false;
    } finally {
      setBusy(null);
    }
  };

  const createArtifact = async (form: HTMLFormElement) => {
    const fields = new FormData(form);
    const ok = await post('artifact', '/api/ota/firmware-artifacts', {
      version: String(fields.get('version') ?? ''),
      artifactUrl: String(fields.get('artifactUrl') ?? ''),
      sha256: String(fields.get('sha256') ?? '').trim().toLowerCase(),
      sizeBytes: Number(fields.get('sizeBytes')),
      compatibleModels: String(fields.get('compatibleModels') ?? '')
        .split(',')
        .map((m) => m.trim())
        .filter(Boolean),
    });
    if (ok) {
      form.reset();
      setNotice({ tone: 'ok', text: 'Artefak firmware terdaftar.' });
    }
  };

  const createRollout = async (form: HTMLFormElement) => {
    const fields = new FormData(form);
    const ok = await post('rollout', '/api/ota/rollouts', {
      firmwareId: String(fields.get('firmwareId') ?? ''),
      targetDeviceIds: String(fields.get('targetDeviceIds') ?? '')
        .split(/[\s,]+/)
        .map((d) => d.trim())
        .filter(Boolean),
    });
    if (ok) {
      form.reset();
      setNotice({ tone: 'ok', text: 'Rollout DRAFT dibuat.' });
    }
  };

  const transition = (rollout: RolloutRow, status: string) =>
    post(`t-${rollout.id}-${status}`, `/api/ota/rollouts/${rollout.id}/transition`, {
      status,
    }).then((ok) => {
      if (ok) setNotice({ tone: 'ok', text: `Rollout ${rollout.id.slice(0, 8)}… → ${status}` });
    });

  const reportProgress = (rollout: RolloutRow, outcome: 'succeeded' | 'failed') => {
    // One device at a time is the honest unit: the operator knows which device reported, and
    // a rollout is only finalised once every target has reported at least once.
    const reported = window.prompt(
      outcome === 'succeeded'
        ? 'ID perangkat yang berhasil (pisahkan dengan koma):'
        : 'ID perangkat yang GAGAL (pisahkan dengan koma):',
    );
    if (!reported) return;
    const ids = reported
      .split(/[\s,]+/)
      .map((d) => d.trim())
      .filter(Boolean);
    if (ids.length === 0) return;
    void post(
      `p-${rollout.id}-${outcome}`,
      `/api/ota/rollouts/${rollout.id}/progress`,
      outcome === 'succeeded'
        ? { succeededDeviceIds: ids, failedDeviceIds: [] }
        : { succeededDeviceIds: [], failedDeviceIds: ids },
    ).then((ok) => {
      if (ok) {
        setNotice({
          tone: 'ok',
          text: `${ids.length} perangkat dilaporkan (${outcome}).`,
        });
      }
    });
  };

  if (error && !data) {
    return (
      <div className="rounded-xl border border-dashed border-slate-700/70 p-10 text-center">
        <p className="m-0 text-[15px] font-semibold text-slate-300">
          Data firmware tidak tersedia
        </p>
        <p className="mt-2 text-[13px] text-slate-500">Backend ({error}).</p>
      </div>
    );
  }

  if (!data) {
    return <div className="h-48 animate-pulse rounded-xl bg-slate-800/60" />;
  }

  const activeRollouts = data.rollouts.filter(
    (r) => !TERMINAL_STATUSES.has(r.status),
  ).length;
  const totalCompleted = data.rollouts.reduce(
    (sum, r) => sum + r.completedCount,
    0,
  );

  return (
    <div>
      <div className="mb-5 flex flex-wrap gap-4">
        {[
          ['Artefak', String(data.items.length)],
          ['Rollout Aktif', String(activeRollouts)],
          ['Selesai Tercatat', String(totalCompleted)],
        ].map(([label, value]) => (
          <div
            key={label}
            className="flex-1 rounded-xl border border-slate-800/70 bg-slate-900/50 px-4 py-3"
          >
            <div className="text-[12px] text-slate-400">{label}</div>
            <div className="text-[22px] font-extrabold text-white">{value}</div>
          </div>
        ))}
      </div>

      {notice ? (
        <p
          role="status"
          className={`mb-4 rounded-lg border px-4 py-2.5 text-[12.5px] ${
            notice.tone === 'ok'
              ? 'border-teal-500/25 bg-teal-500/[.07] text-teal-200'
              : 'border-rose-500/25 bg-rose-500/[.07] text-rose-200'
          }`}
        >
          {notice.text}
        </p>
      ) : null}

      {data.items.length === 0 ? (
        <p className="m-0 py-10 text-center text-[13.5px] text-slate-500">
          Belum ada artefak firmware yang terdaftar.
        </p>
      ) : (
        <table className="w-full text-left text-[13.5px]">
          <thead>
            <tr className="border-b border-slate-800 text-[11px] uppercase tracking-wider text-slate-500">
              <th className="py-2.5 font-bold">Versi</th>
              <th className="py-2.5 font-bold">Digest SHA-256 (metadata)</th>
              <th className="py-2.5 font-bold">Ukuran</th>
              <th className="py-2.5 font-bold">Terdaftar</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((artifact) => (
              <tr
                key={artifact.id}
                className="border-b border-slate-800/50 last:border-0"
              >
                <td className="py-3 font-semibold text-slate-100">
                  v{artifact.version}
                </td>
                <td className="py-3">
                  <code className="text-[12px] text-teal-300">
                    {artifact.sha256Prefix}
                  </code>
                </td>
                <td className="py-3 text-slate-400">
                  {(artifact.sizeBytes / 1024 / 1024).toFixed(1)} MB
                </td>
                <td className="py-3 text-slate-400">
                  {new Date(artifact.createdAt).toLocaleDateString('id-ID')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void createArtifact(event.currentTarget);
          }}
          className="rounded-xl border border-slate-800/70 p-4"
        >
          <h2 className="mb-3 text-[14px] font-bold text-white">
            Daftarkan artefak firmware
          </h2>
          <div className="grid gap-2.5">
            <label className="text-[12px] text-slate-400">
              Versi
              <input
                name="version"
                required
                placeholder="2.0.0"
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-[13px] text-slate-100"
              />
            </label>
            <label className="text-[12px] text-slate-400">
              URL artefak (HTTPS)
              <input
                name="artifactUrl"
                required
                type="url"
                placeholder="https://cdn.example.com/fw.bin"
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-[13px] text-slate-100"
              />
            </label>
            <label className="text-[12px] text-slate-400">
              SHA-256 (64 hex huruf kecil)
              <input
                name="sha256"
                required
                pattern="[0-9a-f]{64}"
                placeholder="a3f1…"
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-[12px] text-slate-100"
              />
            </label>
            <label className="text-[12px] text-slate-400">
              Ukuran (byte)
              <input
                name="sizeBytes"
                required
                type="number"
                min={1}
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-[13px] text-slate-100"
              />
            </label>
            <label className="text-[12px] text-slate-400">
              Model kompatibel (pisahkan dengan koma)
              <input
                name="compatibleModels"
                required
                placeholder="ESP32-V1, ESP32-C3"
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-[13px] text-slate-100"
              />
            </label>
            <button
              type="submit"
              disabled={busy === 'artifact'}
              className="mt-1 rounded-lg bg-teal-600 px-4 py-2 text-[13px] font-bold text-white disabled:opacity-50"
            >
              {busy === 'artifact' ? 'Mendaftarkan…' : 'Daftarkan artefak'}
            </button>
          </div>
        </form>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            void createRollout(event.currentTarget);
          }}
          className="rounded-xl border border-slate-800/70 p-4"
        >
          <h2 className="mb-3 text-[14px] font-bold text-white">Buat rollout</h2>
          <div className="grid gap-2.5">
            <label className="text-[12px] text-slate-400">
              Artefak
              <select
                name="firmwareId"
                required
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-[13px] text-slate-100"
              >
                <option value="">Pilih artefak…</option>
                {data.items.map((artifact) => (
                  <option key={artifact.id} value={artifact.id}>
                    v{artifact.version} — {artifact.sha256Prefix}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-[12px] text-slate-400">
              ID perangkat target (pisahkan dengan koma, maks 500)
              <textarea
                name="targetDeviceIds"
                required
                rows={4}
                placeholder="11111111-1111-4111-8111-111111111111"
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-[12px] text-slate-100"
              />
            </label>
            <button
              type="submit"
              disabled={busy === 'rollout' || data.items.length === 0}
              className="mt-1 rounded-lg bg-teal-600 px-4 py-2 text-[13px] font-bold text-white disabled:opacity-50"
            >
              {busy === 'rollout' ? 'Membuat…' : 'Buat rollout DRAFT'}
            </button>
          </div>
        </form>
      </div>

      {data.rollouts.length > 0 ? (
        <>
          <h2 className="mb-3 mt-6 text-[15px] font-bold text-white">
            Riwayat State Rollout OTA
          </h2>
          <div className="space-y-2">
            {data.rollouts.map((rollout) => (
              <div
                key={rollout.id}
                className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-800/70 px-5 py-3"
              >
                <span
                  className={`rounded-full px-3 py-1 text-[11px] font-bold ${
                    rollout.status === 'ROLLED_BACK'
                      ? 'bg-rose-500/10 text-rose-300'
                      : TERMINAL_STATUSES.has(rollout.status)
                        ? 'bg-teal-500/10 text-teal-300'
                        : 'bg-slate-700/40 text-slate-300'
                  }`}
                >
                  {rollout.status}
                </span>
                <code className="text-[11.5px] text-slate-500">
                  fw:{rollout.firmwareId.slice(0, 8)}…
                </code>
                <span className="text-[12.5px] text-slate-400">
                   {rollout.completedCount}/{rollout.targetCount}
                  {rollout.failedCount > 0
                    ? ` ·  ${rollout.failedCount}`
                    : ''}
                </span>

                <span className="ml-auto flex flex-wrap items-center gap-2">
                  {OPERATOR_TRANSITIONS[rollout.status]?.map((next) => (
                    <button
                      key={next}
                      type="button"
                      disabled={busy !== null}
                      onClick={() => void transition(rollout, next)}
                      className="rounded-lg border border-slate-700 px-2.5 py-1 text-[11.5px] font-semibold text-slate-200 disabled:opacity-50"
                    >
                      {busy === `t-${rollout.id}-${next}` ? '…' : `→ ${next}`}
                    </button>
                  ))}
                  {rollout.status === 'IN_PROGRESS' ? (
                    <>
                      <button
                        type="button"
                        disabled={busy !== null}
                        onClick={() => reportProgress(rollout, 'succeeded')}
                        className="rounded-lg border border-teal-600/40 px-2.5 py-1 text-[11.5px] font-semibold text-teal-300 disabled:opacity-50"
                      >
                        Lapor berhasil
                      </button>
                      <button
                        type="button"
                        disabled={busy !== null}
                        onClick={() => reportProgress(rollout, 'failed')}
                        className="rounded-lg border border-rose-600/40 px-2.5 py-1 text-[11.5px] font-semibold text-rose-300 disabled:opacity-50"
                      >
                        Lapor gagal
                      </button>
                    </>
                  ) : null}
                </span>

                <span className="w-full text-[11.5px] text-slate-500">
                  {new Date(rollout.updatedAt).toLocaleString('id-ID')}
                </span>
              </div>
            ))}
          </div>
        </>
      ) : null}

      <div className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/[.06] px-4 py-3 text-[12px] leading-relaxed text-amber-200/80">
        Digest SHA-256 dan ukuran di atas adalah metadata artefak yang tersimpan.
        Surface ini tidak membuktikan byte artefak telah diunduh lalu diverifikasi,
        dan status rollout yang tersimpan bukan bukti keberhasilan update fisik pada hardware.
        Hardware OTA acceptance tetap pending sampai verifikasi digest byte nyata dan uji perangkat lulus.
      </div>
    </div>
  );
}

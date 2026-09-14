'use client';

/**
 * Super Admin Firmware & OTA (blueprint §1) — live artifacts + rollouts
 * via /api/super/firmware (Modul 15). Fail-closed.
 */

import { useEffect, useState } from 'react';

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

export default function SuperFirmwareContent() {
  const [data, setData] = useState<{
    items: ArtifactRow[];
    rollouts: RolloutRow[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/super/firmware')
      .then(async (res) => {
        if (!res.ok) throw new Error(`backend ${res.status}`);
        return res.json();
      })
      .then(
        (payload: { items?: ArtifactRow[]; rollouts?: RolloutRow[] }) => {
          if (cancelled) return;
          setData({
            items: payload.items ?? [],
            rollouts: payload.rollouts ?? [],
          });
        },
      )
      .catch((cause: unknown) => {
        if (!cancelled)
          setError(cause instanceof Error ? cause.message : 'gagal memuat');
      });
    return () => {
      cancelled = true;
    };
  }, []);

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
    (r) => r.status !== 'COMPLETE' && r.status !== 'ABORTED',
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
                <span className="rounded-full bg-teal-500/10 px-3 py-1 text-[11px] font-bold text-teal-300">
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
                <span className="ml-auto text-[11.5px] text-slate-500">
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

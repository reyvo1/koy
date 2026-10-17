'use client';

/**
 * Notifikasi — log pengiriman nyata.
 *
 * Halaman ini sebelumnya hanya `redirect('/tenant/temuan')`: modul notifikasi di backend
 * (queue, worker, transport) sudah lengkap dan tahan retry, tapi tidak punya satu pun
 * endpoint HTTP, sehingga tidak ada yang bisa ditampilkan. Operator yang ingin tahu
 * "email ini terkirim atau tidak" justru diarahkan ke temuan analitik — domain yang
 * berbeda sama sekali.
 *
 * Sekarang backend punya `GET /notifications` dan `/notifications/summary`, dan halaman
 * ini menampilkan log itu apa adanya: termasuk status gagal dan kode errornya, karena
 * angka "terkirim" tanpa penjelasan kegagalan tidak bisa ditindaklanjuti.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { TenantShell } from '@/components/tenant-shell';
import { createLoadGuard } from '@/lib/safe-fetch';
import { EmptyState, FadeIn, SkeletonCard } from '@/components/ui-polish';
import { Bell, RefreshCw, AlertTriangle, CircleCheck, Clock } from 'lucide-react';

interface NotificationRow {
  id: string;
  channel?: string;
  subject?: string | null;
  status: string;
  attemptCount?: number;
  lastErrorCode?: string | null;
  sentAt?: string | null;
  createdAt: string;
  templateKey?: string | null;
  nextRetryAt?: string | null;
}

interface NotificationDetail extends NotificationRow {
  tenantId: string;
  destination: string;
  deliveryLeaseAt?: string | null;
}

const STATUS_META: Record<
  string,
  { label: string; tone: 'online' | 'warn' | 'offline' | 'neutral' }
> = {
  SENT: { label: 'Terkirim', tone: 'online' },
  DELIVERING: { label: 'Sedang dikirim', tone: 'neutral' },
  PENDING: { label: 'Menunggu / retry', tone: 'warn' },
  FAILED: { label: 'Gagal', tone: 'offline' },
  EXHAUSTED: { label: 'Gagal permanen', tone: 'offline' },
};

function tone(status: string) {
  return STATUS_META[status]?.tone ?? 'neutral';
}

function label(status: string) {
  return STATUS_META[status]?.label ?? status;
}

function when(iso?: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('id-ID');
}

export default function NotificationsPage() {
  const [rows, setRows] = useState<NotificationRow[] | null>(null);
  const [summary, setSummary] = useState<Record<string, number> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [detail, setDetail] = useState<NotificationDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState<string | null>(null);

  const loadGuard = useRef(createLoadGuard());
  const load = useCallback(async () => {
    const isCurrent = loadGuard.current.begin();
    setError(null);
    try {
      const query = statusFilter ? `?status=${encodeURIComponent(statusFilter)}` : '';
      const [listRes, summaryRes] = await Promise.all([
        fetch(`/api/tenant/notifications${query}`, { cache: 'no-store' }),
        fetch('/api/tenant/notifications/summary', { cache: 'no-store' }),
      ]);
      if (!listRes.ok) throw new Error(`backend ${listRes.status}`);
      const payload = (await listRes.json().catch(() => { throw new Error('Backend mengembalikan respons yang tidak dapat dibaca.'); })) as {
        items?: NotificationRow[];
      } | NotificationRow[];
      const summary = summaryRes.ok
        ? ((await summaryRes.json().catch(() => { throw new Error('Backend mengembalikan respons yang tidak dapat dibaca.'); })) as Record<string, number>)
        : null;
      if (!isCurrent()) return;
      setRows(Array.isArray(payload) ? payload : (payload.items ?? []));
      setSummary(summary);
    } catch (cause) {
      if (!isCurrent()) return;
      setRows(null);
      setError(cause instanceof Error ? cause.message : 'gagal memuat notifikasi');
    }
  }, [statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadDetail = useCallback(async (notificationId: string) => {
    setDetailLoading(notificationId);
    setError(null);
    try {
      const response = await fetch(
        `/api/tenant/notifications/${encodeURIComponent(notificationId)}`,
        { cache: 'no-store' },
      );
      if (!response.ok) throw new Error(`detail backend ${response.status}`);
      setDetail((await response.json().catch(() => { throw new Error('Backend mengembalikan respons yang tidak dapat dibaca.'); })) as NotificationDetail);
    } catch (cause) {
      setDetail(null);
      setError(cause instanceof Error ? cause.message : 'gagal memuat detail notifikasi');
    } finally {
      setDetailLoading(null);
    }
  }, []);

  const failed = (summary?.FAILED ?? 0) + (summary?.EXHAUSTED ?? 0);
  const sent = summary?.SENT ?? null;

  return (
    <TenantShell
      title="Notifikasi"
      subtitle="Log pengiriman — email verifikasi, reset password, dan webhook"
      active="/tenant/notifikasi"
    >
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
          aria-label="Filter status notifikasi"
          className="rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2 text-[13px] text-slate-100 outline-none focus:border-teal-400"
        >
          <option value="">Semua status</option>
          {Object.entries(STATUS_META).map(([value, meta]) => (
            <option key={value} value={value}>
              {meta.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => void load()}
          className="flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-2 text-[12.5px] font-semibold text-slate-300 transition-colors hover:border-teal-500/50 hover:text-teal-300"
        >
          <RefreshCw className="h-3.5 w-3.5" strokeWidth={2.1} />
          Muat ulang
        </button>
      </div>

      {summary ? (
        <FadeIn>
          <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
            <div className="rounded-2xl border border-slate-800/80 bg-[#111c2e] p-4">
              <div className="flex items-center gap-2 text-[11.5px] font-semibold uppercase tracking-wide text-slate-400">
                <CircleCheck className="h-3.5 w-3.5 text-emerald-400" strokeWidth={2.2} />
                Terkirim
              </div>
              <div className="mt-1.5 text-[24px] font-extrabold tabular-nums text-white">
                {sent ?? 0}
              </div>
            </div>
            <div className="rounded-2xl border border-slate-800/80 bg-[#111c2e] p-4">
              <div className="flex items-center gap-2 text-[11.5px] font-semibold uppercase tracking-wide text-slate-400">
                <AlertTriangle className="h-3.5 w-3.5 text-red-400" strokeWidth={2.2} />
                Gagal
              </div>
              <div className="mt-1.5 text-[24px] font-extrabold tabular-nums text-white">
                {failed ?? 0}
              </div>
            </div>
            <div className="rounded-2xl border border-slate-800/80 bg-[#111c2e] p-4">
              <div className="flex items-center gap-2 text-[11.5px] font-semibold uppercase tracking-wide text-slate-400">
                <Clock className="h-3.5 w-3.5 text-amber-400" strokeWidth={2.2} />
                Menunggu
              </div>
              <div className="mt-1.5 text-[24px] font-extrabold tabular-nums text-white">
                {summary.PENDING ?? 0}
              </div>
            </div>
            <div className="rounded-2xl border border-slate-800/80 bg-[#111c2e] p-4">
              <div className="flex items-center gap-2 text-[11.5px] font-semibold uppercase tracking-wide text-slate-400">
                <Bell className="h-3.5 w-3.5 text-teal-300" strokeWidth={2.2} />
                Total
              </div>
              <div className="mt-1.5 text-[24px] font-extrabold tabular-nums text-white">
                {Object.values(summary).reduce((sum, n) => sum + n, 0)}
              </div>
            </div>
          </div>
        </FadeIn>
      ) : null}

      {error ? (
        <div
          role="alert"
          className="mb-4 flex items-start gap-2.5 rounded-xl border border-red-500/25 bg-red-500/[.06] px-4 py-3"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
          <span className="text-[13px] text-red-200">
            Notifikasi tidak dapat dimuat ({error}). Ini bukan berarti tidak ada
            notifikasi.
          </span>
        </div>
      ) : null}

      {rows === null ? (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Bell}
          title="Belum ada notifikasi terkirim"
          description="Log ini terisi otomatis saat sistem mengirim email verifikasi, reset password, atau webhook. Tidak ada tombol kirim manual — notifikasi dibuat oleh alur sistem, bukan oleh operator."
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-slate-800">
                <th className="px-3 py-2.5 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  Status
                </th>
                <th className="px-3 py-2.5 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  Kanal
                </th>
                <th className="px-3 py-2.5 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  Subjek
                </th>
                <th className="px-3 py-2.5 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  Percobaan
                </th>
                <th className="px-3 py-2.5 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  Error
                </th>
                <th className="px-3 py-2.5 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  Waktu
                </th>
                <th className="px-3 py-2.5 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  Detail
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.id}
                  className="border-b border-slate-800/60 text-[12.5px] text-slate-300"
                >
                  <td className="px-3 py-2.5">
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset ${
                        tone(row.status) === 'online'
                          ? 'bg-emerald-500/10 text-emerald-400 ring-emerald-500/25'
                          : tone(row.status) === 'offline'
                            ? 'bg-red-500/10 text-red-400 ring-red-500/25'
                            : tone(row.status) === 'warn'
                              ? 'bg-amber-500/10 text-amber-400 ring-amber-500/25'
                              : 'bg-sky-500/10 text-sky-400 ring-sky-500/25'
                      }`}
                    >
                      {label(row.status)}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">{row.channel ?? '—'}</td>
                  <td className="px-3 py-2.5">
                    {row.subject ?? row.templateKey ?? '—'}
                  </td>
                  <td className="px-3 py-2.5 tabular-nums">
                    {row.attemptCount ?? 0}
                  </td>
                  <td className="px-3 py-2.5 font-mono text-[11.5px] text-red-300/80">
                    {row.lastErrorCode ?? '—'}
                  </td>
                  <td className="px-3 py-2.5 text-slate-400">
                    {row.sentAt ? `Dikirim ${when(row.sentAt)}` : when(row.createdAt)}
                  </td>
                  <td className="px-3 py-2.5">
                    <button
                      type="button"
                      onClick={() => void loadDetail(row.id)}
                      disabled={detailLoading === row.id}
                      className="rounded-lg border border-slate-700 px-2.5 py-1.5 text-[11.5px] font-semibold text-slate-300 hover:border-teal-500/50 hover:text-teal-300 disabled:opacity-50"
                    >
                      {detailLoading === row.id ? 'Memuat…' : 'Lihat'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {detail ? (
        <section className="mt-5 rounded-2xl border border-slate-800/80 bg-[#111c2e] p-5" aria-label="Detail notifikasi">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Detail pengiriman</div>
              <h2 className="mb-0 mt-1 text-[16px] font-bold text-slate-100">
                {detail.subject ?? detail.templateKey ?? detail.id}
              </h2>
            </div>
            <button type="button" onClick={() => setDetail(null)} className="text-[12px] font-semibold text-slate-400 hover:text-slate-200">Tutup</button>
          </div>
          <dl className="mt-4 grid gap-3 text-[12.5px] sm:grid-cols-2 lg:grid-cols-3">
            <div><dt className="text-slate-500">Status</dt><dd className="mt-0.5 text-slate-200">{label(detail.status)}</dd></div>
            <div><dt className="text-slate-500">Kanal</dt><dd className="mt-0.5 text-slate-200">{detail.channel ?? '—'}</dd></div>
            <div><dt className="text-slate-500">Tujuan</dt><dd className="mt-0.5 break-all text-slate-200">{detail.destination}</dd></div>
            <div><dt className="text-slate-500">Percobaan</dt><dd className="mt-0.5 text-slate-200">{detail.attemptCount ?? 0}</dd></div>
            <div><dt className="text-slate-500">Retry berikutnya</dt><dd className="mt-0.5 text-slate-200">{when(detail.nextRetryAt)}</dd></div>
            <div><dt className="text-slate-500">Error terakhir</dt><dd className="mt-0.5 font-mono text-[11.5px] text-red-300/80">{detail.lastErrorCode ?? '—'}</dd></div>
            <div><dt className="text-slate-500">Dibuat</dt><dd className="mt-0.5 text-slate-200">{when(detail.createdAt)}</dd></div>
            <div><dt className="text-slate-500">Terkirim</dt><dd className="mt-0.5 text-slate-200">{when(detail.sentAt)}</dd></div>
            <div><dt className="text-slate-500">Template</dt><dd className="mt-0.5 text-slate-200">{detail.templateKey ?? '—'}</dd></div>
          </dl>
          <p className="mb-0 mt-4 rounded-xl border border-amber-500/20 bg-amber-500/[.06] px-3 py-2.5 text-[11.5px] leading-relaxed text-amber-200/90">
            Isi pesan tidak ditampilkan di permukaan operator karena notifikasi autentikasi dapat memuat token verifikasi atau reset password.
          </p>
        </section>
      ) : null}

      <p className="mt-4 text-[11.5px] leading-relaxed text-slate-500">
        Pengiriman ulang dilakukan otomatis oleh worker dengan backoff. Notifikasi gagal
        sementara (timeout, 429, 5xx) dijadwalkan ulang; kegagalan permanen ditandai EXHAUSTED
        dan tidak diulang.
      </p>
    </TenantShell>
  );
}

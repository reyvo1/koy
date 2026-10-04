'use client';

/**
 * Webhook — receiver untuk integrasi keluar.
 *
 * Backend punya runtime webhook (pendaftaran endpoint, penandatangan HMAC, riwayat
 * pengiriman), tapi tidak ada BFF route dan tidak ada layar: sebuah fitur yang tidak bisa
 * dikelola. Halaman ini menutup loopnya, dan sengaja menampilkan **kegagalan** secara
 * terbuka — endpoint yang diam dan endpoint yang rusak tampak sama persis dari luar, dan
 * daftar yang hanya menampilkan jumlah saja mengaburkan itu.
 *
 * `signingSecret` hanya dikembalikan sekali, saat pendaftaran. Kotak satu-tampil di bawah
 * adalah kesempatan operatorhanya satu-satunya untuk menyimpannya; setelah ditutup, halaman ini tidak
 * berbohong dengan menawarkan jalan untuk membacanya lagi.
 */

import { useCallback, useEffect, useState } from 'react';
import { TenantShell } from '@/components/tenant-shell';
import { EmptyState, FadeIn, SkeletonCard } from '@/components/ui-polish';
import {
  Webhook,
  Plus,
  Trash2,
  Loader2,
  Copy,
  Check,
  AlertTriangle,
  Power,
  PowerOff,
  RotateCcw,
} from 'lucide-react';

interface EndpointRow {
  id: string;
  url: string;
  events: string[];
  enabled: boolean;
  createdAt: string;
}

interface DeliveryRow {
  id: string;
  endpointId: string;
  event: string;
  ok: boolean;
  statusCode: number | null;
  attempts: number;
  /**
   * Why the attempt failed, when the request never got an answer.
   *
   * Declared before it was ever populated: `ok: false` with a null status code is what a
   * refused connection and an unresolvable host both look like, and the page claims to tell
   * failures apart. Without this the claim was decoration.
   */
  reason?: string | null;
  createdAt: string;
}

/**
 * The event options, in the backend's vocabulary.
 *
 * This list drifted once: it offered `command.issued`, `alert.resolved` and four others that
 * the backend refuses, so ticking "Perintah diterbitkan" produced a 400 from a checkbox the
 * product rendered. `test/webhook-surface.contract.spec.ts` compares it against
 * `SUBSCRIBABLE_EVENTS` in `src/webhook/webhook.controller.ts`, so the next addition to the
 * backend without a matching option here fails the gate rather than the operator's request.
 *
 * Two events is a short list, and it is honest: every one of them is emitted somewhere in
 * `src/`. The longer list this replaced was longer only because it contained promises.
 */
const EVENT_OPTIONS = [
  { value: '*', label: 'Semua event (*)' },
  { value: 'device.registered', label: 'Perangkat terdaftar' },
  { value: 'device.state_changed', label: 'Status perangkat berubah' },
] as const;

export default function TenantWebhooksPage() {
  const [rows, setRows] = useState<EndpointRow[] | null>(null);
  const [deliveries, setDeliveries] = useState<DeliveryRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [url, setUrl] = useState('');
  const [events, setEvents] = useState<string[]>(['device.state_changed']);
  const [formError, setFormError] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [secretTitle, setSecretTitle] = useState('Endpoint dibuat — simpan signing secret sekarang');
  const [copied, setCopied] = useState(false);
  const [confirmRotateId, setConfirmRotateId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const [endpoints, history] = await Promise.all([
      fetch('/api/admin/webhooks/endpoints', { cache: 'no-store' }),
      fetch('/api/admin/webhooks/deliveries', { cache: 'no-store' }),
    ]);
    if (!endpoints.ok && endpoints.status !== 403) {
      setError(`backend ${endpoints.status}`);
      setRows(null);
      return;
    }
    if (endpoints.status === 403) {
      // A refusal about *this resource*, not an expired session. The BFF relays the 403
      // rather than flattening it into a 401 that would sign the operator out.
      setError('Anda bukan admin tenant, jadi endpoint webhook tidak dapat dibaca.');
      setRows(null);
      return;
    }
    const endpointBody = (await endpoints.json()) as {
      items?: EndpointRow[];
    } | EndpointRow[];
    setRows(Array.isArray(endpointBody) ? endpointBody : (endpointBody.items ?? []));

    if (history.ok) {
      const deliveryBody = (await history.json()) as {
        items?: DeliveryRow[];
      } | DeliveryRow[];
      setDeliveries(
        Array.isArray(deliveryBody) ? deliveryBody : (deliveryBody.items ?? []),
      );
    } else {
      setDeliveries(null);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const create = async () => {
    setFormError(null);
    if (!url.trim()) {
      setFormError('URL receiver wajib diisi.');
      return;
    }
    if (events.length === 0) {
      setFormError('Pilih minimal satu event.');
      return;
    }
    setBusy('create');
    try {
      const res = await fetch('/api/admin/webhooks/endpoints', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: url.trim(), events }),
      });
      const payload = (await res.json().catch(() => null)) as {
        signingSecret?: string;
        message?: string;
        error?: { message?: string };
      } | null;
      if (!res.ok) {
        throw new Error(
          payload?.message ?? payload?.error?.message ?? `backend ${res.status}`,
        );
      }
      if (!payload?.signingSecret) {
        // Do not report success when the one thing the operator needed is missing.
        setFormError(
          'Endpoint dibuat, tetapi signing secret tidak dikembalikan. Cabut dan daftar ulang.',
        );
      }
      setSecretTitle('Endpoint dibuat — simpan signing secret sekarang');
      setSecret(payload?.signingSecret ?? null);
      setUrl('');
      setEvents(['device.state_changed']);
      setShowCreate(false);
      await load();
    } catch (cause) {
      setFormError(
        cause instanceof Error ? cause.message : 'Gagal mendaftarkan endpoint',
      );
    } finally {
      setBusy(null);
    }
  };

  const toggle = async (row: EndpointRow) => {
    setBusy(`toggle-${row.id}`);
    setError(null);
    try {
      const res = await fetch(`/api/admin/webhooks/endpoints/${row.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ enabled: !row.enabled }),
      });
      if (!res.ok) throw new Error(`backend ${res.status}`);
      await load();
    } catch (cause) {
      setError(
        `Gagal mengubah status ${row.url}: ${
          cause instanceof Error ? cause.message : 'tidak diketahui'
        }`,
      );
    } finally {
      setBusy(null);
    }
  };

  const rotateSecret = async (row: EndpointRow) => {
    setBusy(`rotate-${row.id}`);
    setError(null);
    try {
      const res = await fetch(`/api/admin/webhooks/endpoints/${row.id}/rotate-secret`, {
        method: 'POST',
      });
      const payload = (await res.json().catch(() => null)) as {
        signingSecret?: string;
        message?: string;
        error?: { message?: string };
      } | null;
      if (!res.ok) {
        throw new Error(
          payload?.message ?? payload?.error?.message ?? `backend ${res.status}`,
        );
      }
      if (!payload?.signingSecret) {
        throw new Error('Backend tidak mengembalikan signing secret baru.');
      }
      setSecretTitle('Secret dirotasi — simpan secret baru sekarang');
      setSecret(payload.signingSecret);
      setCopied(false);
      setConfirmRotateId(null);
    } catch (cause) {
      setError(
        `Gagal merotasi secret ${row.url}: ${
          cause instanceof Error ? cause.message : 'tidak diketahui'
        }`,
      );
    } finally {
      setBusy(null);
    }
  };

  const remove = async (row: EndpointRow) => {
    setBusy(`remove-${row.id}`);
    setError(null);
    try {
      const res = await fetch(`/api/admin/webhooks/endpoints/${row.id}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error(`backend ${res.status}`);
      await load();
    } catch (cause) {
      setError(
        `Gagal menghapus ${row.url}: ${
          cause instanceof Error ? cause.message : 'tidak diketahui'
        }`,
      );
    } finally {
      setBusy(null);
    }
  };

  /**
   * `*` is exclusive, and the backend enforces that: `['*', 'alert.raised']` is refused with
   * `Event "*" tidak boleh dikombinasikan dengan event lain`.
   *
   * A plain toggle let an operator reach that refusal by ticking the wildcard while a default
   * event was already selected — the form offered a combination the server would never accept,
   * and the only signal was a 400 after a round trip. Ticking the wildcard now clears the
   * rest, and ticking any specific event drops the wildcard.
   */
  const toggleEvent = (value: string) => {
    setEvents((current) => {
      if (value === '*') {
        return current.includes('*') ? [] : ['*'];
      }
      const withoutWildcard = current.filter((e) => e !== '*');
      return withoutWildcard.includes(value)
        ? withoutWildcard.filter((e) => e !== value)
        : [...withoutWildcard, value];
    });
  };

  const failedCount = deliveries?.filter((d) => !d.ok).length ?? 0;

  return (
    <TenantShell
      title="Webhook"
      subtitle="Kirim event platform ke sistem Anda, ditandatangani HMAC"
      active="/tenant/webhooks"
    >
      {secret ? (
        <div className="mb-5 rounded-2xl border border-emerald-500/30 bg-emerald-500/[.07] p-5">
          <div className="flex items-center gap-2 text-[14px] font-bold text-emerald-300">
            <Check className="h-4 w-4" strokeWidth={2.4} />
            {secretTitle}
          </div>
          <p className="mb-3 mt-1.5 text-[12.5px] text-emerald-200/80">
            Ditampilkan satu kali saja. Setelah rotasi, secret lama langsung tidak berlaku.
            Receiver Anda harus memverifikasi tanda tangan HMAC-SHA256 pada body dengan header{' '}
            <code>X-IOT-Signature</code>.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 break-all rounded-lg border border-emerald-500/25 bg-black/30 px-3 py-2 font-mono text-[12px] text-emerald-200">
              {secret}
            </code>
            <button
              type="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(secret);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                } catch {
                  // Clipboard may be denied; the value stays selectable.
                }
              }}
              className="flex shrink-0 items-center gap-1.5 rounded-lg border border-emerald-500/30 px-3 py-2 text-[12.5px] font-semibold text-emerald-200 hover:bg-emerald-500/10"
            >
              {copied ? (
                <Check className="h-3.5 w-3.5" strokeWidth={2.4} />
              ) : (
                <Copy className="h-3.5 w-3.5" strokeWidth={2.1} />
              )}
              {copied ? 'Tersalin' : 'Salin'}
            </button>
            <button
              type="button"
              onClick={() => setSecret(null)}
              className="shrink-0 rounded-lg border border-slate-700 px-3 py-2 text-[12.5px] font-semibold text-slate-300 hover:border-slate-500"
            >
              Tutup
            </button>
          </div>
        </div>
      ) : null}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => {
            setShowCreate((v) => !v);
            setFormError(null);
          }}
          className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-teal-400 to-emerald-500 px-4 py-2 text-[13px] font-bold text-slate-950 transition-all hover:-translate-y-0.5 hover:brightness-110"
        >
          <Plus className="h-4 w-4" strokeWidth={2.5} />
          Daftarkan Endpoint
        </button>
        {failedCount > 0 ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-red-500/10 px-3 py-1.5 text-[12px] font-semibold text-red-300 ring-1 ring-inset ring-red-500/25">
            <AlertTriangle className="h-3.5 w-3.5" strokeWidth={2.2} />
            {failedCount} pengiriman gagal
          </span>
        ) : null}
      </div>

      {showCreate ? (
        <div className="iot2-panel mb-5">
          <label className="mb-1.5 block text-[12.5px] font-semibold text-slate-400">
            URL receiver
          </label>
          <input
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            maxLength={2048}
            placeholder="https://receiver.anda.example.com/hook"
            className="w-full rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2 text-[13.5px] text-slate-100 outline-none focus:border-teal-400"
          />
          <p className="mb-0 mt-1.5 text-[11.5px] text-slate-500">
            Wajib https, kecuali receiver berjalan di loopback mesin ini.
          </p>

          <fieldset className="mt-4">
            <legend className="mb-2 text-[12.5px] font-semibold text-slate-400">
              Event yang dikirim
            </legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {EVENT_OPTIONS.map((event) => (
                <label
                  key={event.value}
                  className="flex items-center gap-2.5 rounded-lg border border-slate-700/70 px-3 py-2 text-[12.5px] text-slate-300"
                >
                  <input
                    type="checkbox"
                    checked={events.includes(event.value)}
                    onChange={() => toggleEvent(event.value)}
                    className="h-4 w-4 accent-teal-400"
                  />
                  {event.label}
                </label>
              ))}
            </div>
          </fieldset>

          {formError ? (
            <p role="alert" className="mb-0 mt-2 text-[12px] text-red-300">
              {formError}
            </p>
          ) : null}

          <div className="mt-4 flex items-center gap-2">
            <button
              type="button"
              onClick={() => void create()}
              disabled={busy === 'create'}
              className="rounded-lg bg-teal-400 px-4 py-2 text-[13px] font-bold text-slate-950 transition-colors hover:bg-teal-300 disabled:opacity-50"
            >
              {busy === 'create' ? 'Mendaftarkan…' : 'Daftarkan'}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowCreate(false);
                setFormError(null);
              }}
              className="text-[12.5px] font-medium text-slate-400 hover:text-slate-200"
            >
              Batal
            </button>
          </div>
        </div>
      ) : null}

      {error ? (
        <div
          role="alert"
          className="mb-4 flex items-start gap-2.5 rounded-xl border border-red-500/25 bg-red-500/[.06] px-4 py-3"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
          <span className="text-[13px] text-red-200">{error}</span>
        </div>
      ) : null}

      {rows === null ? (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Webhook}
          title="Belum ada endpoint webhook"
          description="Daftarkan receiver untuk menerima event platform. Setiap payload ditandatangani HMAC-SHA256 dan diverifikasi dengan signing secret yang hanya ditampilkan sekali."
        />
      ) : (
        <FadeIn>
          <div className="space-y-2.5">
            {rows.map((row) => (
              <div
                key={row.id}
                className="iot2-panel flex flex-wrap items-center gap-4"
                style={{ padding: '16px 20px' }}
              >
                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-teal-500/15">
                  <Webhook className="h-5 w-5 text-teal-300" strokeWidth={1.9} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[15px] font-bold text-slate-100">
                    {row.url}
                  </div>
                  <div className="mt-0.5 text-[12px] text-slate-500">
                    {row.events.includes('*')
                      ? 'semua event'
                      : row.events.join(', ')}
                  </div>
                  <div className="mt-0.5 text-[11.5px] text-slate-500">
                    Dibuat {new Date(row.createdAt).toLocaleString('id-ID')}
                  </div>
                </div>
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset ${
                    row.enabled
                      ? 'bg-emerald-500/10 text-emerald-400 ring-emerald-500/25'
                      : 'bg-slate-500/10 text-slate-400 ring-slate-400/20'
                  }`}
                >
                  {row.enabled ? 'AKTIF' : 'NONAKTIF'}
                </span>
                <button
                  type="button"
                  onClick={() => void toggle(row)}
                  disabled={busy !== null}
                  aria-label={row.enabled ? `Nonaktifkan ${row.url}` : `Aktifkan ${row.url}`}
                  title={row.enabled ? 'Nonaktifkan' : 'Aktifkan'}
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-slate-700 text-slate-300 transition-colors hover:border-slate-500 disabled:opacity-50"
                >
                  {busy === `toggle-${row.id}` ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : row.enabled ? (
                    <Power strokeWidth={2} className="h-4 w-4" />
                  ) : (
                    <PowerOff strokeWidth={2} className="h-4 w-4" />
                  )}
                </button>
                {confirmRotateId === row.id ? (
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => void rotateSecret(row)}
                      disabled={busy !== null}
                      className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-2.5 py-2 text-[11.5px] font-bold text-amber-200 hover:bg-amber-500/15 disabled:opacity-50"
                    >
                      {busy === `rotate-${row.id}` ? 'Merotasi…' : 'Yakin rotasi'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmRotateId(null)}
                      disabled={busy !== null}
                      className="rounded-lg border border-slate-700 px-2.5 py-2 text-[11.5px] font-semibold text-slate-300 hover:border-slate-500 disabled:opacity-50"
                    >
                      Batal
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmRotateId(row.id)}
                    disabled={busy !== null}
                    aria-label={`Rotasi signing secret ${row.url}`}
                    title="Rotasi signing secret"
                    className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-amber-500/30 text-amber-300 transition-colors hover:bg-amber-500/10 disabled:opacity-50"
                  >
                    <RotateCcw className="h-4 w-4" strokeWidth={2} />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => void remove(row)}
                  disabled={busy !== null}
                  aria-label={`Hapus ${row.url}`}
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-red-500/30 text-red-400 transition-colors hover:bg-red-500/10 disabled:opacity-50"
                >
                  {busy === `remove-${row.id}` ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" strokeWidth={2} />
                  )}
                </button>
              </div>
            ))}
          </div>
        </FadeIn>
      )}

      {deliveries && deliveries.length > 0 ? (
        <div className="mt-8">
          <h2 className="mb-2 text-[15px] font-bold text-slate-200">
            Riwayat pengiriman
          </h2>
          <p className="mb-3 text-[12.5px] text-slate-500">
            Kegagalan ditampilkan terbuka. Endpoint yang mati dan endpoint yang hanya diam
            tampak sama dari luar — daftar ini adalah pembeda keduanya.
          </p>
          <FadeIn>
            <div className="iot2-panel overflow-x-auto">
              <table className="w-full text-left text-[12.5px]">
                <thead>
                  <tr className="border-b border-slate-800 text-[11.5px] uppercase tracking-wide text-slate-500">
                    <th className="px-3 py-2.5">Hasil</th>
                    <th className="px-3 py-2.5">Event</th>
                    <th className="px-3 py-2.5">Kode</th>
                    <th className="px-3 py-2.5">Alasan</th>
                    <th className="px-3 py-2.5">Waktu</th>
                  </tr>
                </thead>
                <tbody>
                  {deliveries.slice(0, 25).map((delivery) => (
                    <tr
                      key={delivery.id}
                      className="border-b border-slate-800/60 last:border-0"
                    >
                      <td className="px-3 py-2.5">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${
                            delivery.ok
                              ? 'bg-emerald-500/10 text-emerald-400 ring-emerald-500/25'
                              : 'bg-red-500/10 text-red-400 ring-red-500/25'
                          }`}
                        >
                          {delivery.ok ? 'TERKIRIM' : 'GAGAL'}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-slate-300">{delivery.event}</td>
                      <td className="px-3 py-2.5 text-slate-400">
                        {delivery.statusCode ?? '—'}
                      </td>
                      {/* A null status code is what a refused connection and an unresolvable
                          host both look like, so the reason is the only thing that tells them
                          apart. Rendered for failures only: a successful delivery has none,
                          and an empty column on every row would be noise. */}
                      <td className="max-w-[22rem] px-3 py-2.5 text-red-300/90">
                        {delivery.ok || !delivery.reason ? (
                          <span className="text-slate-600">—</span>
                        ) : (
                          <span className="break-words font-mono text-[11.5px]">
                            {delivery.reason}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-slate-500">
                        {new Date(delivery.createdAt).toLocaleString('id-ID')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </FadeIn>
        </div>
      ) : null}
    </TenantShell>
  );
}

'use client';

/**
 * CCTV page (UI v3, polish pass) — camera onboarding.
 * Admin registers a camera -> gets a one-time pairing URI rendered as QR.
 * Streaming itself stays fail-closed per the module-10 compatibility contract.
 */

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { AdminShellV3 } from '@/components/admin-shell-v3';
import { QuarantineBanner } from '@/components/quarantine-banner';
import {
  EmptyState,
  FadeIn,
  SkeletonCard,
  StatusPill,
  useToast,
  shadow,
} from '@/components/ui-polish';

import {
  Plus,
  Camera,
  QrCode,
  ShieldAlert,
  MonitorOff,
  Wifi,
  ScanLine,
  CheckCircle2,
  RefreshCw,
} from 'lucide-react';

const PAIRING_STEPS = [
  { icon: Wifi, text: 'Nyalakan kamera dan masuk mode pairing (lampu kedip/bunyi).' },
  { icon: Camera, text: 'Pastikan HP terhubung ke WiFi yang dituju kamera.' },
  { icon: ScanLine, text: 'Scan kode QR di bawah lewat aplikasi scanner atau kamera.' },
  { icon: CheckCircle2, text: 'Kamera otomatis terdaftar — status berubah TERPASANG.' },
];

interface CameraRow {
  id: string;
  name: string;
  status: string;
  vendor?: string | null;
  model?: string | null;
  lastHeartbeatAt?: string | null;
  createdAt?: string | null;
}

/** Device status -> the tone the shared pill renders. Paired and active are the only
 *  states that mean "this camera is reachable"; everything else is a setup step the
 *  operator still owns, so it must not be drawn as a healthy camera. */
function statusTone(status: string): 'online' | 'warn' | 'offline' {
  const s = status.toUpperCase();
  if (s === 'ACTIVE' || s === 'ONLINE') return 'online';
  if (s === 'PAIRED' || s === 'PROVISIONING' || s === 'INACTIVE') return 'warn';
  return 'offline';
}

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: 'Online',
  PAIRED: 'Terpasang',
  PROVISIONING: 'Menunggu pairing',
  INACTIVE: 'Tidak aktif',
  REVOKED: 'Dicabut',
};

function heartbeatLabel(iso?: string | null): string {
  if (!iso) return 'Belum pernah';
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return '—';
  const minutes = Math.floor(ms / 60000);
  if (minutes < 1) return 'Baru saja';
  if (minutes < 60) return `${minutes} menit lalu`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} jam lalu`;
  return `${Math.floor(hours / 24)} hari lalu`;
}

export default function CctvPage() {
  const [showForm, setShowForm] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pairingUri, setPairingUri] = useState<string | null>(null);
  const [cameras, setCameras] = useState<CameraRow[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const toast = useToast();

  /**
   * The camera directory. This fetch did not exist: the page rendered its empty state
   * unconditionally, so a camera the operator had just registered — with a QR code and a
   * success toast — was still reported as nonexistent on the same screen. The backend has
   * served `GET /cameras` all along; only the proxy and this call were missing.
   */
  const loadCameras = useCallback(async () => {
    try {
      const response = await fetch('/api/cameras', { cache: 'no-store' });
      if (!response.ok) throw new Error(`backend ${response.status}`);
      const payload = await response.json();
      setCameras(Array.isArray(payload) ? (payload as CameraRow[]) : []);
      setListError(null);
    } catch (cause) {
      // A failed read is NOT an empty directory. Rendering the empty state here would
      // tell the operator they have no cameras when in fact the list could not be
      // fetched — the exact lie this page used to tell unconditionally.
      setCameras(null);
      setListError(
        cause instanceof Error ? cause.message : 'gagal memuat daftar kamera',
      );
    }
  }, []);

  useEffect(() => {
    void loadCameras();
  }, [loadCameras]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);

    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch('/api/cameras', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: form.get('name'),
          vendor: form.get('vendor'),
          model: form.get('model') || undefined,
        }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        setError(data?.message ?? 'Pendaftaran kamera gagal.');
        toast.push('error', data?.message ?? 'Pendaftaran kamera gagal.');
        return;
      }
      const data = await response.json();
      setPairingUri(data.pairingUri ?? null);
      setShowForm(false);
      // Re-read the directory so the new camera appears immediately. Without this the
      // operator registers a camera, sees the QR, and the list below still says none.
      void loadCameras();
      toast.push('success', `Kamera "${data.name}" terdaftar. Scan QR untuk pairing.`);
    } catch {
      setError('Koneksi ke server gagal.');
      toast.push('error', 'Koneksi ke server gagal.');
    } finally {
      setPending(false);
    }
  }

  return (
    <AdminShellV3
      title="CCTV"
      subtitle="Kamera keamanan — daftarkan & pasangkan via scan QR"
      active="/cctv"
    >
      <QuarantineBanner
        works={[
          'Registrasi kamera dan penerbitan pairing URI sekali pakai yang benar-benar dari backend.',
          'Kode QR pairing yang benar-benar dapat dipindai.',
          'Daftar kamera beserta status dan metadata pairing yang tersimpan.',
        ]}
        doesNotWork={[
          'Tidak ada streaming video sama sekali — tidak ada RTSP, ONVIF, WebRTC, atau HLS di seluruh aplikasi.',
          'Daftar kamera adalah metadata, bukan penampil. Membuka kamera tidak menunjukkan apa pun.',
        ]}
      />

      {/* Setup bar */}
      <FadeIn>
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => {
              setShowForm((v) => !v);
              setError(null);
            }}
            className={`flex items-center gap-2 rounded-xl bg-gradient-to-r from-teal-400 to-emerald-500 px-5 py-2.5 text-[13.5px] font-bold text-slate-950 transition-all duration-200 ease-out hover:-translate-y-0.5 hover:brightness-110 hover:shadow-lg hover:shadow-emerald-500/30 ${shadow.card}`}
          >
            <Plus className="h-4 w-4" strokeWidth={2.5} />
            Setup Kamera Baru
          </button>
          <span className="flex items-center gap-1.5 text-[12px] text-slate-500">
            <QrCode className="h-3.5 w-3.5" strokeWidth={1.8} />
            Daftarkan kamera, lalu scan QR dari HP untuk menyambungkan ke WiFi
          </span>
        </div>
      </FadeIn>

      {error && (
        <div className="mb-4 flex items-center gap-2.5 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-[13px] font-medium text-red-200">
          <ShieldAlert className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Registration form */}
      {showForm && (
        <form
          onSubmit={submit}
          aria-busy={pending}
          className={`mb-6 space-y-4 rounded-2xl border border-slate-700/60 bg-[#111c2e] p-6 ${shadow.overlay} animate-in fade-in slide-in-from-bottom-2 duration-200 ease-out`}
        >
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="block">
              <span className="text-[12px] font-semibold text-slate-400">Nama Kamera</span>
              <input
                name="name"
                required
                maxLength={120}
                placeholder="contoh: Kamera Teras Depan"
                className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2 text-[13.5px] text-slate-100 outline-none transition-colors focus:border-teal-400 focus:ring-2 focus:ring-teal-400/20"
              />
            </label>
            <label className="block">
              <span className="text-[12px] font-semibold text-slate-400">Merek (vendor)</span>
              <input
                name="vendor"
                required
                maxLength={80}
                placeholder="contoh: Imou / Hikvision"
                className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2 text-[13.5px] text-slate-100 outline-none transition-colors focus:border-teal-400 focus:ring-2 focus:ring-teal-400/20"
              />
            </label>
            <label className="block">
              <span className="text-[12px] font-semibold text-slate-400">Model (opsional)</span>
              <input
                name="model"
                maxLength={120}
                placeholder="contoh: Ranger 2"
                className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2 text-[13.5px] text-slate-100 outline-none transition-colors focus:border-teal-400 focus:ring-2 focus:ring-teal-400/20"
              />
            </label>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={pending}
              className="flex items-center gap-2 rounded-lg bg-teal-400 px-4 py-2 text-[13px] font-bold text-slate-950 transition-all hover:-translate-y-0.5 hover:bg-teal-300 hover:shadow-md hover:shadow-teal-400/25 disabled:pointer-events-none disabled:opacity-50"
            >
              <QrCode className="h-4 w-4" strokeWidth={2.2} />
              {pending ? 'Mendaftarkan...' : 'Daftarkan & Buat QR Pairing'}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="text-[12.5px] font-medium text-slate-400 transition-colors hover:text-slate-200"
            >
              Batal
            </button>
          </div>
        </form>
      )}

      {/* Pairing result with QR */}
      {pairingUri && (
        <div className="mb-6 rounded-2xl border border-emerald-500/30 bg-gradient-to-br from-emerald-500/[.08] to-transparent p-6 animate-in fade-in slide-in-from-bottom-2 duration-200 ease-out">
          <h3 className="m-0 flex items-center gap-2 text-[16px] font-bold tracking-tight text-emerald-300">
            <CheckCircle2 className="h-5 w-5" strokeWidth={2.2} />
            Kamera terdaftar — langkah pairing
          </h3>
          <ol className="mt-4 mb-5 space-y-2.5 pl-0">
            {PAIRING_STEPS.map((step, i) => {
              const Icon = step.icon;
              return (
                <li key={i} className="flex list-none items-start gap-3">
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-emerald-500/15 text-[12px] font-black text-emerald-300">
                    {i + 1}
                  </span>
                  <Icon className="mt-1 h-4 w-4 shrink-0 text-emerald-400/70" strokeWidth={1.8} />
                  <span className="text-[13.5px] leading-relaxed text-slate-300">{step.text}</span>
                </li>
              );
            })}
          </ol>
          <QrCanvas value={pairingUri} />
          <p className="mt-3 break-all font-mono text-[11px] text-slate-500">{pairingUri}</p>
          <p className="mt-2 flex items-center gap-1.5 text-[12px] font-medium text-amber-300/90">
            <ShieldAlert className="h-3.5 w-3.5" />
            Token hanya berlaku 1 jam & sekali pakai. Jangan dibagikan.
          </p>
          <button
            type="button"
            onClick={() => setPairingUri(null)}
            className="mt-4 rounded-lg border border-slate-700 px-4 py-1.5 text-[12.5px] font-semibold text-slate-300 transition-all hover:border-slate-500 hover:-translate-y-px hover:shadow-md"
          >
            Tutup
          </button>
        </div>
      )}

      {/* Camera directory. Loading, failure and empty are three different answers and
          must not collapse into one: the page used to render the empty state in all
          three cases, which is how a successfully registered camera stayed invisible. */}
      <FadeIn delay={120}>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="m-0 text-[16px] font-bold tracking-tight text-white">
            Kamera Terdaftar
          </h3>
          <button
            type="button"
            onClick={() => void loadCameras()}
            className="flex items-center gap-1.5 text-[11.5px] font-bold text-teal-400 transition-colors hover:text-teal-300"
          >
            <RefreshCw className="h-3.5 w-3.5" strokeWidth={2.2} />
            Muat ulang
          </button>
        </div>

        {cameras === null ? (
          listError ? (
            <div
              role="alert"
              className="flex items-start gap-3 rounded-2xl border border-red-500/25 bg-red-500/[.06] px-5 py-4"
            >
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
              <div>
                <p className="m-0 text-[13px] font-semibold text-red-200">
                  Daftar kamera tidak dapat dimuat
                </p>
                <p className="mb-0 mt-1 text-[12px] text-red-300/70">
                  {listError}. Ini bukan berarti tidak ada kamera — coba muat ulang.
                </p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
              {[0, 1, 2].map((index) => (
                <SkeletonCard key={index} />
              ))}
            </div>
          )
        ) : cameras.length === 0 ? (
          <EmptyState
            icon={MonitorOff}
            title="Belum ada kamera terdaftar"
            description="Daftarkan kamera pertama dengan tombol Setup Kamera Baru. Setelah QR di-scan, kamera akan tampil di sini beserta status pairing dan heartbeat terakhirnya."
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {cameras.map((camera) => (
              <article
                key={camera.id}
                className={`rounded-2xl border border-slate-800/80 bg-[#111c2e] p-5 ${shadow.card}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-800/80 text-slate-400">
                      <Camera className="h-5 w-5" strokeWidth={1.9} />
                    </span>
                    <div className="min-w-0">
                      <h4 className="m-0 truncate text-[14px] font-bold text-white">
                        {camera.name}
                      </h4>
                      <p className="m-0 mt-0.5 truncate text-[11.5px] text-slate-500">
                        {[camera.vendor, camera.model].filter(Boolean).join(' · ') ||
                          'Merek tidak dicatat'}
                      </p>
                    </div>
                  </div>
                  <StatusPill
                    tone={statusTone(camera.status)}
                    label={STATUS_LABEL[camera.status.toUpperCase()] ?? camera.status}
                  />
                </div>
                <dl className="mb-0 mt-4 grid grid-cols-2 gap-3 text-[11.5px]">
                  <div>
                    <dt className="m-0 text-slate-500">Heartbeat</dt>
                    <dd className="m-0 mt-0.5 font-semibold text-slate-300">
                      {heartbeatLabel(camera.lastHeartbeatAt)}
                    </dd>
                  </div>
                  <div>
                    <dt className="m-0 text-slate-500">Terdaftar</dt>
                    <dd className="m-0 mt-0.5 font-semibold text-slate-300">
                      {camera.createdAt
                        ? new Date(camera.createdAt).toLocaleDateString('id-ID')
                        : '—'}
                    </dd>
                  </div>
                </dl>
                {camera.status.toUpperCase() === 'PROVISIONING' ? (
                  <p className="mb-0 mt-3 flex items-start gap-1.5 text-[11.5px] leading-relaxed text-amber-300/80">
                    <ScanLine className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={1.9} />
                    Menunggu QR pairing dipindai. Status berubah setelah kamera menyelesaikan
                    pairing.
                  </p>
                ) : null}
              </article>
            ))}
          </div>
        )}

        <p className="mb-0 mt-4 text-[11.5px] leading-relaxed text-slate-500">
          Modul streaming (RTSP/ONVIF) belum tersedia. Daftar di atas menampilkan status
          pairing dan heartbeat nyata dari backend; live view menyusul sesuai kontrak
          platform.
        </p>
      </FadeIn>
    </AdminShellV3>
  );
}

/** Minimal dependency-free QR renderer (dynamic import of qrcode). */
function QrCanvas({ value }: { value: string }) {
  const [svg, setSvg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    import('qrcode')
      .then((QR) => QR.toString(value, { type: 'svg', margin: 1, width: 220 }))
      .then((out) => {
        if (!cancelled) setSvg(out);
      })
      .catch(() => setSvg(null));
    return () => {
      cancelled = true;
    };
  }, [value]);

  return (
    <div className="inline-block rounded-xl bg-white p-3 shadow-[0_8px_24px_-6px_rgba(0,0,0,.5)]">
      {svg ? (
        <div style={{ width: 220 }} dangerouslySetInnerHTML={{ __html: svg }} />
      ) : (
        <div className="grid h-[220px] w-[220px] place-items-center text-[12px] text-slate-500">
          Membuat QR...
        </div>
      )}
    </div>
  );
}

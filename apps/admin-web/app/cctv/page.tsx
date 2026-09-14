'use client';

/**
 * CCTV page (UI v3, polish pass) — camera onboarding.
 * Admin registers a camera -> gets a one-time pairing URI rendered as QR.
 * Streaming itself stays fail-closed per the module-10 compatibility contract.
 */

import { FormEvent, useEffect, useState } from 'react';
import { AdminShellV3 } from '@/components/admin-shell-v3';
import { EmptyState, FadeIn, useToast, shadow } from '@/components/ui-polish';

import {
  Plus,
  Camera,
  QrCode,
  ShieldAlert,
  MonitorOff,
  Wifi,
  ScanLine,
  CheckCircle2,
} from 'lucide-react';

const PAIRING_STEPS = [
  { icon: Wifi, text: 'Nyalakan kamera dan masuk mode pairing (lampu kedip/bunyi).' },
  { icon: Camera, text: 'Pastikan HP terhubung ke WiFi yang dituju kamera.' },
  { icon: ScanLine, text: 'Scan kode QR di bawah lewat aplikasi scanner atau kamera.' },
  { icon: CheckCircle2, text: 'Kamera otomatis terdaftar — status berubah TERPASANG.' },
];

export default function CctvPage() {
  const [showForm, setShowForm] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pairingUri, setPairingUri] = useState<string | null>(null);
  const toast = useToast();

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

      {/* Camera grid empty state */}
      <FadeIn delay={120}>
        <EmptyState
          icon={MonitorOff}
          title="Belum ada kamera online"
          description="Setelah kamera selesai pairing dan mengirim heartbeat pertama, live view akan muncul di grid ini. Modul streaming (RTSP/ONVIF) menyusul pada fase berikutnya sesuai kontrak platform."
        />
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

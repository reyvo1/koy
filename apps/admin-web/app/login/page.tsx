'use client';

/**
 * Premium split-screen login (UI v3).
 * Left: branding panel. Right: Tenant ID + Email + Password form.
 * Posts to /api/session/login (same-origin, HttpOnly cookies).
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function PremiumLoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch('/api/session/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: form.get('email'),
          password: form.get('password'),
          tenantId: form.get('tenantId'),
        }),
      });
      const body = (await response.json()) as {
        authenticated?: boolean;
        role?: string;
        message?: string;
      };
      if (!response.ok || !body.authenticated) {
        throw new Error(body.message ?? 'Login gagal. Periksa kredensial.');
      }
      router.push(
        body.role === 'PLATFORM_ADMIN' ? '/super/dashboard' : '/tenant/dashboard',
      );
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Login gagal');
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Branding panel */}
      <div className="relative hidden overflow-hidden bg-gradient-to-br from-slate-950 via-[#0b1120] to-teal-950 lg:block">
        <div className="absolute inset-0 opacity-40"
          style={{
            backgroundImage:
              'radial-gradient(600px circle at 20% 30%, rgba(45,212,191,.18), transparent), radial-gradient(500px circle at 80% 70%, rgba(16,185,129,.12), transparent)',
          }}
        />
        <div className="relative flex h-full flex-col justify-between p-14">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-teal-400 to-emerald-600 shadow-[0_0_24px_rgba(45,212,191,.5)]" />
            <span className="text-lg font-extrabold tracking-wide text-white">
              IOT PLATFORM
            </span>
          </div>

          <div>
            <h1 className="text-5xl font-extrabold leading-tight text-white">
              Satu platform.
              <br />
              <span className="bg-gradient-to-r from-teal-300 to-emerald-400 bg-clip-text text-transparent">
                Semua perangkat.
              </span>
            </h1>
            <p className="mt-6 max-w-md text-[15px] leading-relaxed text-slate-400">
              Monitor sensor, kendalikan perangkat, atur otomasi — semua dari
              satu konsol enterprise yang aman dan real-time.
            </p>
            <div className="mt-10 flex gap-8">
              {[
                ['Real-time'],
                ['Enterprise-grade'],
                ['Multi-tenant'],
              ].map(([label]) => (
                <div key={label} className="flex items-center gap-2 text-slate-300">
                  <span className="h-1.5 w-1.5 rounded-full bg-teal-400" />
                  <span className="text-[13px] font-semibold">{label}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2 text-[12px] text-slate-600">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
            Semua sistem operasional
          </div>
        </div>
      </div>

      {/* Form panel */}
      <div className="flex items-center justify-center bg-[#0b1120] px-6">
        <div className="w-full max-w-md">
          <div className="mb-8 lg:hidden">
            <div className="mb-4 h-10 w-10 rounded-xl bg-gradient-to-br from-teal-400 to-emerald-600" />
            <span className="text-sm font-extrabold tracking-widest text-teal-300">
              IOT PLATFORM
            </span>
          </div>

          <p className="m-0 text-[13px] font-bold tracking-widest text-teal-400">
            AKSES ADMINISTRATOR
          </p>
          <h2 className="mt-2 mb-2 text-[28px] font-extrabold text-white">
            Masuk ke konsol
          </h2>
          <p className="mb-8 text-[13.5px] leading-relaxed text-slate-400">
            Kredensial hanya dikirim ke server Admin Web — token tidak
            disimpan di local storage.
          </p>

          <form onSubmit={onSubmit} className="space-y-5">
            {[
              { name: 'tenantId', label: 'Tenant ID', type: 'text' },
              { name: 'email', label: 'Email', type: 'email' },
              { name: 'password', label: 'Password', type: 'password' },
            ].map((field) => (
              <label key={field.name} className="block">
                <span className="mb-1.5 block text-[13px] font-semibold text-slate-300">
                  {field.label}
                </span>
                <input
                  name={field.name}
                  type={field.type}
                  required
                  className="w-full rounded-xl border border-slate-700 bg-slate-900/70 px-4 py-3 text-[14px] text-white outline-none transition-all placeholder-slate-600 focus:border-teal-500/60 focus:shadow-[0_0_0_3px_rgba(45,212,191,.14)]"
                />
              </label>
            ))}

            {error ? (
              <p role="alert" className="rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-[13px] text-red-400">
                {error}
              </p>
            ) : null}

            <button
              disabled={busy}
              className="w-full rounded-xl bg-gradient-to-r from-teal-500 to-emerald-500 py-3.5 text-[15px] font-bold text-white shadow-[0_6px_20px_rgba(20,184,166,.35)] transition-all hover:brightness-110 disabled:opacity-60"
            >
              {busy ? 'Memproses…' : 'Masuk →'}
            </button>
          </form>

          <p className="mt-6 text-center text-[12px] text-slate-600">
            Dilindungi sesi HttpOnly · Audit diaktifkan
          </p>
        </div>
      </div>
    </div>
  );
}

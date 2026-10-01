'use client';

/**
 * Self-service registration.
 *
 * Backed by the four previously unreachable auth endpoints (`/auth/register`,
 * `/auth/verify-email`, `/auth/forgot-password`, `/auth/reset-password`), which had a
 * working backend and no UI at all — before this, the only way to onboard a user was an
 * administrator resetting a password by hand.
 *
 * Posts to same-origin proxy routes under /api/auth/*, so credentials and tokens never
 * reach client-side storage.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AuthAlert, AuthShell } from '../../components/auth-shell';

type Status =
  | { kind: 'idle' }
  | { kind: 'busy' }
  | { kind: 'error'; message: string }
  | { kind: 'ok'; message: string };

export default function RegisterPage() {
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  // See app/login/page.tsx: the form must not be submittable before React hydrates, or a
  // native submit would place the chosen password in the URL.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus({ kind: 'busy' });

    // React nulls `event.currentTarget` once this handler yields, so the element is held
    // here and reused after the await. Reading it again post-await threw on a request
    // that had already succeeded, and the surrounding catch reported that as a failure.
    const formEl = event.currentTarget;
    const form = new FormData(formEl);
    const password = String(form.get('password') ?? '');
    const confirm = String(form.get('confirmPassword') ?? '');

    if (password !== confirm) {
      setStatus({ kind: 'error', message: 'Konfirmasi password tidak cocok.' });
      return;
    }
    if (password.length < 8) {
      setStatus({ kind: 'error', message: 'Password minimal 8 karakter.' });
      return;
    }

    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: form.get('email'),
          password,
          tenantId: form.get('tenantId'),
        }),
      });
      const body = (await response.json().catch(() => ({}))) as { message?: string };

      if (!response.ok) {
        throw new Error(body.message ?? 'Pendaftaran gagal.');
      }

      setStatus({
        kind: 'ok',
        message:
          'Pendaftaran berhasil. Buka email Anda, salin token verifikasi, lalu masukkan di halaman Verifikasi email.',
      });
      formEl.reset();
    } catch (cause) {
      setStatus({
        kind: 'error',
        message: cause instanceof Error ? cause.message : 'Pendaftaran gagal',
      });
    }
  };

  return (
    <AuthShell title="Daftar akun" subtitle="AKSES ADMINISTRATOR">
      <form onSubmit={onSubmit} method="post" className="space-y-5">
        {[
          { name: 'tenantId', label: 'Tenant ID', type: 'text', min: undefined },
          { name: 'email', label: 'Email', type: 'email', min: undefined },
          { name: 'password', label: 'Password', type: 'password', min: 8 },
          { name: 'confirmPassword', label: 'Ulangi password', type: 'password', min: 8 },
        ].map((field) => (
          <label key={field.name} className="block">
            <span className="mb-1.5 block text-[13px] font-semibold text-slate-300">
              {field.label}
            </span>
            <input
              name={field.name}
              type={field.type}
              required
              minLength={field.min}
              className="w-full rounded-xl border border-slate-700 bg-slate-900/70 px-4 py-3 text-[14px] text-white outline-none transition-all placeholder-slate-600 focus:border-teal-500/60 focus:shadow-[0_0_0_3px_rgba(45,212,191,.14)]"
            />
          </label>
        ))}

        {status.kind === 'error' ? (
          <AuthAlert kind="error" message={status.message} />
        ) : null}
        {status.kind === 'ok' ? (
          <>
            <AuthAlert kind="ok" message={status.message} />
            {/* The success message tells the user to go verify, so the destination has to
                be one click away rather than something they have to guess the URL of. */}
            <Link
              href="/verifikasi"
              className="block w-full rounded-xl border border-teal-500/40 bg-teal-500/10 px-4 py-3 text-center text-[13px] font-semibold text-teal-300 transition-all hover:bg-teal-500/20"
            >
              Buka halaman verifikasi email
            </Link>
          </>
        ) : null}

        <button
          type="submit"
          disabled={status.kind === 'busy' || !hydrated}
          className="w-full rounded-xl bg-gradient-to-r from-teal-500 to-emerald-500 py-3.5 text-[15px] font-bold text-white shadow-[0_6px_20px_rgba(20,184,166,.35)] transition-all hover:brightness-110 disabled:opacity-60"
        >
          {status.kind === 'busy' ? 'Memproses…' : 'Daftar'}
        </button>
      </form>

      <p className="mt-6 text-center text-[13px] text-slate-500">
        Sudah punya akun?{' '}
        <Link href="/login" className="font-semibold text-teal-400 hover:text-teal-300">
          Masuk
        </Link>
        {' · '}
        <Link
          href="/lupa-password"
          className="font-semibold text-teal-400 hover:text-teal-300"
        >
          Lupa password?
        </Link>
      </p>
    </AuthShell>
  );
}

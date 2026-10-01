'use client';

/**
 * Password-reset completion. The token arrives from the emailed link as ?token=..., and is
 * read on the client so the page can also be opened directly without one (in which case it
 * asks for it rather than silently failing).
 *
 * No session is established here; the user signs in with the new password afterwards.
 */

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { AuthAlert, AuthShell } from '../../components/auth-shell';

type Status =
  | { kind: 'idle' }
  | { kind: 'busy' }
  | { kind: 'error'; message: string }
  | { kind: 'ok'; message: string };

function ResetPasswordForm() {
  const [token, setToken] = useState('');
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  // See app/login/page.tsx: without hydration the browser would natively submit this form
  // and echo the new password into the URL. The button stays disabled until React is live.
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => setHydrated(true), []);

  useEffect(() => {
    const fromQuery = new URLSearchParams(window.location.search).get('token');
    if (fromQuery) {
      setToken(fromQuery);
    }
  }, []);

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

    if (password.length < 8) {
      setStatus({ kind: 'error', message: 'Password minimal 8 karakter.' });
      return;
    }
    if (password !== confirm) {
      setStatus({ kind: 'error', message: 'Konfirmasi password tidak cocok.' });
      return;
    }

    try {
      const response = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      const body = (await response.json().catch(() => ({}))) as { message?: string };

      if (!response.ok) {
        throw new Error(body.message ?? 'Tautan reset tidak valid atau sudah kedaluwarsa.');
      }

      setStatus({
        kind: 'ok',
        message: 'Password diperbarui. Silakan masuk dengan password baru.',
      });
      formEl.reset();
    } catch (cause) {
      setStatus({
        kind: 'error',
        message:
          cause instanceof Error
            ? cause.message
            : 'Tautan reset tidak valid atau sudah kedaluwarsa.',
      });
    }
  };

  return (
    <AuthShell title="Atur password baru" subtitle="PULIHKAN AKSES">
      <form onSubmit={onSubmit} method="post" className="space-y-5">
        <label className="block">
          <span className="mb-1.5 block text-[13px] font-semibold text-slate-300">
            Token reset
          </span>
          <input
            name="token"
            type="text"
            required
            value={token}
            onChange={(event) => setToken(event.target.value)}
            placeholder="Diterima dari tautan email"
            className="w-full rounded-xl border border-slate-700 bg-slate-900/70 px-4 py-3 text-[14px] text-white outline-none transition-all placeholder-slate-600 focus:border-teal-500/60 focus:shadow-[0_0_0_3px_rgba(45,212,191,.14)]"
          />
        </label>

        {[
          { name: 'password', label: 'Password baru' },
          { name: 'confirmPassword', label: 'Ulangi password baru' },
        ].map((field) => (
          <label key={field.name} className="block">
            <span className="mb-1.5 block text-[13px] font-semibold text-slate-300">
              {field.label}
            </span>
            <input
              name={field.name}
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              className="w-full rounded-xl border border-slate-700 bg-slate-900/70 px-4 py-3 text-[14px] text-white outline-none transition-all placeholder-slate-600 focus:border-teal-500/60 focus:shadow-[0_0_0_3px_rgba(45,212,191,.14)]"
            />
          </label>
        ))}

        {status.kind === 'error' ? (
          <AuthAlert kind="error" message={status.message} />
        ) : null}
        {status.kind === 'ok' ? (
          <AuthAlert kind="ok" message={status.message} />
        ) : null}

        <button
          type="submit"
          disabled={status.kind === 'busy' || !hydrated}
          className="w-full rounded-xl bg-gradient-to-r from-teal-500 to-emerald-500 py-3.5 text-[15px] font-bold text-white shadow-[0_6px_20px_rgba(20,184,166,.35)] transition-all hover:brightness-110 disabled:opacity-60"
        >
          {status.kind === 'busy' ? 'Memproses…' : 'Simpan password baru'}
        </button>
      </form>

      <p className="mt-6 text-center text-[13px] text-slate-500">
        Tautan tidak berlaku?{' '}
        <Link
          href="/lupa-password"
          className="font-semibold text-teal-400 hover:text-teal-300"
        >
          Minta tautan baru
        </Link>
      </p>
    </AuthShell>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  );
}

'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { AuthAlert, AuthShell } from '../../components/auth-shell';

/**
 * Email verification completion.
 *
 * This page exists because the registration flow was unfinishable without it. `register`
 * creates the user unverified (the Prisma default) and emails a bare 64-hex token —
 * `Verification token: ${token}`, no link, no host — while `login` refuses anything
 * unverified with `AUTH_CREDENTIALS_INVALID`. So a new user received a token and had
 * nowhere to put it: `/verifikasi`, `/verify-email` and `/konfirmasi-email` all 404'd, and
 * the registration success message ("periksa email Anda untuk verifikasi") pointed at
 * nothing. The only way in was an administrator resetting the password by hand.
 *
 * The token is read from `?token=` so this also serves a mailed link if the email template
 * ever grows one, and the field stays editable so a bare token can be pasted. Verification
 * is not signing in: nothing here sets a session, and the proxy contract forbids it.
 *
 * Token length matches what `POST /auth/verify-email` accepts; a longer value is a
 * malformed paste, not a token worth sending.
 */

type Status =
  | { kind: 'idle' }
  | { kind: 'busy' }
  | { kind: 'error'; message: string }
  | { kind: 'ok'; message: string };

const MAX_TOKEN_LENGTH = 4096;

function VerifyEmailForm() {
  const [token, setToken] = useState('');
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  // See app/login/page.tsx: without hydration the browser would natively submit this form
  // and put the token in the URL. The button stays disabled until React is live.
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => setHydrated(true), []);

  useEffect(() => {
    const fromQuery = new URLSearchParams(window.location.search).get('token');
    if (fromQuery) {
      setToken(fromQuery);
    }
  }, []);

  // A token in the query is a completed intent: redeem it without making the user press a
  // second button they did not know they needed. A pasted token still uses the form.
  //
  // This runs once, on hydration, and reads the URL directly rather than the `token` state —
  // at that point the effect above may not have committed yet, so depending on it would
  // auto-submit nothing and silently strand a mailed link.
  useEffect(() => {
    if (!hydrated) {
      return;
    }
    const fromQuery = new URLSearchParams(window.location.search).get('token');
    if (fromQuery && fromQuery.length <= MAX_TOKEN_LENGTH) {
      void submit(fromQuery);
    }
  }, [hydrated]);

  async function submit(value: string) {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      setStatus({ kind: 'error', message: 'Masukkan token verifikasi dari email.' });
      return;
    }
    if (trimmed.length > MAX_TOKEN_LENGTH) {
      setStatus({ kind: 'error', message: 'Token verifikasi tidak valid atau sudah dipakai.' });
      return;
    }

    setStatus({ kind: 'busy' });
    try {
      const response = await fetch('/api/auth/verify-email', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token: trimmed }),
      });
      const body = (await response.json().catch(() => ({}))) as { message?: string };

      if (!response.ok) {
        throw new Error(body.message ?? 'Token verifikasi tidak valid atau sudah dipakai.');
      }

      setStatus({
        kind: 'ok',
        message: 'Email terverifikasi. Silakan masuk dengan akun tersebut.',
      });
    } catch (cause) {
      setStatus({
        kind: 'error',
        message:
          cause instanceof Error
            ? cause.message
            : 'Token verifikasi tidak valid atau sudah dipakai.',
      });
    }
  }

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await submit(token);
  };

  return (
    <AuthShell title="Verifikasi email" subtitle="AKTIFKAN AKUN">
      <form onSubmit={onSubmit} method="post" className="space-y-5">
        <label className="block">
          <span className="mb-1.5 block text-[13px] font-semibold text-slate-300">
            Token verifikasi
          </span>
          <input
            name="token"
            type="text"
            required
            value={token}
            onChange={(event) => setToken(event.target.value)}
            placeholder="Diterima dari email pendaftaran"
            className="w-full rounded-xl border border-slate-700 bg-slate-900/70 px-4 py-3 text-[14px] text-white outline-none transition-all placeholder-slate-600 focus:border-teal-500/60 focus:shadow-[0_0_0_3px_rgba(45,212,191,.14)]"
          />
        </label>

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
          {status.kind === 'busy' ? 'Memverifikasi…' : 'Verifikasi'}
        </button>
      </form>

      <p className="mt-6 text-center text-[13px] text-slate-500">
        Sudah verifikasi?{' '}
        <Link href="/login" className="font-semibold text-teal-400 hover:text-teal-300">
          Masuk
        </Link>
        {' · '}
        <Link href="/daftar" className="font-semibold text-teal-400 hover:text-teal-300">
          Daftar
        </Link>
      </p>
    </AuthShell>
  );
}

export default function VerifyEmailPage() {
  // `useSearchParams` is read inside the form, so the page needs a Suspense boundary.
  return (
    <Suspense fallback={null}>
      <VerifyEmailForm />
    </Suspense>
  );
}

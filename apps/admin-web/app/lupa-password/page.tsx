'use client';

/**
 * Password-reset request.
 *
 * The proxy answers 202 for every well-formed request, so this page cannot tell the user
 * whether their account exists — and therefore must not claim an email was sent. The
 * message is deliberately identical either way.
 *
 * Delivery depends on the notification runtime, which is off by default, so a success
 * here is not a promise of delivery. The wording says "if an account matches" rather
 * than asserting an email is on its way.
 */

import { useState } from 'react';
import Link from 'next/link';
import { AuthAlert, AuthShell } from '../../components/auth-shell';

type Status =
  | { kind: 'idle' }
  | { kind: 'busy' }
  | { kind: 'error'; message: string }
  | { kind: 'ok'; message: string };

const ACCEPTED_MESSAGE =
  'Jika ada akun yang cocok, tautan reset telah diminta. Periksa email Anda.';

export default function ForgotPasswordPage() {
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus({ kind: 'busy' });

    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: form.get('email'),
          tenantId: form.get('tenantId'),
        }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { message?: string };
        throw new Error(body.message ?? 'Permintaan reset password gagal.');
      }

      setStatus({ kind: 'ok', message: ACCEPTED_MESSAGE });
      event.currentTarget.reset();
    } catch (cause) {
      setStatus({
        kind: 'error',
        message:
          cause instanceof Error ? cause.message : 'Permintaan reset password gagal',
      });
    }
  };

  return (
    <AuthShell title="Lupa password" subtitle="PULIHKAN AKSES">
      <form onSubmit={onSubmit} className="space-y-5">
        {[
          { name: 'tenantId', label: 'Tenant ID', type: 'text' },
          { name: 'email', label: 'Email terdaftar', type: 'email' },
        ].map((field) => (
          <label key={field.name} className="block">
            <span className="mb-1.5 block text-[13px] font-semibold text-slate-300">
              {field.label}
            </span>
            <input
              name={field.name}
              type={field.type}
              required
              autoComplete={field.name === 'email' ? 'email' : 'off'}
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
          disabled={status.kind === 'busy'}
          className="w-full rounded-xl bg-gradient-to-r from-teal-500 to-emerald-500 py-3.5 text-[15px] font-bold text-white shadow-[0_6px_20px_rgba(20,184,166,.35)] transition-all hover:brightness-110 disabled:opacity-60"
        >
          {status.kind === 'busy' ? 'Memproses…' : 'Kirim tautan reset'}
        </button>
      </form>

      <p className="mt-6 text-center text-[13px] text-slate-500">
        Ingat passwordnya?{' '}
        <Link href="/login" className="font-semibold text-teal-400 hover:text-teal-300">
          Masuk
        </Link>
      </p>
    </AuthShell>
  );
}

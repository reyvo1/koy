'use client';

/**
 * Settings — profil nyata via /users/profile (GET/POST) + info sesi jujur.
 * Tanpa toggle hiasan: hanya data yang benar-benar dikelola backend.
 */

import { useCallback, useEffect, useState } from 'react';

const inputClass =
  'w-full rounded-xl border border-slate-700/70 bg-slate-900/60 px-3.5 py-2.5 text-[13.5px] text-slate-200 outline-none focus:border-teal-500';

export default function SuperSettingsContent() {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/profile');
      if (!res.ok) throw new Error(`backend ${res.status}`);
      const data = (await res.json()) as { email?: string; name?: string; user?: { email?: string; name?: string } };
      const u = data.user ?? data;
      setEmail(u.email ?? '');
      setName(u.name ?? '');
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'gagal memuat profil');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch('/api/profile', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
      if (!res.ok) throw new Error(body.error?.message ?? 'Gagal menyimpan profil');
      setMessage('Profil tersimpan.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Gagal menyimpan profil');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-2xl border border-slate-800/80 bg-[#111c2e] p-6 shadow-[0_1px_2px_rgba(2,6,23,.5),0_8px_24px_-8px_rgba(2,6,23,.6),inset_0_1px_0_rgba(255,255,255,.05)]">
      <h3 className="m-0 mb-5 text-[15px] font-bold text-white">Profil</h3>
      {loading ? (
        <div className="h-32 animate-pulse rounded-xl bg-slate-800/50" />
      ) : (
        <>
          <label className="mb-4 block">
            <span className="mb-1.5 block text-[12.5px] font-semibold text-slate-400">Nama tampilan</span>
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} className={inputClass} />
          </label>
          <label className="mb-4 block">
            <span className="mb-1.5 block text-[12.5px] font-semibold text-slate-400">Email</span>
            <input value={email} disabled className={`${inputClass} opacity-60`} />
            <span className="mt-1 block text-[11px] text-slate-600">
              Email tidak dapat diubah (terikat audit trail).
            </span>
          </label>
          <button
            type="button"
            onClick={() => void save()}
            disabled={busy || loading || !name.trim()}
            className="iot-button"
          >
            {busy ? 'Menyimpan…' : 'Simpan Profil'}
          </button>
          {message ? (
            <p className="mt-3 mb-0 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-2.5 text-[13px] text-emerald-400">
              {message}
            </p>
          ) : null}
          {error ? (
            <p role="alert" className="mt-3 mb-0 rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-2.5 text-[13px] text-red-400">
              {error}
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
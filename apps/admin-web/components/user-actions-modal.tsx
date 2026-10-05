'use client';

/**
 * Shared user-management modal: edit name, change role (MEMBER/ADMIN),
 * activate/revoke, reset password, delete. Platform scope requires tenantId.
 * Self-mutation (role/status/delete) is blocked server-side; surfaced as error.
 */

import { useEffect, useState } from 'react';

export interface ManagedUser {
  id: string;
  name?: string;
  email?: string;
  role?: string;
  isVerified?: boolean;
  tenantId?: string;
  status?: string;
}

interface Props {
  user: ManagedUser | null;
  scope: 'platform' | 'tenant';
  tenantId?: string;
  onClose: () => void;
  onChanged: () => void;
}

const inputClass =
  'w-full rounded-xl border border-slate-700/70 bg-slate-900/60 px-3.5 py-2.5 text-[13.5px] text-slate-200 outline-none focus:border-teal-500';

export default function UserActionsModal({
  user,
  scope,
  tenantId,
  onClose,
  onChanged,
}: Props) {
  const [name, setName] = useState('');
  const [role, setRole] = useState('MEMBER');
  const [status, setStatus] = useState('ACTIVE');
  const [password, setPassword] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      setName(user.name ?? '');
      setRole(user.role ?? 'MEMBER');
      setStatus(user.status ?? 'ACTIVE');
      setPassword('');
      setConfirmDelete(false);
      setMessage(null);
      setError(null);
    }
  }, [user]);

  if (!user) return null;

  const isPlatformAdmin = (user.role ?? '').toUpperCase() === 'PLATFORM_ADMIN';
  const base =
    scope === 'platform' ? '/api/super/platform-users' : '/api/admin/tenant-users';

  const call = async (
    path: string,
    init: RequestInit,
    label: string,
    successMessage: string,
  ) => {
    setBusy(label);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(path, init);
      const body = (await res.json().catch(() => ({}))) as {
        message?: string;
        error?: { message?: string };
      };
      if (!res.ok) {
        throw new Error(
          body.error?.message ?? body.message ?? `Gagal (${res.status})`,
        );
      }
      setMessage(body.message ?? successMessage);
      onChanged();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Operasi gagal');
    } finally {
      setBusy(null);
    }
  };

  const saveProfile = () => {
    const originalName = user.name ?? '';
    const originalRole = user.role ?? 'MEMBER';
    const originalStatus = user.status ?? 'ACTIVE';
    const nextName = name.trim();
    const payload: {
      tenantId?: string;
      name?: string;
      role?: string;
      status?: string;
    } = scope === 'platform' ? { tenantId } : {};

    // Send only fields the operator actually changed. Sending unchanged role/status used to make a
    // harmless name edit a status mutation, which could reactivate a revoked account and also made
    // self-name edits fail because the backend correctly forbids self role/status mutation.
    if (nextName !== originalName) payload.name = nextName;
    if (!isPlatformAdmin && role !== originalRole) payload.role = role;
    if (!isPlatformAdmin && status !== originalStatus) payload.status = status;

    const changedKeys = Object.keys(payload).filter((key) => key !== 'tenantId');
    if (changedKeys.length === 0) {
      setError(null);
      setMessage('Tidak ada perubahan.');
      return;
    }

    void call(
      `${base}/${user.id}`,
      {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      },
      'save',
      'Perubahan tersimpan.',
    );
  };

  const resetPassword = () => {
    const payload =
      scope === 'platform'
        ? { tenantId, password }
        : { password };
    void call(
      `${base}/${user.id}/reset-password`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      },
      'reset',
      'Password direset; semua sesi dicabut.',
    );
  };

  const removeUser = () => {
    const path =
      scope === 'platform'
        ? `${base}/${user.id}?tenantId=${encodeURIComponent(tenantId ?? '')}`
        : `${base}/${user.id}`;
    void call(
      path,
      { method: 'DELETE' },
      'delete',
      'Pengguna dihapus dari tenant.',
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-700/60 bg-[#0d1526] p-6">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h3 className="m-0 text-[16px] font-bold text-white">Kelola Pengguna</h3>
            <p className="mt-1 mb-0 text-[12.5px] text-slate-400">
              {user.name ?? '—'} · {user.email ?? ''}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-700/70 px-3 py-1.5 text-[12px] text-slate-400 hover:text-slate-200"
          >
            Tutup
          </button>
        </div>

        {isPlatformAdmin ? (
          <p className="m-0 mb-5 rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-[12.5px] text-amber-400">
            PLATFORM_ADMIN dikelola lewat seed sistem — peran/status tidak dapat diubah di sini.
          </p>
        ) : null}

        <section className="mb-5 rounded-xl border border-slate-800/80 p-4">
          <h4 className="m-0 mb-3 text-[12px] font-bold uppercase tracking-wide text-slate-500">
            Profil &amp; Peran
          </h4>
          <div className="grid gap-3">
            <label className="block">
              <span className="mb-1 block text-[11.5px] font-semibold text-slate-400">Nama</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={120}
                className={inputClass}
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-1 block text-[11.5px] font-semibold text-slate-400">Peran</span>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  disabled={isPlatformAdmin}
                  className={inputClass}
                >
                  <option value="MEMBER">MEMBER</option>
                  <option value="ADMIN">ADMIN</option>
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-[11.5px] font-semibold text-slate-400">Status</span>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  disabled={isPlatformAdmin}
                  className={inputClass}
                >
                  {status === 'PENDING' ? (
                    <option value="PENDING" disabled>MENUNGGU VERIFIKASI</option>
                  ) : null}
                  <option value="ACTIVE">AKTIF</option>
                  <option value="REVOKED">DINONAKTIFKAN</option>
                </select>
              </label>
            </div>
            <button
              type="button"
              onClick={saveProfile}
              disabled={busy !== null || isPlatformAdmin}
              className="rounded-xl bg-teal-500 px-4 py-2.5 text-[13px] font-bold text-white hover:brightness-110 disabled:opacity-60"
            >
              {busy === 'save' ? 'Menyimpan…' : 'Simpan Perubahan'}
            </button>
          </div>
        </section>

        <section className="mb-5 rounded-xl border border-slate-800/80 p-4">
          <h4 className="m-0 mb-3 text-[12px] font-bold uppercase tracking-wide text-slate-500">
            Reset Password
          </h4>
          <div className="grid gap-3">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password baru (min. 8 karakter)"
              minLength={8}
              maxLength={128}
              className={inputClass}
            />
            <button
              type="button"
              onClick={resetPassword}
              disabled={busy !== null || password.length < 8}
              className="rounded-xl border border-teal-500/40 bg-teal-500/10 px-4 py-2.5 text-[13px] font-bold text-teal-300 hover:bg-teal-500/20 disabled:opacity-60"
            >
              {busy === 'reset' ? 'Mereset…' : 'Reset Password & Cabut Sesi'}
            </button>
          </div>
        </section>

        {!isPlatformAdmin ? (
          <section className="rounded-xl border border-red-500/25 bg-red-500/[.04] p-4">
            <h4 className="m-0 mb-3 text-[12px] font-bold uppercase tracking-wide text-red-400">
              Hapus Pengguna
            </h4>
            <label className="mb-3 flex items-center gap-2 text-[12.5px] text-slate-400">
              <input
                type="checkbox"
                checked={confirmDelete}
                onChange={(e) => setConfirmDelete(e.target.checked)}
                className="h-4 w-4 accent-red-500"
              />
              Saya paham pengguna ini akan dihapus permanen dari tenant.
            </label>
            <button
              type="button"
              onClick={removeUser}
              disabled={busy !== null || !confirmDelete}
              className="rounded-xl bg-red-500/90 px-4 py-2.5 text-[13px] font-bold text-white hover:bg-red-500 disabled:opacity-50"
            >
              {busy === 'delete' ? 'Menghapus…' : 'Hapus Permanen'}
            </button>
            <p className="mt-2 mb-0 text-[11.5px] text-slate-500">
              Gagal karena pengguna masih memiliki data? Gunakan status DINONAKTIFKAN.
            </p>
          </section>
        ) : null}

        {message ? (
          <p className="m-0 mt-4 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-[13px] text-emerald-400">
            {message}
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="m-0 mt-4 rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-[13px] text-red-400">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}

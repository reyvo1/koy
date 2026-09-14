'use client';

/**
 * Super Admin Users page content — live all-tenant user directory via
 * /api/super/platform-users (backend /admin/platform-users). Fail-closed.
 * Includes user provisioning (create MEMBER/ADMIN in any tenant).
 */

import { useCallback, useEffect, useState } from 'react';
import UserActionsModal, { ManagedUser } from './user-actions-modal';

interface UserRow extends ManagedUser {
  tenantId?: string;
  tenantName?: string;
  status?: string;
  createdAt?: string;
}

interface TenantOption {
  id: string;
  name: string;
}

const inputClass =
  'w-full rounded-xl border border-slate-700/70 bg-slate-900/60 px-3.5 py-2.5 text-[13.5px] text-slate-200 outline-none placeholder:text-slate-500 focus:border-teal-500';

function initials(name?: string, email?: string): string {
  const source = (name ?? email ?? '?').trim();
  return source.slice(0, 2).toUpperCase();
}

export default function SuperUsersContent() {
  const [users, setUsers] = useState<UserRow[] | null>(null);
  const [tenants, setTenants] = useState<TenantOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [tenantError, setTenantError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);
  const [selected, setSelected] = useState<ManagedUser | null>(null);

  const loadUsers = useCallback(() => {
    setError(null);
    fetch('/api/super/platform-users')
      .then(async (res) => {
        if (!res.ok) throw new Error(`backend ${res.status}`);
        return res.json();
      })
      .then((data: { items?: UserRow[] }) => {
        setUsers(Array.isArray(data.items) ? data.items : []);
      })
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : 'gagal memuat');
      });
  }, []);

  useEffect(() => {
    loadUsers();
    setTenantError(null);
    fetch('/api/super/tenants')
      .then(async (res) => {
        if (!res.ok) throw new Error('backend');
        return res.json();
      })
      .then((data: { items?: TenantOption[] }) => {
        setTenants(Array.isArray(data.items) ? data.items : []);
      })
      .catch((cause: unknown) => {
        setTenantError(cause instanceof Error ? cause.message : 'gagal memuat tenant');
      });
  }, [loadUsers]);

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setFormError(null);
    setFormSuccess(null);
    const form = new FormData(event.currentTarget);
    try {
      const res = await fetch('/api/super/platform-users', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          tenantId: form.get('tenantId'),
          email: String(form.get('email') ?? '').trim(),
          name: String(form.get('name') ?? '').trim() || undefined,
          password: form.get('password'),
          role: form.get('role'),
        }),
      });
      const body = (await res.json()) as { message?: string; error?: { message?: string } };
      if (!res.ok) {
        throw new Error(body.error?.message ?? body.message ?? 'Gagal menambah pengguna');
      }
      setFormSuccess(`Pengguna ${body && typeof body === 'object' && 'email' in body ? String((body as { email: string }).email) : ''} berhasil dibuat.`);
      event.currentTarget.reset();
      loadUsers();
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : 'Gagal menambah pengguna');
    } finally {
      setBusy(false);
    }
  };

  if (error && !users) {
    return (
      <div className="rounded-xl border border-dashed border-slate-700/70 p-10 text-center">
        <p className="m-0 text-[15px] font-semibold text-slate-300">
          Direktori pengguna tidak tersedia
        </p>
        <p className="mt-2 text-[13px] text-slate-500">Backend ({error}).</p>
      </div>
    );
  }

  if (!users) {
    return (
      <div className="space-y-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-14 animate-pulse rounded-xl bg-slate-800/60" />
        ))}
      </div>
    );
  }

  const q = search.trim().toLowerCase();
  const filtered = q
    ? users.filter((u) =>
        `${u.name ?? ''} ${u.email ?? ''} ${u.role ?? ''} ${u.tenantName ?? ''}`
          .toLowerCase()
          .includes(q),
      )
    : users;

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cari nama, email, peran, atau tenant…"
          className={`${inputClass} sm:flex-1`}
        />
        <button
          type="button"
          onClick={() => {
            setShowForm((v) => !v);
            setFormError(null);
            setFormSuccess(null);
          }}
          className="shrink-0 rounded-xl bg-gradient-to-r from-teal-500 to-emerald-500 px-5 py-2.5 text-[13px] font-bold text-white shadow-[0_4px_16px_rgba(20,184,166,.3)] transition-all hover:brightness-110"
        >
          {showForm ? 'Tutup' : '+ Tambah Pengguna'}
        </button>
      </div>

      {showForm ? (
        <form
          onSubmit={onSubmit}
          className="mb-5 grid gap-4 rounded-2xl border border-slate-800/80 bg-[#0d1526] p-5 sm:grid-cols-2"
        >
          <label className="block">
            <span className="mb-1.5 block text-[12px] font-semibold text-slate-400">Tenant *</span>
            <select name="tenantId" required disabled={Boolean(tenantError)} className={inputClass} defaultValue="">
              <option value="" disabled>Pilih tenant…</option>
              {tenants.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[12px] font-semibold text-slate-400">Peran *</span>
            <select name="role" required className={inputClass} defaultValue="MEMBER">
              <option value="MEMBER">MEMBER — akses dasar</option>
              <option value="ADMIN">ADMIN — kelola tenant</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[12px] font-semibold text-slate-400">Email *</span>
            <input name="email" type="email" required maxLength={320} placeholder="nama@tenant.id" className={inputClass} />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[12px] font-semibold text-slate-400">Nama</span>
            <input name="name" type="text" maxLength={120} placeholder="Nama lengkap" className={inputClass} />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[12px] font-semibold text-slate-400">Password * (min. 8 karakter)</span>
            <input name="password" type="password" required minLength={8} maxLength={128} className={inputClass} />
          </label>
          {tenantError ? (
            <p role="alert" className="sm:col-span-2 m-0 rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-[13px] text-red-400">
              Direktori tenant tidak tersedia ({tenantError}). Pembuatan pengguna dinonaktifkan sampai data tenant berhasil dimuat.
            </p>
          ) : tenants.length === 0 ? (
            <p className="sm:col-span-2 m-0 rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-[13px] text-amber-300">
              Belum ada tenant yang dapat dipilih.
            </p>
          ) : null}
          <div className="flex items-end">
            <button
              disabled={busy || Boolean(tenantError) || tenants.length === 0}
              className="w-full rounded-xl bg-teal-500 px-5 py-2.5 text-[13px] font-bold text-white transition-all hover:brightness-110 disabled:opacity-60"
            >
              {busy ? 'Menyimpan…' : 'Simpan Pengguna'}
            </button>
          </div>
          {formError ? (
            <p role="alert" className="sm:col-span-2 m-0 rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-[13px] text-red-400">
              {formError}
            </p>
          ) : null}
          {formSuccess ? (
            <p className="sm:col-span-2 m-0 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-[13px] text-emerald-400">
              {formSuccess}
            </p>
          ) : null}
        </form>
      ) : null}

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-700/70 p-10 text-center">
          <p className="m-0 text-[15px] font-semibold text-slate-300">
            {q ? 'Tidak ada hasil' : 'Belum ada pengguna'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((user) => (
            <div
              key={user.id}
              className="flex items-center gap-4 rounded-xl border border-slate-800/70 px-5 py-3.5"
            >
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-teal-500/10 text-[13px] font-bold text-teal-300">
                {initials(user.name, user.email)}
              </span>
              <div className="min-w-0">
                <div className="text-[14px] font-bold text-slate-100">
                  {user.name ?? '—'}
                </div>
                <div className="text-[12px] text-slate-400">
                  {user.email ?? ''} · {user.tenantName ?? '—'}
                </div>
              </div>
              <div className="ml-auto flex shrink-0 items-center gap-3">
                <span className="rounded-full bg-teal-500/10 px-3 py-1 text-[11px] font-bold text-teal-300">
                  {(user.role ?? 'MEMBER').toUpperCase()}
                </span>
                {user.status === 'REVOKED' ? (
                  <span className="hidden rounded-full bg-red-500/10 px-3 py-1 text-[11px] font-bold text-red-400 sm:inline">
                    NONAKTIF
                  </span>
                ) : (
                  <span
                    className={`hidden rounded-full px-3 py-1 text-[11px] font-bold sm:inline ${
                      user.isVerified
                        ? 'bg-emerald-500/10 text-emerald-400'
                        : 'bg-amber-500/10 text-amber-400'
                    }`}
                  >
                    {user.isVerified ? 'VERIFIED' : 'PENDING'}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => setSelected(user)}
                  className="rounded-lg border border-slate-700/70 px-3 py-1.5 text-[12px] font-semibold text-slate-300 transition-colors hover:border-teal-500/50 hover:text-teal-300"
                >
                  Kelola
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <UserActionsModal
        user={selected}
        scope="platform"
        tenantId={selected?.tenantId}
        onClose={() => setSelected(null)}
        onChanged={() => {
          setSelected(null);
          loadUsers();
        }}
      />
    </div>
  );
}

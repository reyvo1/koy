'use client';

/**
 * Super Admin Tenants — full lifecycle: create, rename, delete (empty only).
 * Backend /admin/tenants (platform-guarded). Seeded system tenants protected.
 */

import { useCallback, useEffect, useState } from 'react';

interface TenantRow {
  id: string;
  name: string;
  status?: string;
  userCount?: number;
  deviceCount?: number;
  createdAt?: string;
}

const inputClass =
  'w-full rounded-xl border border-slate-700/70 bg-slate-900/60 px-3.5 py-2.5 text-[13.5px] text-slate-200 outline-none placeholder:text-slate-500 focus:border-teal-500';

export default function SuperTenantsContent() {
  const [tenants, setTenants] = useState<TenantRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch('/api/super/tenants')
      .then(async (res) => {
        if (!res.ok) throw new Error(`backend ${res.status}`);
        return res.json();
      })
      .then((data: { items?: TenantRow[] }) =>
        setTenants(Array.isArray(data.items) ? data.items : []),
      )
      .catch((cause: unknown) =>
        setError(cause instanceof Error ? cause.message : 'gagal memuat'),
      );
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const createTenant = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy('create');
    setFormError(null);
    const form = new FormData(event.currentTarget);
    try {
      const res = await fetch('/api/super/tenants', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: String(form.get('name') ?? '').trim() }),
      });
      const body = (await res.json()) as { name?: string; error?: { message?: string } };
      if (!res.ok) throw new Error(body.error?.message ?? 'Gagal membuat tenant');
      setNotice(`Tenant "${body.name}" dibuat.`);
      event.currentTarget.reset();
      load();
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : 'Gagal membuat tenant');
    } finally {
      setBusy(null);
    }
  };

  const renameTenant = async () => {
    if (!renaming) return;
    setBusy(`rename-${renaming.id}`);
    setNotice(null);
    try {
      const res = await fetch(`/api/super/tenants/${renaming.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: renaming.name.trim() }),
      });
      const body = (await res.json()) as { error?: { message?: string } };
      if (!res.ok) throw new Error(body.error?.message ?? 'Gagal mengubah nama');
      setNotice('Nama tenant diubah.');
      setRenaming(null);
      load();
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : 'Gagal mengubah nama');
    } finally {
      setBusy(null);
    }
  };

  const deleteTenant = async (tenantId: string) => {
    setBusy(`delete-${tenantId}`);
    setNotice(null);
    try {
      const res = await fetch(`/api/super/tenants/${tenantId}`, { method: 'DELETE' });
      const body = (await res.json()) as { error?: { message?: string } };
      if (!res.ok) throw new Error(body.error?.message ?? 'Gagal menghapus tenant');
      setNotice('Tenant dihapus.');
      setConfirmDelete(null);
      load();
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : 'Gagal menghapus tenant');
      setConfirmDelete(null);
    } finally {
      setBusy(null);
    }
  };

  if (error && !tenants) {
    return (
      <div className="rounded-xl border border-dashed border-slate-700/70 p-10 text-center">
        <p className="m-0 text-[15px] font-semibold text-slate-300">Direktori tenant tidak tersedia</p>
        <p className="mt-2 text-[13px] text-slate-500">Backend ({error}).</p>
      </div>
    );
  }

  if (!tenants) {
    return <div className="h-40 animate-pulse rounded-xl bg-slate-800/60" />;
  }

  const q = search.trim().toLowerCase();
  const filtered = q ? tenants.filter((t) => `${t.name} ${t.id}`.toLowerCase().includes(q)) : tenants;

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cari tenant…"
          className={`${inputClass} sm:flex-1`}
        />
        <button
          type="button"
          onClick={() => {
            setShowForm((v) => !v);
            setFormError(null);
          }}
          className="shrink-0 rounded-xl bg-gradient-to-r from-teal-500 to-emerald-500 px-5 py-2.5 text-[13px] font-bold text-white shadow-[0_4px_16px_rgba(20,184,166,.3)] transition-all hover:brightness-110"
        >
          {showForm ? 'Tutup' : '+ Tambah Tenant'}
        </button>
      </div>

      {showForm ? (
        <form
          onSubmit={createTenant}
          className="mb-5 grid gap-4 rounded-2xl border border-slate-800/80 bg-[#0d1526] p-5 sm:grid-cols-[1fr_auto]"
        >
          <label className="block">
            <span className="mb-1.5 block text-[12px] font-semibold text-slate-400">Nama tenant *</span>
            <input name="name" required maxLength={80} placeholder="Tenant Contoh" className={inputClass} />
          </label>
          <div className="flex items-end">
            <button
              disabled={busy !== null}
              className="w-full rounded-xl bg-teal-500 px-6 py-2.5 text-[13px] font-bold text-white transition-all hover:brightness-110 disabled:opacity-60 sm:w-auto"
            >
              {busy === 'create' ? 'Membuat…' : 'Buat Tenant'}
            </button>
          </div>
          {formError ? (
            <p role="alert" className="sm:col-span-2 m-0 rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-[13px] text-red-400">
              {formError}
            </p>
          ) : null}
        </form>
      ) : null}

      {notice ? (
        <p className="mb-4 m-0 rounded-xl border border-teal-500/25 bg-teal-500/10 px-4 py-3 text-[13px] text-teal-300">
          {notice}
        </p>
      ) : null}

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-700/70 p-10 text-center">
          <p className="m-0 text-[15px] font-semibold text-slate-300">
            {q ? 'Tidak ada hasil' : 'Belum ada tenant'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((tenant) => {
            const isSystem = tenant.id.startsWith('00000000') || tenant.id.startsWith('22222222');
            return (
              <div
                key={tenant.id}
                className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-800/70 px-5 py-3.5"
              >
                <div className="min-w-0 flex-1">
                  {renaming?.id === tenant.id ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        value={renaming.name}
                        onChange={(e) => setRenaming({ ...renaming, name: e.target.value })}
                        maxLength={80}
                        className="rounded-lg border border-teal-500/40 bg-slate-900/60 px-3 py-1.5 text-[13.5px] text-slate-200 outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => void renameTenant()}
                        disabled={busy !== null}
                        className="rounded-lg bg-teal-500 px-3 py-1.5 text-[12px] font-bold text-white disabled:opacity-60"
                      >
                        {busy === `rename-${tenant.id}` ? '…' : 'Simpan'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setRenaming(null)}
                        className="rounded-lg border border-slate-700/70 px-3 py-1.5 text-[12px] text-slate-400"
                      >
                        Batal
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="text-[14px] font-bold text-slate-100">{tenant.name}</div>
                      <div className="text-[12px] text-slate-500">
                        {tenant.userCount ?? 0} user · {tenant.deviceCount ?? 0} perangkat
                        {tenant.createdAt ? ` · sejak ${new Date(tenant.createdAt).toLocaleDateString('id-ID')}` : ''}
                      </div>
                    </>
                  )}
                </div>
                {!renaming || renaming.id !== tenant.id ? (
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setRenaming({ id: tenant.id, name: tenant.name })}
                      className="rounded-lg border border-slate-700/70 px-3 py-1.5 text-[12px] font-semibold text-slate-300 transition-colors hover:border-teal-500/50 hover:text-teal-300"
                    >
                      Ganti Nama
                    </button>
                    {isSystem ? (
                      <span className="rounded-lg bg-slate-800/70 px-3 py-1.5 text-[11px] font-bold text-slate-500">
                        SISTEM
                      </span>
                    ) : confirmDelete === tenant.id ? (
                      <>
                        <button
                          type="button"
                          onClick={() => void deleteTenant(tenant.id)}
                          disabled={busy !== null}
                          className="rounded-lg bg-red-500/90 px-3 py-1.5 text-[12px] font-bold text-white disabled:opacity-60"
                        >
                          {busy === `delete-${tenant.id}` ? '…' : 'Yakin Hapus'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDelete(null)}
                          className="rounded-lg border border-slate-700/70 px-3 py-1.5 text-[12px] text-slate-400"
                        >
                          Batal
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmDelete(tenant.id)}
                        className="rounded-lg border border-red-500/30 px-3 py-1.5 text-[12px] font-semibold text-red-400 transition-colors hover:bg-red-500/10"
                      >
                        Hapus
                      </button>
                    )}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

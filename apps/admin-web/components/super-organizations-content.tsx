'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Building2, Copy, Check, Trash2, Unlink } from 'lucide-react';

interface TenantRow {
  id: string;
  name: string;
}

interface OrganizationBranchRow {
  id: string;
  tenantId: string;
  tenantName: string;
  label: string;
  isPrimary: boolean;
  createdAt: string;
}

interface OrganizationRow {
  id: string;
  name: string;
  ownerMembershipId: string;
  ownerEmail: string;
  canManage: boolean;
  createdAt: string;
  branches: OrganizationBranchRow[];
}

const inputClass =
  'w-full rounded-xl border border-slate-700/70 bg-slate-900/60 px-3.5 py-2.5 text-[13.5px] text-slate-200 outline-none placeholder:text-slate-500 focus:border-teal-500';

export default function SuperOrganizationsContent() {
  const [organizations, setOrganizations] = useState<OrganizationRow[] | null>(null);
  const [tenants, setTenants] = useState<TenantRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [branchFor, setBranchFor] = useState<string | null>(null);
  const [branchTenantId, setBranchTenantId] = useState('');
  const [branchLabel, setBranchLabel] = useState('');
  const [confirmRemoveBranchId, setConfirmRemoveBranchId] = useState<string | null>(null);
  const [confirmDeleteOrganizationId, setConfirmDeleteOrganizationId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const [organizationsRes, tenantsRes] = await Promise.all([
      fetch('/api/super/organizations', { cache: 'no-store' }),
      fetch('/api/super/tenants', { cache: 'no-store' }),
    ]);
    if (!organizationsRes.ok) {
      throw new Error(`organisasi backend ${organizationsRes.status}`);
    }
    if (!tenantsRes.ok) {
      throw new Error(`tenant backend ${tenantsRes.status}`);
    }
    const organizationsBody = (await organizationsRes.json().catch(() => { throw new Error('Backend mengembalikan respons yang tidak dapat dibaca.'); })) as { items?: OrganizationRow[] };
    const tenantsBody = (await tenantsRes.json().catch(() => { throw new Error('Backend mengembalikan respons yang tidak dapat dibaca.'); })) as { items?: TenantRow[] };
    setOrganizations(Array.isArray(organizationsBody.items) ? organizationsBody.items : []);
    setTenants(Array.isArray(tenantsBody.items) ? tenantsBody.items : []);
  }, []);

  useEffect(() => {
    void load().catch((cause: unknown) => {
      setError(cause instanceof Error ? cause.message : 'gagal memuat organisasi');
    });
  }, [load]);

  const assignedTenantIds = useMemo(
    () => new Set((organizations ?? []).flatMap((organization) => organization.branches.map((branch) => branch.tenantId))),
    [organizations],
  );
  const availableTenants = useMemo(
    () => (tenants ?? []).filter((tenant) => !assignedTenantIds.has(tenant.id)),
    [tenants, assignedTenantIds],
  );
  const ownsOrganization = useMemo(
    () => (organizations ?? []).some((organization) => organization.canManage),
    [organizations],
  );

  const addBranch = async (organization: OrganizationRow) => {
    if (!branchTenantId || branchLabel.trim().length < 2) {
      setError('Pilih tenant dan isi label cabang minimal 2 karakter.');
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch('/api/super/organizations/branches', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          organizationId: organization.id,
          tenantId: branchTenantId,
          label: branchLabel.trim(),
        }),
      });
      const body = (await response.json().catch(() => null)) as
        | { id?: string; message?: string; error?: { message?: string } }
        | null;
      if (!response.ok) {
        throw new Error(body?.error?.message ?? body?.message ?? `Gagal (${response.status})`);
      }
      setNotice(`Cabang "${branchLabel.trim()}" ditambahkan ke ${organization.name}.`);
      setBranchFor(null);
      setBranchTenantId('');
      setBranchLabel('');
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Gagal menambahkan cabang');
    } finally {
      setBusy(false);
    }
  };

  const removeBranch = async (organization: OrganizationRow, branch: OrganizationBranchRow) => {
    if (branch.isPrimary) {
      setError('Cabang utama tidak dapat dilepas langsung. Hapus organisasi jika grouping harus dibubarkan.');
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(
        `/api/super/organizations/${organization.id}/branches/${branch.tenantId}`,
        { method: 'DELETE' },
      );
      const body = (await response.json().catch(() => null)) as
        | { message?: string; error?: { message?: string } }
        | null;
      if (!response.ok) {
        throw new Error(body?.error?.message ?? body?.message ?? `Gagal (${response.status})`);
      }
      setNotice(`Cabang "${branch.label}" dilepas dari ${organization.name}. Tenant tetap ada.`);
      setConfirmRemoveBranchId(null);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Gagal melepas cabang');
    } finally {
      setBusy(false);
    }
  };

  const deleteOrganization = async (organization: OrganizationRow) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`/api/super/organizations/${organization.id}`, {
        method: 'DELETE',
      });
      const body = (await response.json().catch(() => null)) as
        | { message?: string; error?: { message?: string } }
        | null;
      if (!response.ok) {
        throw new Error(body?.error?.message ?? body?.message ?? `Gagal (${response.status})`);
      }
      setNotice(`Organisasi "${organization.name}" dihapus. Tenant/cabang tidak ikut dihapus.`);
      setConfirmDeleteOrganizationId(null);
      setBranchFor(null);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Gagal menghapus organisasi');
    } finally {
      setBusy(false);
    }
  };

  const createOrganization = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setFormError(null);
    setNotice(null);
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch('/api/super/organizations', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: String(form.get('name') ?? '').trim(),
          firstBranchTenantId: String(form.get('firstBranchTenantId') ?? '').trim(),
          firstBranchLabel: String(form.get('firstBranchLabel') ?? '').trim(),
        }),
      });
      const body = (await response.json().catch(() => null)) as
        | { id?: string; message?: string; error?: { message?: string } }
        | null;
      if (!response.ok) {
        throw new Error(body?.error?.message ?? body?.message ?? `Gagal (${response.status})`);
      }
      if (!body?.id) throw new Error('Backend tidak mengembalikan ID organisasi');
      setNotice(`Organisasi dibuat. ID: ${body.id}`);
      event.currentTarget.reset();
      setShowForm(false);
      await load();
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : 'Gagal membuat organisasi');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mt-10 border-t border-slate-800/80 pt-8">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="m-0 text-[17px] font-bold text-white">Organization &amp; Branch</h2>
          <p className="mt-1 mb-0 text-[12.5px] text-slate-500">
            Buat organisasi platform dari tenant yang sudah ada. Tenant hanya boleh menjadi cabang satu organisasi.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setShowForm((value) => !value);
            setFormError(null);
          }}
          disabled={!tenants || availableTenants.length === 0 || ownsOrganization}
          className="rounded-xl bg-gradient-to-r from-teal-500 to-emerald-500 px-5 py-2.5 text-[13px] font-bold text-white disabled:opacity-50"
        >
          {showForm ? 'Tutup' : ownsOrganization ? 'Organisasi Anda sudah dibuat' : '+ Buat Organisasi'}
        </button>
      </div>

      {showForm ? (
        <form onSubmit={createOrganization} className="mb-5 grid gap-4 rounded-2xl border border-slate-800/80 bg-[#0d1526] p-5 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-[12px] font-semibold text-slate-400">Nama organisasi *</span>
            <input name="name" required minLength={2} maxLength={120} className={inputClass} placeholder="Reyvo Group" />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[12px] font-semibold text-slate-400">Tenant utama *</span>
            <select name="firstBranchTenantId" required defaultValue="" className={inputClass}>
              <option value="" disabled>Pilih tenant yang belum menjadi cabang</option>
              {availableTenants.map((tenant) => (
                <option key={tenant.id} value={tenant.id}>{tenant.name}</option>
              ))}
            </select>
          </label>
          <label className="block sm:col-span-2">
            <span className="mb-1.5 block text-[12px] font-semibold text-slate-400">Label cabang utama *</span>
            <input name="firstBranchLabel" required minLength={2} maxLength={120} className={inputClass} placeholder="Kantor Pusat" />
          </label>
          <div className="sm:col-span-2">
            <button disabled={busy} className="rounded-xl bg-teal-500 px-6 py-2.5 text-[13px] font-bold text-white disabled:opacity-60">
              {busy ? 'Membuat…' : 'Buat Organisasi'}
            </button>
          </div>
          {formError ? (
            <p role="alert" className="sm:col-span-2 m-0 rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-[13px] text-red-400">{formError}</p>
          ) : null}
        </form>
      ) : null}

      {notice ? (
        <p className="mb-4 m-0 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-[13px] text-emerald-300">{notice}</p>
      ) : null}
      {error ? (
        <p role="alert" className="mb-4 m-0 rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-[13px] text-red-400">{error}</p>
      ) : null}

      {organizations === null ? (
        <div className="h-32 animate-pulse rounded-xl bg-slate-800/60" />
      ) : organizations.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-700/70 p-8 text-center text-[13px] text-slate-500">Belum ada organisasi.</div>
      ) : (
        <div className="space-y-3">
          {organizations.map((organization) => (
            <div key={organization.id} className="rounded-2xl border border-slate-800/80 bg-[#0d1526] p-5">
              <div className="flex flex-wrap items-start gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-xl bg-teal-500/10 text-teal-300"><Building2 className="h-5 w-5" /></div>
                <div className="min-w-0 flex-1">
                  <div className="text-[15px] font-bold text-white">{organization.name}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-[11.5px] text-slate-500">
                    <code>{organization.id}</code>
                    <button
                      type="button"
                      onClick={async () => {
                        await navigator.clipboard.writeText(organization.id);
                        setCopied(organization.id);
                        setTimeout(() => setCopied((current) => (current === organization.id ? null : current)), 1500);
                      }}
                      className="inline-flex items-center gap-1 rounded-md border border-slate-700/70 px-2 py-1 text-slate-400"
                    >
                      {copied === organization.id ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                      {copied === organization.id ? 'Disalin' : 'Salin ID'}
                    </button>
                    <span>owner {organization.ownerEmail}</span>
                  </div>
                </div>
              </div>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {organization.branches.map((branch) => (
                  <div key={branch.id} className="rounded-xl border border-slate-800/70 bg-slate-950/30 px-3 py-2.5">
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 text-[12.5px] font-semibold text-slate-200">
                          {branch.label}
                          {branch.isPrimary ? <span className="rounded-full bg-teal-500/10 px-2 py-0.5 text-[10px] text-teal-300">UTAMA</span> : null}
                        </div>
                        <div className="mt-1 text-[11.5px] text-slate-500">{branch.tenantName} · <code>{branch.tenantId}</code></div>
                      </div>
                      {organization.canManage && !branch.isPrimary ? (
                        confirmRemoveBranchId === branch.id ? (
                          <div className="flex shrink-0 items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => void removeBranch(organization, branch)}
                              disabled={busy}
                              className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-2 py-1.5 text-[10.5px] font-bold text-amber-200 disabled:opacity-50"
                            >
                              Lepas
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmRemoveBranchId(null)}
                              disabled={busy}
                              className="rounded-lg border border-slate-700 px-2 py-1.5 text-[10.5px] text-slate-400 disabled:opacity-50"
                            >
                              Batal
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmRemoveBranchId(branch.id)}
                            disabled={busy}
                            aria-label={`Lepas cabang ${branch.label}`}
                            title="Lepas cabang dari organisasi"
                            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-amber-500/30 text-amber-300 hover:bg-amber-500/10 disabled:opacity-50"
                          >
                            <Unlink className="h-3.5 w-3.5" />
                          </button>
                        )
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-3">
                {branchFor === organization.id ? (
                  <div className="grid gap-2 rounded-xl border border-slate-800/70 bg-slate-950/30 p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto_auto]">
                    <select
                      value={branchTenantId}
                      onChange={(event) => setBranchTenantId(event.target.value)}
                      className={inputClass}
                      disabled={busy}
                    >
                      <option value="">Pilih tenant yang belum menjadi cabang</option>
                      {availableTenants.map((tenant) => (
                        <option key={tenant.id} value={tenant.id}>{tenant.name}</option>
                      ))}
                    </select>
                    <input
                      value={branchLabel}
                      onChange={(event) => setBranchLabel(event.target.value)}
                      minLength={2}
                      maxLength={120}
                      placeholder="Label cabang"
                      className={inputClass}
                      disabled={busy}
                    />
                    <button
                      type="button"
                      onClick={() => void addBranch(organization)}
                      disabled={busy || !branchTenantId || branchLabel.trim().length < 2}
                      className="rounded-xl bg-teal-500 px-3 py-2 text-[12px] font-bold text-white disabled:opacity-50"
                    >
                      {busy ? 'Menyimpan…' : 'Tambah'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setBranchFor(null);
                        setBranchTenantId('');
                        setBranchLabel('');
                      }}
                      disabled={busy}
                      className="rounded-xl border border-slate-700 px-3 py-2 text-[12px] font-semibold text-slate-300 disabled:opacity-50"
                    >
                      Batal
                    </button>
                  </div>
                ) : organization.canManage && availableTenants.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => {
                      setBranchFor(organization.id);
                      setBranchTenantId('');
                      setBranchLabel('');
                      setFormError(null);
                    }}
                    className="rounded-lg border border-slate-700 px-3 py-2 text-[12px] font-semibold text-slate-300 hover:border-teal-500/50 hover:text-teal-300"
                  >
                    + Tambah cabang
                  </button>
                ) : (
                  <span className="text-[11.5px] text-slate-600">
                    {organization.canManage
                      ? 'Semua tenant yang termuat sudah menjadi cabang organisasi.'
                      : 'Hanya owner organisasi yang dapat menambahkan cabang.'}
                  </span>
                )}
              </div>
              {organization.canManage ? (
                <div className="mt-3 border-t border-slate-800/70 pt-3">
                  {confirmDeleteOrganizationId === organization.id ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[11.5px] text-amber-300">
                        Hapus grouping organisasi? Semua branch akan dilepas, tetapi tenant tetap ada.
                      </span>
                      <button
                        type="button"
                        onClick={() => void deleteOrganization(organization)}
                        disabled={busy}
                        className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-1.5 text-[11px] font-bold text-red-300 disabled:opacity-50"
                      >
                        Ya, hapus organisasi
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteOrganizationId(null)}
                        disabled={busy}
                        className="rounded-lg border border-slate-700 px-3 py-1.5 text-[11px] text-slate-400 disabled:opacity-50"
                      >
                        Batal
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteOrganizationId(organization.id)}
                      disabled={busy}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/30 px-3 py-1.5 text-[11.5px] font-semibold text-red-300 hover:bg-red-500/10 disabled:opacity-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Hapus organisasi
                    </button>
                  )}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

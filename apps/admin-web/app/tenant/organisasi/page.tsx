'use client';

/**
 * Organisasi & Cabang — pengelompokan tenant.
 *
 * Backend sudah punya `POST /organizations`, `POST /organizations/branches` dan
 * `GET /organizations/:id/branches`, dan yang terakhir itu kini menolak pembaca yang bukan
 * anggota organisasi. Tanpa layar, tiga route itu hanya bisa dipanggil dengan curl.
 *
 * Halaman ini sengaja menampilkan penolakan apa adanya. Dulu `proxyBackend` mengubah 403
 * menjadi 401 "sesi tidak valid" sekaligus menghapus cookie — jadi admin yang sah akan
 * **terlogout** karena permintaannya ditolak. Sekarang 403 diteruskan apa adanya, dan
 * operator melihat alasannya sambil tetap masuk.
 */

import { useCallback, useEffect, useState } from 'react';
import { TenantShell } from '@/components/tenant-shell';
import { EmptyState, FadeIn, SkeletonCard } from '@/components/ui-polish';
import { Building2, Plus, Loader2, AlertTriangle } from 'lucide-react';

interface BranchRow {
  id: string;
  organizationId: string;
  tenantId: string;
  label: string;
  isPrimary: boolean;
  createdAt: string;
}

export default function TenantOrganizationsPage() {
  const [organizationId, setOrganizationId] = useState('');
  /**
   * The organization actually loaded, which is not the same as what is in the field.
   *
   * Fetching from a `useEffect` keyed on `organizationId` fires a request per keystroke: typing
   * a 36-character UUID issued 36 requests, of which the first 35 were 400s from the BFF's
   * edge validation. It also meant the page showed a refusal while the operator was still
   * halfway through typing, which reads as "this organization does not exist".
   */
  const [loadedId, setLoadedId] = useState<string | null>(null);
  const [branches, setBranches] = useState<BranchRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [tenantId, setTenantId] = useState('');
  const [label, setLabel] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!organizationId) {
      setBranches(null);
      setLoadedId(null);
      return;
    }
    setError(null);
    setNotice(null);
    setLoadedId(organizationId);
    const res = await fetch(`/api/admin/organizations/${organizationId}/branches`, {
      cache: 'no-store',
    });
    if (res.status === 403) {
      // Not a session problem. Say exactly that, and stay signed in.
      setBranches(null);
      setError(
        'Anda bukan pemilik atau anggota organisasi ini, jadi cabangnya tidak dapat dibaca.',
      );
      return;
    }
    if (res.status === 404) {
      setBranches(null);
      setError('Organisasi tidak ditemukan.');
      return;
    }
    if (!res.ok) {
      setBranches(null);
      setError(`Gagal memuat cabang (backend ${res.status}).`);
      return;
    }
    const body = (await res.json()) as BranchRow[] | { items?: BranchRow[] };
    setBranches(Array.isArray(body) ? body : (body.items ?? []));
  }, [organizationId]);

  // Deliberately NOT `useEffect(load, [load])`: the fetch is driven by the Muat button, not by
  // the field's contents. The effect is kept only to clear stale results when the field is
  // emptied, which needs no request.
  useEffect(() => {
    if (organizationId === '') {
      setBranches(null);
      setLoadedId(null);
      setError(null);
      setNotice(null);
    }
  }, [organizationId]);

  const addBranch = async () => {
    setFormError(null);
    if (!tenantId.trim()) {
      setFormError('Tenant ID wajib diisi.');
      return;
    }
    if (!label.trim()) {
      setFormError('Label cabang wajib diisi.');
      return;
    }
    setBusy('add');
    try {
      const res = await fetch('/api/admin/organizations/branches', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          organizationId,
          tenantId: tenantId.trim(),
          label: label.trim(),
        }),
      });
      const payload = (await res.json().catch(() => null)) as {
        message?: string;
        error?: { message?: string; code?: string };
      } | null;
      if (!res.ok) {
        throw new Error(
          payload?.message ??
            payload?.error?.message ??
            `backend ${res.status}`,
        );
      }
      setNotice(`Cabang "${label.trim()}" ditambahkan.`);
      setTenantId('');
      setLabel('');
      setShowAdd(false);
      await load();
    } catch (cause) {
      setFormError(
        cause instanceof Error ? cause.message : 'Gagal menambah cabang',
      );
    } finally {
      setBusy(null);
    }
  };

  return (
    <TenantShell
      title="Organisasi"
      subtitle="Kelompokkan beberapa tenant dalam satu organisasi"
      active="/tenant/organisasi"
    >
      <div className="iot2-panel mb-5">
        <label className="mb-1.5 block text-[12.5px] font-semibold text-slate-400">
          ID organisasi
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={organizationId}
            onChange={(event) => setOrganizationId(event.target.value.trim())}
            maxLength={36}
            placeholder="00000000-0000-4000-8000-000000000000"
            className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2 font-mono text-[13px] text-slate-100 outline-none focus:border-teal-400"
          />
          <button
            type="button"
            onClick={() => void load()}
            disabled={!organizationId || busy !== null}
            className="rounded-lg bg-teal-400 px-4 py-2 text-[13px] font-bold text-slate-950 transition-colors hover:bg-teal-300 disabled:opacity-50"
          >
            Muat
          </button>
        </div>
        <p className="mb-0 mt-1.5 text-[11.5px] text-slate-500">
          ID organisasi diberikan oleh admin platform saat organisasi dibuat
          (<code>POST /organizations</code>). Hanya pemilik dan anggota tenant dalam grup
          yang dapat membaca cabangnya.
        </p>
      </div>

      {error ? (
        <div
          role="alert"
          className="mb-4 flex items-start gap-2.5 rounded-xl border border-amber-500/25 bg-amber-500/[.06] px-4 py-3"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
          <span className="text-[13px] text-amber-100">{error}</span>
        </div>
      ) : null}

      {notice ? (
        <div className="mb-4 rounded-xl border border-emerald-500/25 bg-emerald-500/[.06] px-4 py-3 text-[13px] text-emerald-200">
          {notice}
        </div>
      ) : null}

      {loadedId !== null ? (
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => {
              setShowAdd((v) => !v);
              setFormError(null);
            }}
            className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-teal-400 to-emerald-500 px-4 py-2 text-[13px] font-bold text-slate-950 transition-all hover:-translate-y-0.5 hover:brightness-110"
          >
            <Plus className="h-4 w-4" strokeWidth={2.5} />
            Tambah Cabang
          </button>
        </div>
      ) : null}

      {showAdd ? (
        <div className="iot2-panel mb-5">
          <label className="mb-1.5 block text-[12.5px] font-semibold text-slate-400">
            Tenant ID
          </label>
          <input
            value={tenantId}
            onChange={(event) => setTenantId(event.target.value.trim())}
            maxLength={36}
            placeholder="44444444-4444-4444-8444-444444444444"
            className="w-full rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2 font-mono text-[13px] text-slate-100 outline-none focus:border-teal-400"
          />
          <label className="mb-1.5 mt-3 block text-[12.5px] font-semibold text-slate-400">
            Label cabang
          </label>
          <input
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            maxLength={64}
            placeholder="contoh: Gudang Yogyakarta"
            className="w-full rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2 text-[13.5px] text-slate-100 outline-none focus:border-teal-400"
          />

          {formError ? (
            <p role="alert" className="mb-0 mt-2 text-[12px] text-red-300">
              {formError}
            </p>
          ) : null}

          <div className="mt-4 flex items-center gap-2">
            <button
              type="button"
              onClick={() => void addBranch()}
              disabled={busy === 'add'}
              className="rounded-lg bg-teal-400 px-4 py-2 text-[13px] font-bold text-slate-950 transition-colors hover:bg-teal-300 disabled:opacity-50"
            >
              {busy === 'add' ? 'Menambah…' : 'Tambah'}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowAdd(false);
                setFormError(null);
              }}
              className="text-[12.5px] font-medium text-slate-400 hover:text-slate-200"
            >
              Batal
            </button>
          </div>
        </div>
      ) : null}

      {branches === null ? (
        loadedId !== null ? (
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={Building2}
            title="Masukkan ID organisasi"
            description="Organisasi mengelompokkan beberapa tenant. Hanya pemilik dan anggota tenant di dalam grup yang dapat melihat dan menambah cabangnya."
          />
        )
      ) : branches.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="Organisasi ini belum punya cabang"
          description="Tambahkan tenant sebagai cabang agar grup ini dapat bekerja lintas lokasi."
        />
      ) : (
        <FadeIn>
          <div className="space-y-2.5">
            {branches.map((branch) => (
              <div
                key={branch.id}
                className="iot2-panel flex flex-wrap items-center gap-4"
                style={{ padding: '16px 20px' }}
              >
                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-teal-500/15">
                  <Building2 className="h-5 w-5 text-teal-300" strokeWidth={1.9} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[15px] font-bold text-slate-100">
                    {branch.label}
                  </div>
                  <div className="mt-0.5 font-mono text-[12px] text-slate-500">
                    {branch.tenantId}
                  </div>
                </div>
                {branch.isPrimary ? (
                  <span className="inline-flex items-center rounded-full bg-teal-500/10 px-2.5 py-1 text-[11px] font-semibold text-teal-300 ring-1 ring-inset ring-teal-500/25">
                    UTAMA
                  </span>
                ) : null}
                <span className="text-[11.5px] text-slate-500">
                  {new Date(branch.createdAt).toLocaleDateString('id-ID')}
                </span>
              </div>
            ))}
          </div>
        </FadeIn>
      )}

      {busy === 'add' ? (
        <p className="mt-3 flex items-center gap-2 text-[12.5px] text-slate-400">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Menyimpan…
        </p>
      ) : null}
    </TenantShell>
  );
}

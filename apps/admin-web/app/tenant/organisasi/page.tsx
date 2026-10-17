'use client';

/**
 * Tenant Organization membership — read-only by design.
 *
 * Organization creation and branch expansion are platform-owned operations from `/super/tenants`.
 * This page resolves the active tenant's organization server-side; no organization UUID or tenant
 * UUID is accepted from the browser, so there is no cross-tenant lookup parameter to misuse.
 */

import { useCallback, useEffect, useState } from 'react';
import { TenantShell } from '@/components/tenant-shell';
import { EmptyState, FadeIn, SkeletonCard } from '@/components/ui-polish';
import { AlertTriangle, Building2, RefreshCw } from 'lucide-react';

interface BranchRow {
  id: string;
  tenantId: string;
  tenantName?: string | null;
  label: string;
  isPrimary: boolean;
  createdAt: string;
}

interface OrganizationRow {
  id: string;
  name: string;
  createdAt: string;
  branches: BranchRow[];
}

export default function TenantOrganizationsPage() {
  const [organization, setOrganization] = useState<OrganizationRow | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true);
    setError(null);
    try {
      const response = await fetch('/api/admin/organizations/current', { cache: 'no-store' });
      if (!response.ok) {
        throw new Error(`Gagal memuat organisasi (backend ${response.status}).`);
      }
      const body = (await response.json().catch(() => { throw new Error('Backend mengembalikan respons yang tidak dapat dibaca.'); })) as { organization?: OrganizationRow | null };
      setOrganization(body.organization ?? null);
    } catch (cause) {
      setOrganization(undefined);
      setError(cause instanceof Error ? cause.message : 'Gagal memuat organisasi tenant.');
    } finally {
      if (manual) setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <TenantShell
      title="Organisasi"
      subtitle="Keanggotaan organisasi dan cabang tenant aktif"
      active="/tenant/organisasi"
    >
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <p className="m-0 max-w-3xl text-[12.5px] leading-relaxed text-slate-400">
          Organisasi dibuat dan diperluas oleh admin platform dari Super Admin. Halaman tenant ini
          hanya membaca organisasi yang berisi tenant aktif; tidak menerima ID tenant atau ID
          organisasi dari browser.
        </p>
        <button
          type="button"
          onClick={() => void load(true)}
          disabled={refreshing}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2 text-[12.5px] font-semibold text-slate-200 hover:border-teal-500/50 disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          Muat ulang
        </button>
      </div>

      {error ? (
        <div
          role="alert"
          className="mb-4 flex items-start gap-2.5 rounded-xl border border-red-500/25 bg-red-500/[.06] px-4 py-3"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
          <span className="text-[13px] text-red-100">{error}</span>
        </div>
      ) : null}

      {organization === undefined ? (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : organization === null ? (
        <EmptyState
          icon={Building2}
          title="Tenant ini belum tergabung dalam organisasi"
          description="Admin platform dapat membuat organisasi atau menambahkan tenant ini sebagai cabang dari Super Admin → Tenants."
        />
      ) : (
        <FadeIn>
          <div className="iot2-panel mb-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wider text-teal-400">Organisasi</div>
                <h2 className="mb-0 mt-1 text-xl font-bold text-slate-100">{organization.name}</h2>
                <div className="mt-1 font-mono text-[11.5px] text-slate-500">{organization.id}</div>
              </div>
              <span className="rounded-full bg-slate-800 px-3 py-1 text-[11.5px] font-semibold text-slate-300">
                {organization.branches.length} cabang
              </span>
            </div>
          </div>

          {organization.branches.length === 0 ? (
            <EmptyState
              icon={Building2}
              title="Organisasi belum punya cabang"
              description="State ini tidak normal untuk organisasi baru; admin platform perlu memeriksa lifecycle organisasi."
            />
          ) : (
            <div className="space-y-2.5">
              {organization.branches.map((branch) => (
                <div
                  key={branch.id}
                  className="iot2-panel flex flex-wrap items-center gap-4"
                  style={{ padding: '16px 20px' }}
                >
                  <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-teal-500/15">
                    <Building2 className="h-5 w-5 text-teal-300" strokeWidth={1.9} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[15px] font-bold text-slate-100">{branch.label}</div>
                    <div className="mt-0.5 text-[12px] text-slate-400">
                      {branch.tenantName ?? 'Nama tenant tidak tersedia'}
                    </div>
                    <div className="mt-0.5 font-mono text-[11px] text-slate-600">{branch.tenantId}</div>
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
          )}
        </FadeIn>
      )}
    </TenantShell>
  );
}

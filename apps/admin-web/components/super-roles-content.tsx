'use client';

/**
 * Super Admin "Roles & Permissions" — the role model, read from the enforcement layer.
 *
 * This page previously rendered a hard-coded `ROLE_META` table claiming ADMIN holds
 * `dashboard:*, device:*, scene:*, automation:*, schedule:*`. None of those strings appear
 * anywhere in the API: the only permissions the guard checks are the ones passed to
 * `@RequirePermission`, and ADMIN/PLATFORM_ADMIN are short-circuited to allowed=true rather
 * than holding per-domain grants. That was a fabricated contract on a live product surface.
 *
 * Everything shown now comes from `GET /admin/platform-rbac/*`. If the backend cannot be
 * read the page says so — it never falls back to a remembered table, because a fallback
 * table is precisely the failure being removed.
 */

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, RefreshCw, ShieldCheck, Users } from 'lucide-react';
import { FadeIn } from '@/components/ui-polish';

interface PermissionEntry {
  permission: string;
  resourceType: string;
  description: string;
}

interface CatalogPayload {
  permissions: PermissionEntry[];
  baseRoleModel: { ADMIN: string; PLATFORM_ADMIN: string; MEMBER: string };
  enforcementContract: {
    decorator: string;
    unenforcedRouteBehaviour: string;
    wildcardRoles: string[];
    customRoleWildcard: string;
  };
}

interface RoleRow {
  id: string;
  tenantId: string;
  tenantName: string;
  name: string;
  permissions: string[];
  unknownPermissions: string[];
  enforceablePermissions: string[];
  grantsWildcard: boolean;
  memberCount: number;
  memberPreview: Array<{ membershipId: string; email: string }>;
  createdAt: string;
}

interface RoleListPayload {
  total: number;
  bounded: boolean;
  items: RoleRow[];
}

interface AuditRow {
  id: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
  allowed: boolean;
  detail: string | null;
  createdAt: string;
}

interface UserRow {
  id: string;
  role?: string;
}


// The role list is read from the backend's `baseRoleModel`, not hard-coded here. Pinning the
// three names here meant an added base role would never appear, and the page would silently
// under-report the model the API actually enforces. ROLE_TONE stays local because colour is
// presentation, and it degrades to a neutral tone for an unrecognised role.
const ROLE_TONE: Record<string, string> = {
  ADMIN: 'bg-emerald-500/10 text-emerald-400 ring-emerald-500/25',
  PLATFORM_ADMIN: 'bg-teal-500/10 text-teal-300 ring-teal-500/25',
  MEMBER: 'bg-sky-500/10 text-sky-400 ring-sky-500/25',
};
const NEUTRAL_ROLE_TONE = 'bg-slate-700/40 text-slate-300 ring-slate-600/30';

export default function SuperRolesContent() {
  const [catalog, setCatalog] = useState<CatalogPayload | null>(null);
  const [roles, setRoles] = useState<RoleListPayload | null>(null);
  const [audit, setAudit] = useState<AuditRow[] | null>(null);
  const [users, setUsers] = useState<UserRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const [catalogRes, rolesRes, auditRes, usersRes] = await Promise.all([
        fetch('/api/super/rbac/permission-catalog', { cache: 'no-store' }),
        fetch('/api/super/rbac/custom-roles', { cache: 'no-store' }),
        fetch('/api/super/rbac/audit?limit=25', { cache: 'no-store' }),
        fetch('/api/super/platform-users', { cache: 'no-store' }),
      ]);

      if (!catalogRes.ok) {
        throw new Error(`katalog permission ${catalogRes.status}`);
      }
      setCatalog((await catalogRes.json().catch(() => { throw new Error('Backend mengembalikan respons yang tidak dapat dibaca.'); })) as CatalogPayload);

      setRoles(
        rolesRes.ok
          ? ((await rolesRes.json().catch(() => { throw new Error('Backend mengembalikan respons yang tidak dapat dibaca.'); })) as RoleListPayload)
          : null,
      );

      if (auditRes.ok) {
        const payload = (await auditRes.json().catch(() => { throw new Error('Backend mengembalikan respons yang tidak dapat dibaca.'); })) as { items?: AuditRow[] };
        setAudit(payload.items ?? []);
      } else {
        setAudit(null);
      }

      if (usersRes.ok) {
        const payload = (await usersRes.json().catch(() => { throw new Error('Backend mengembalikan respons yang tidak dapat dibaca.'); })) as { items?: UserRow[] };
        setUsers(Array.isArray(payload.items) ? payload.items : []);
      } else {
        setUsers(null);
      }
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'gagal memuat data RBAC',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) {
    return (
      <div
        role="alert"
        className="flex items-start gap-3 rounded-2xl border border-red-500/25 bg-red-500/[.06] px-5 py-4"
      >
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
        <div>
          <p className="m-0 text-[13px] font-semibold text-red-200">
            Data RBAC tidak dapat dimuat ({error})
          </p>
          <p className="mb-0 mt-1 text-[12px] leading-relaxed text-red-300/70">
            Halaman ini sengaja tidak menampilkan tabel permission dari ingatan. Klaim about
            hak akses hanya boleh dibaca dari lapisan enforcement backend; tanpa data itu,
            tidak ada yang ditampilkan.
          </p>
        </div>
      </div>
    );
  }

  if (!catalog) {
    return (
      <div className="space-y-3">
        {[0, 1, 2].map((index) => (
          <div
            key={index}
            className="h-24 animate-pulse rounded-2xl bg-slate-800/50"
          />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-7">
      <div className="flex items-center justify-between gap-3">
        <p className="m-0 text-[12.5px] text-slate-400">
          {users === null
            ? 'Direktori pengguna tidak dapat dimuat.'
            : `${users.length} pengguna terdaftar di platform`}{' '}
          · peran ditegakkan oleh guard backend, bukan oleh UI.
        </p>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-1.5 text-[11.5px] font-bold text-teal-400 transition-colors hover:text-teal-300 disabled:opacity-50"
        >
          <RefreshCw className="h-3.5 w-3.5" strokeWidth={2.2} />
          {loading ? 'Memuat…' : 'Muat ulang'}
        </button>
      </div>

      <FadeIn>
        <section>
          <h3 className="m-0 text-[16px] font-bold text-white">
            Permission yang ditegakkan API
          </h3>
          <p className="mb-4 mt-1 text-[12.5px] leading-relaxed text-slate-400">
            Himpunan lengkap string yang diperiksa{' '}
            <code className="text-teal-300">
              {catalog.enforcementContract.decorator}
            </code>
            . {catalog.enforcementContract.unenforcedRouteBehaviour}
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-[12.5px]">
              <thead className="border-b border-slate-800 text-[10.5px] uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="py-2 pr-4">Permission</th>
                  <th className="pr-4">Resource</th>
                  <th>Mengizinkan</th>
                </tr>
              </thead>
              <tbody>
                {catalog.permissions.map((entry) => (
                  <tr key={entry.permission} className="border-b border-slate-800/60">
                    <td className="py-3 pr-4">
                      <code className="font-mono text-[12px] text-teal-300">
                        {entry.permission}
                      </code>
                    </td>
                    <td className="pr-4 text-slate-400">{entry.resourceType}</td>
                    <td className="text-slate-300">{entry.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </FadeIn>

      <FadeIn delay={60}>
        <section>
          <h3 className="m-0 text-[16px] font-bold text-white">Peran dasar</h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            {Object.entries(catalog.baseRoleModel).map(([role, description]) => (
              <div
                key={role}
                className="rounded-2xl border border-slate-800/80 bg-[#111c2e] p-4"
              >
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`rounded-full px-2.5 py-1 text-[11px] font-bold ring-1 ring-inset ${ROLE_TONE[role] ?? NEUTRAL_ROLE_TONE}`}
                  >
                    {role}
                  </span>
                  <span className="text-[16px] font-extrabold text-slate-100">
                    {users === null
                      ? '—'
                      : users.filter(
                          (user) =>
                            (user.role ?? 'MEMBER').toUpperCase() === role,
                        ).length}
                  </span>
                </div>
                <p className="mb-0 mt-2.5 text-[12px] leading-relaxed text-slate-400">
                  {description}
                </p>
              </div>
            ))}
          </div>
        </section>
      </FadeIn>

      <FadeIn delay={120}>
        <section>
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="m-0 text-[16px] font-bold text-white">Custom Role</h3>
            <span className="text-[11.5px] text-slate-500">
              {roles ? `${roles.total} role` : 'tidak dapat dimuat'}
            </span>
          </div>
          {roles === null ? (
            <p className="rounded-xl border border-red-500/25 bg-red-500/[.06] px-4 py-3 text-[12.5px] text-red-300">
              Daftar custom role tidak dapat dimuat. Ini bukan berarti tidak ada custom role.
            </p>
          ) : roles.items.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-700 px-4 py-6 text-center text-[12.5px] text-slate-500">
              Belum ada custom role. Admin dan Platform Admin sudah wildcard; custom role
              hanya dibutuhkan untuk memberi MEMBER permission administratif.
            </p>
          ) : (
            <div className="space-y-3">
              {roles.items.map((role) => (
                <div
                  key={role.id}
                  className="rounded-2xl border border-slate-800/80 bg-[#111c2e] p-4"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[14px] font-bold text-white">
                      {role.name}
                    </span>
                    <span className="text-[11.5px] text-slate-500">
                      {role.tenantName}
                    </span>
                    {role.grantsWildcard ? (
                      <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10.5px] font-bold text-amber-400 ring-1 ring-inset ring-amber-500/25">
                        wildcard {catalog.enforcementContract.customRoleWildcard}
                      </span>
                    ) : null}
                    <span className="ml-auto flex items-center gap-1 text-[11.5px] text-slate-500">
                      <Users className="h-3.5 w-3.5" strokeWidth={2} />
                      {role.memberCount} pemegang
                    </span>
                  </div>
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {role.permissions.length === 0 ? (
                      <span className="text-[11.5px] text-slate-500">
                        tidak ada permission tersimpan
                      </span>
                    ) : (
                      role.permissions.map((permission) => (
                        <code
                          key={permission}
                          className={`rounded px-1.5 py-0.5 font-mono text-[11px] ${
                            permission === '*' ||
                            role.enforceablePermissions.includes(permission)
                              ? 'bg-teal-500/10 text-teal-300'
                              : 'bg-red-500/10 text-red-300'
                          }`}
                        >
                          {permission}
                        </code>
                      ))
                    )}
                  </div>
                  {role.unknownPermissions.length > 0 ? (
                    <p className="mt-2.5 flex items-start gap-1.5 text-[11.5px] leading-relaxed text-red-300/90">
                      <AlertTriangle
                        className="mt-0.5 h-3.5 w-3.5 shrink-0"
                        strokeWidth={2}
                      />
                      {role.unknownPermissions.length} permission tidak dikenal dan tidak
                      akan pernah diizinkan oleh guard:{' '}
                      {role.unknownPermissions.join(', ')}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </section>
      </FadeIn>

      <FadeIn delay={180}>
        <section>
          <div className="mb-3 flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-slate-400" strokeWidth={2} />
            <h3 className="m-0 text-[16px] font-bold text-white">
              Audit keputusan RBAC
            </h3>
          </div>
          {audit === null ? (
            <p className="rounded-xl border border-red-500/25 bg-red-500/[.06] px-4 py-3 text-[12.5px] text-red-300">
              Audit RBAC tidak dapat dimuat.
            </p>
          ) : audit.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-700 px-4 py-6 text-center text-[12.5px] text-slate-500">
              Belum ada keputusan RBAC tercatat.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-[12px]">
                <thead className="border-b border-slate-800 text-[10.5px] uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="py-2 pr-3">Hasil</th>
                    <th className="pr-3">Aksi</th>
                    <th className="pr-3">Resource</th>
                    <th className="pr-3">Detail</th>
                    <th>Waktu</th>
                  </tr>
                </thead>
                <tbody>
                  {audit.map((row) => (
                    <tr key={row.id} className="border-b border-slate-800/60">
                      <td className="py-2.5 pr-3">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10.5px] font-bold ${
                            row.allowed
                              ? 'bg-emerald-500/10 text-emerald-400'
                              : 'bg-red-500/10 text-red-400'
                          }`}
                        >
                          {row.allowed ? 'DIIZINKAN' : 'DITOLAK'}
                        </span>
                      </td>
                      <td className="pr-3 text-slate-400">{row.action}</td>
                      <td className="pr-3 text-slate-400">
                        {row.resourceType}
                      </td>
                      <td className="pr-3 font-mono text-[11px] text-slate-500">
                        {row.detail ?? '—'}
                      </td>
                      <td className="text-slate-500">
                        {new Date(row.createdAt).toLocaleString('id-ID')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-3 text-[11.5px] leading-relaxed text-slate-500">
            Penolakan selalu dicatat; allowance hanya dicatat bila pemanggil mengaktifkan
            auditAllows. Daftar kosong berarti tidak ada evaluasi yang tercatat — bukan
            berarti tidak ada yang diizinkan.
          </p>
        </section>
      </FadeIn>
    </div>
  );
}

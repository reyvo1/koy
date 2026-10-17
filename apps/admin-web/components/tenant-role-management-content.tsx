'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ShieldCheck, Trash2, UserPlus, X } from 'lucide-react';

interface PermissionDefinition {
  permission: string;
  resourceType: string;
  description: string;
}

interface RoleMember {
  membershipId: string;
  email: string;
  name?: string | null;
}

interface RoleRow {
  id: string;
  name: string;
  permissions: string[];
  memberCount: number;
  members: RoleMember[];
  assignmentsBounded?: boolean;
}

interface TenantUserRow {
  id: string;
  membershipId?: string | null;
  name?: string | null;
  email?: string;
  role?: string;
  status?: string;
}

const inputClass =
  'w-full rounded-xl border border-slate-700/70 bg-slate-900/60 px-3.5 py-2.5 text-[13px] text-slate-200 outline-none focus:border-teal-500';

export default function TenantRoleManagementContent() {
  const [roles, setRoles] = useState<RoleRow[] | null>(null);
  const [permissions, setPermissions] = useState<PermissionDefinition[] | null>(null);
  const [users, setUsers] = useState<TenantUserRow[] | null>(null);
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const [rolesRes, catalogRes, usersRes] = await Promise.all([
      fetch('/api/admin/roles', { cache: 'no-store' }),
      fetch('/api/admin/roles/catalog', { cache: 'no-store' }),
      fetch('/api/admin/tenant-users', { cache: 'no-store' }),
    ]);
    if (!rolesRes.ok) throw new Error(`custom role backend ${rolesRes.status}`);
    if (!catalogRes.ok) throw new Error(`permission catalog backend ${catalogRes.status}`);
    if (!usersRes.ok) throw new Error(`tenant users backend ${usersRes.status}`);
    const rolesBody = (await rolesRes.json().catch(() => { throw new Error('Backend mengembalikan respons yang tidak dapat dibaca.'); })) as { items?: RoleRow[] };
    const catalogBody = (await catalogRes.json().catch(() => { throw new Error('Backend mengembalikan respons yang tidak dapat dibaca.'); })) as { permissions?: PermissionDefinition[] };
    const usersBody = (await usersRes.json().catch(() => { throw new Error('Backend mengembalikan respons yang tidak dapat dibaca.'); })) as { items?: TenantUserRow[] };
    setRoles(Array.isArray(rolesBody.items) ? rolesBody.items : []);
    setPermissions(Array.isArray(catalogBody.permissions) ? catalogBody.permissions : []);
    setUsers(Array.isArray(usersBody.items) ? usersBody.items : []);
  }, []);

  useEffect(() => {
    void load().catch((cause: unknown) => {
      setError(cause instanceof Error ? cause.message : 'gagal memuat custom role');
    });
  }, [load]);

  const activeMembers = useMemo(
    () =>
      (users ?? []).filter(
        (user) =>
          user.status !== 'REVOKED' &&
          user.role === 'MEMBER' &&
          typeof user.membershipId === 'string',
      ),
    [users],
  );

  const createRole = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy('create');
    setError(null);
    setNotice(null);
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch('/api/admin/roles', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: String(form.get('name') ?? '').trim(),
          permissions: selectedPermissions,
        }),
      });
      const body = (await response.json().catch(() => null)) as
        | { name?: string; message?: string; error?: { message?: string } }
        | null;
      if (!response.ok) {
        throw new Error(body?.error?.message ?? body?.message ?? `Gagal (${response.status})`);
      }
      setNotice(`Role "${body?.name ?? String(form.get('name') ?? '').trim()}" dibuat.`);
      setSelectedPermissions([]);
      event.currentTarget.reset();
      setShowCreate(false);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Gagal membuat role');
    } finally {
      setBusy(null);
    }
  };

  const assign = async (role: RoleRow, membershipId: string) => {
    if (!membershipId) return;
    setBusy(`assign-${role.id}`);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`/api/admin/roles/members/${membershipId}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ roleId: role.id }),
      });
      const body = (await response.json().catch(() => null)) as
        | { message?: string; error?: { message?: string } }
        | null;
      if (!response.ok) throw new Error(body?.error?.message ?? body?.message ?? `Gagal (${response.status})`);
      setNotice(`Role "${role.name}" diberikan.`);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Gagal memberi role');
    } finally {
      setBusy(null);
    }
  };

  const revoke = async (role: RoleRow, member: RoleMember) => {
    setBusy(`revoke-${role.id}-${member.membershipId}`);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(
        `/api/admin/roles/members/${member.membershipId}/${role.id}`,
        { method: 'DELETE' },
      );
      const body = (await response.json().catch(() => null)) as
        | { message?: string; error?: { message?: string } }
        | null;
      if (!response.ok) throw new Error(body?.error?.message ?? body?.message ?? `Gagal (${response.status})`);
      setNotice(`Role "${role.name}" dicabut dari ${member.email}.`);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Gagal mencabut role');
    } finally {
      setBusy(null);
    }
  };

  const removeRole = async (role: RoleRow) => {
    setBusy(`delete-${role.id}`);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`/api/admin/roles/${role.id}`, { method: 'DELETE' });
      const body = (await response.json().catch(() => null)) as
        | { message?: string; error?: { message?: string } }
        | null;
      if (!response.ok) throw new Error(body?.error?.message ?? body?.message ?? `Gagal (${response.status})`);
      setNotice(`Role "${role.name}" dihapus; assignment ikut dicabut.`);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Gagal menghapus role');
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="mt-10 border-t border-slate-800/80 pt-8">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="m-0 text-[17px] font-bold text-slate-100">Custom Role &amp; Permission</h2>
          <p className="mt-1 mb-0 text-[12.5px] text-slate-500">
            MEMBER hanya mendapat permission yang benar-benar ada di catalog backend. ADMIN tetap wildcard sesuai policy engine.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setShowCreate((value) => !value);
            setError(null);
          }}
          disabled={!permissions}
          className="iot-button"
        >
          {showCreate ? 'Tutup' : '+ Buat Custom Role'}
        </button>
      </div>

      {showCreate ? (
        <form onSubmit={createRole} className="iot2-panel mb-5 grid gap-4" style={{ padding: 20 }}>
          <label>
            <span className="mb-1.5 block text-[12px] font-semibold text-slate-400">Nama role *</span>
            <input name="name" required minLength={2} maxLength={60} className={inputClass} placeholder="Operator Dashboard" />
          </label>
          <fieldset>
            <legend className="mb-2 text-[12px] font-semibold text-slate-400">Permission *</legend>
            <div className="grid gap-2 md:grid-cols-2">
              {(permissions ?? []).map((permission) => (
                <label key={permission.permission} className="rounded-xl border border-slate-800/80 bg-slate-950/20 p-3 text-[12px] text-slate-300">
                  <span className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      checked={selectedPermissions.includes(permission.permission)}
                      onChange={() =>
                        setSelectedPermissions((current) =>
                          current.includes(permission.permission)
                            ? current.filter((value) => value !== permission.permission)
                            : [...current, permission.permission],
                        )
                      }
                      className="mt-0.5 h-4 w-4 accent-teal-400"
                    />
                    <span>
                      <code className="text-teal-300">{permission.permission}</code>
                      <span className="mt-1 block text-slate-500">{permission.description}</span>
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <button disabled={busy !== null || selectedPermissions.length === 0} className="iot-button">
            {busy === 'create' ? 'Menyimpan…' : 'Simpan Role'}
          </button>
        </form>
      ) : null}

      {notice ? <p className="mb-4 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-[13px] text-emerald-300">{notice}</p> : null}
      {error ? <p role="alert" className="mb-4 rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-[13px] text-red-400">{error}</p> : null}

      {roles === null ? (
        <div className="h-32 animate-pulse rounded-xl bg-slate-800/60" />
      ) : roles.length === 0 ? (
        <div className="iot2-panel p-8 text-center text-[13px] text-slate-500">Belum ada custom role.</div>
      ) : (
        <div className="space-y-3">
          {roles.map((role) => {
            const assigned = new Set(role.members.map((member) => member.membershipId));
            const available = activeMembers.filter((member) => !assigned.has(member.membershipId!));
            return (
              <article key={role.id} className="iot2-panel" style={{ padding: 18 }}>
                <div className="flex flex-wrap items-start gap-3">
                  <div className="grid h-10 w-10 place-items-center rounded-xl bg-teal-500/10 text-teal-300"><ShieldCheck className="h-5 w-5" /></div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[14.5px] font-bold text-slate-100">{role.name}</div>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {role.permissions.map((permission) => (
                        <code key={permission} className="rounded-md bg-slate-900/70 px-2 py-1 text-[10.5px] text-teal-300">{permission}</code>
                      ))}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void removeRole(role)}
                    disabled={busy !== null}
                    aria-label={`Hapus role ${role.name}`}
                    className="grid h-9 w-9 place-items-center rounded-lg border border-red-500/30 text-red-400 disabled:opacity-50"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                <div className="mt-4 border-t border-slate-800/70 pt-4">
                  <div className="mb-2 text-[11.5px] font-bold uppercase tracking-wide text-slate-500">Assignment ({role.memberCount})</div>
                  <div className="flex flex-wrap gap-2">
                    {role.members.map((member) => (
                      <span key={member.membershipId} className="inline-flex items-center gap-1.5 rounded-full border border-slate-700/70 px-2.5 py-1 text-[11.5px] text-slate-300">
                        {member.email}
                        <button
                          type="button"
                          onClick={() => void revoke(role, member)}
                          disabled={busy !== null}
                          aria-label={`Cabut ${role.name} dari ${member.email}`}
                          className="text-slate-500 hover:text-red-400 disabled:opacity-50"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                    {role.members.length === 0 ? <span className="text-[11.5px] text-slate-500">Belum diberikan ke anggota.</span> : null}
                    {role.assignmentsBounded ? <span className="text-[11.5px] text-amber-400">Daftar assignment dibatasi; gunakan API untuk tenant dengan &gt;200 assignment per role.</span> : null}
                  </div>
                  {available.length > 0 ? (
                    <label className="mt-3 flex flex-wrap items-center gap-2 text-[11.5px] text-slate-500">
                      <UserPlus className="h-4 w-4" />
                      <select
                        defaultValue=""
                        disabled={busy !== null}
                        onChange={(event) => {
                          const membershipId = event.currentTarget.value;
                          event.currentTarget.value = '';
                          void assign(role, membershipId);
                        }}
                        className="rounded-lg border border-slate-700 bg-slate-900/70 px-2.5 py-1.5 text-[12px] text-slate-300"
                      >
                        <option value="" disabled>Berikan role ke anggota…</option>
                        {available.map((member) => (
                          <option key={member.membershipId!} value={member.membershipId!}>
                            {member.name || member.email || member.id}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

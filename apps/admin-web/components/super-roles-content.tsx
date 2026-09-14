'use client';

/**
 * Roles (Modul 20 RBAC) — LIVE: hitungan user per peran dari
 * /api/super/platform-users + matriks permission sesuai guard backend.
 */

import { useCallback, useEffect, useState } from 'react';

interface UserRow {
  id: string;
  role?: string;
  tenantName?: string;
}

const ROLE_META = [
  {
    name: 'MEMBER',
    desc: 'Akses end-user yang dibatasi ownership/share grant',
    perms: 'VIEW: owner/VIEW/CONTROL share · CONTROL: owner/CONTROL share · custom RBAC dapat menambah permission administratif',
    tone: 'bg-sky-500/10 text-sky-400',
  },
  {
    name: 'ADMIN',
    desc: 'Kelola tenant dan anggota',
    perms: 'dashboard:*, device:*, scene:*, automation:*, schedule:*',
    tone: 'bg-emerald-500/10 text-emerald-400',
  },
  {
    name: 'PLATFORM_ADMIN',
    desc: 'Administrasi platform lintas tenant',
    perms: 'platform routes + tenant-admin superset pada konteks tenant yang sah',
    tone: 'bg-teal-500/10 text-teal-300',
  },
];

export default function SuperRolesContent() {
  const [users, setUsers] = useState<UserRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch('/api/super/platform-users')
      .then(async (res) => {
        if (!res.ok) throw new Error(`backend ${res.status}`);
        return res.json();
      })
      .then((data: { items?: UserRow[] }) => {
        setUsers(Array.isArray(data.items) ? data.items : []);
        setError(null);
      })
      .catch((cause: unknown) => {
        setUsers(null);
        setError(cause instanceof Error ? cause.message : 'gagal memuat');
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div>
      {error ? (
        <div role="alert" className="mb-4 rounded-xl border border-red-500/25 bg-red-500/5 px-4 py-3 text-[13px] text-red-300">
          Direktori pengguna tidak dapat dimuat ({error}). Jumlah per role tidak ditampilkan sebagai nol.
        </div>
      ) : (
        <div className="mb-4 text-[13px] text-slate-400">
          {users === null ? 'Memuat direktori pengguna…' : `${users.length} pengguna terdaftar di platform`} — peran ditegakkan oleh
          guard backend dan policy/access service, bukan UI.
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-3">
        {ROLE_META.map((r) => (
          <div
            key={r.name}
            className="rounded-2xl border border-slate-800/80 bg-[#111c2e] p-5 transition-all hover:border-teal-500/40"
          >
            <div className="flex items-center justify-between gap-2">
              <span className={`rounded-full px-3 py-1 text-[12px] font-bold ${r.tone}`}>
                {r.name}
              </span>
              <span className="text-[16px] font-extrabold text-slate-100">
                {users === null ? '—' : users.filter((u) => (u.role ?? 'MEMBER').toUpperCase() === r.name).length}
              </span>
            </div>
            <p className="mt-3 text-[13px] text-slate-400">{r.desc}</p>
            <div className="mt-4 text-[12px] text-slate-500">
              <div className="mb-1.5 font-bold uppercase tracking-widest text-slate-600">
                Permission
              </div>
              <code className="text-[10.5px] leading-relaxed text-slate-500">{r.perms}</code>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
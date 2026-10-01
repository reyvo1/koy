'use client';

/**
 * Tenant user management content — live directory via
 * /api/admin/tenant-users (backend /admin/tenant-users). Fail-closed.
 * Tenant ADMIN can add MEMBER/ADMIN users to their own tenant.
 */

import { useCallback, useEffect, useState } from 'react';
import { UserCircle } from 'lucide-react';
import UserActionsModal, { ManagedUser } from './user-actions-modal';

interface UserRow extends ManagedUser {
  status?: string;
}

const inputStyle = {
  width: '100%',
  borderRadius: 10,
  border: '1px solid var(--iot-border, rgba(148,163,184,.25))',
  background: 'rgba(15,23,42,.6)',
  padding: '10px 12px',
  fontSize: 13.5,
  color: 'var(--iot-text, #e2e8f0)',
  outline: 'none',
} as const;

export default function TenantUsersContent() {
  const [users, setUsers] = useState<UserRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);
  const [selected, setSelected] = useState<ManagedUser | null>(null);

  const loadUsers = useCallback(() => {
    setError(null);
    fetch('/api/admin/tenant-users')
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
  }, [loadUsers]);

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setFormError(null);
    setFormSuccess(null);
    const form = new FormData(event.currentTarget);
    try {
      const res = await fetch('/api/admin/tenant-users', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: String(form.get('email') ?? '').trim(),
          name: String(form.get('name') ?? '').trim() || undefined,
          password: form.get('password'),
          role: form.get('role'),
        }),
      });
      const body = (await res.json()) as { email?: string; error?: { message?: string }; message?: string };
      if (!res.ok) {
        throw new Error(body.error?.message ?? body.message ?? 'Gagal menambah pengguna');
      }
      setFormSuccess(`Pengguna ${body.email ?? ''} berhasil dibuat.`);
      event.currentTarget.reset();
      loadUsers();
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : 'Gagal menambah pengguna');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="m-0 text-[13px]" style={{ color: 'var(--iot-color-muted)' }}>
          {users ? `${users.length} anggota` : 'Memuat…'}
        </p>
        <button
          type="button"
          onClick={() => {
            setShowForm((v) => !v);
            setFormError(null);
            setFormSuccess(null);
          }}
          className="iot-button"
        >
          {showForm ? 'Tutup' : '+ Tambah Pengguna'}
        </button>
      </div>

      {showForm ? (
        <form
          onSubmit={onSubmit}
          className="iot2-panel mb-5 grid gap-4 sm:grid-cols-2"
          style={{ padding: 20 }}
        >
          <label className="block">
            <span className="mb-1.5 block text-[12px] font-semibold" style={{ color: 'var(--iot-color-muted)' }}>Email *</span>
            <input name="email" type="email" required maxLength={320} placeholder="nama@tenant.id" style={inputStyle} />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[12px] font-semibold" style={{ color: 'var(--iot-color-muted)' }}>Nama</span>
            <input name="name" type="text" maxLength={120} placeholder="Nama lengkap" style={inputStyle} />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[12px] font-semibold" style={{ color: 'var(--iot-color-muted)' }}>Peran *</span>
            <select name="role" required defaultValue="MEMBER" style={inputStyle}>
              <option value="MEMBER">MEMBER — akses dasar</option>
              <option value="ADMIN">ADMIN — kelola tenant</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[12px] font-semibold" style={{ color: 'var(--iot-color-muted)' }}>Password * (min. 8)</span>
            <input name="password" type="password" required minLength={8} maxLength={128} style={inputStyle} />
          </label>
          <div className="flex items-end sm:col-span-2">
            <button disabled={busy} className="iot-button w-full">
              {busy ? 'Menyimpan…' : 'Simpan Pengguna'}
            </button>
          </div>
          {formError ? (
            <p role="alert" className="sm:col-span-2 m-0 rounded-xl px-4 py-3 text-[13px]" style={{ border: '1px solid rgba(239,68,68,.3)', background: 'rgba(239,68,68,.08)', color: '#f87171' }}>
              {formError}
            </p>
          ) : null}
          {formSuccess ? (
            <p className="sm:col-span-2 m-0 rounded-xl px-4 py-3 text-[13px]" style={{ border: '1px solid rgba(34,197,94,.3)', background: 'rgba(34,197,94,.08)', color: '#4ade80' }}>
              {formSuccess}
            </p>
          ) : null}
        </form>
      ) : null}

      {error && !users ? (
        <div className="iot2-panel" style={{ padding: 32, textAlign: 'center' }}>
          <p className="m-0 text-[14px] font-semibold">Direktori pengguna tidak tersedia</p>
          <p className="mt-2 mb-0 text-[12.5px]" style={{ color: 'var(--iot-color-muted)' }}>Backend ({error}).</p>
        </div>
      ) : null}

      {users ? (
        <div className="iot2-panel p-0 overflow-hidden">
          <table className="iot2-table">
            <thead>
              <tr>
                <th>NAMA</th>
                <th>EMAIL</th>
                <th>PERAN</th>
                <th>STATUS</th>
                <th>AKSI</th>
              </tr>
            </thead>
            <tbody>
              {users.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', color: 'var(--iot-color-muted)' }}>
                    Belum ada pengguna — tambahkan anggota pertama.
                  </td>
                </tr>
              ) : (
                users.map((m) => (
                  <tr key={m.id}>
                    <td style={{ fontWeight: 700 }}>
                      <span className="mr-2 inline-flex align-middle" style={{ color: 'var(--iot-color-accent)' }}>
                        <UserCircle className="h-4 w-4" strokeWidth={1.9} />
                      </span>
                      {m.name ?? '—'}
                    </td>
                    <td style={{ color: 'var(--iot-color-muted)' }}>{m.email ?? ''}</td>
                    <td><span className="iot2-badge iot2-badge--online">{(m.role ?? 'MEMBER').toUpperCase()}</span></td>
                    <td>
                      <span className="iot2-badge" style={m.status === 'REVOKED' ? { color: '#f87171' } : m.isVerified ? undefined : { color: '#fbbf24' }}>
                        {m.status === 'REVOKED' ? 'NONAKTIF' : m.isVerified ? 'AKTIF' : 'PENDING'}
                      </span>
                    </td>
                    <td>
                      <button
                        type="button"
                        onClick={() => setSelected(m)}
                        className="iot2-badge cursor-pointer"
                        style={{ border: '1px solid rgba(148,163,184,.3)', color: 'var(--iot-text, #e2e8f0)' }}
                      >
                        Kelola
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : null}

      <UserActionsModal
        user={selected}
        scope="tenant"
        onClose={() => setSelected(null)}
        onChanged={() => {
          setSelected(null);
          loadUsers();
        }}
      />
    </div>
  );
}

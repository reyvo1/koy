'use client';

/**
 * Device sharing panel (Module 18) — the tenant operator's surface for handing a device to
 * a member.
 *
 * This is the product half of a chain that already had a working back end. The access path
 * that CONSUMES a grant (`DeviceAccessService`) had been live all along, so a member could
 * send a command as soon as a grant row existed — but nothing produced one, so the only way
 * to hand a device to a user was to write to `device_share_grants` by hand. The controller
 * and BFF routes now close that; this component makes it reachable without a database tool.
 *
 * Fail-closed: every error surfaces, nothing is silently swallowed, and a revoked or expired
 * grant is shown as such rather than as an active share.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Share2, ShieldCheck, Eye, Zap, X, AlertTriangle } from 'lucide-react';
import { createLoadGuard } from '@/lib/safe-fetch';

interface ShareRow {
  id: string;
  grantedToMembershipId: string;
  permission: 'VIEW' | 'CONTROL';
  status: string;
  expiresAt: string;
  revokedAt: string | null;
  createdAt: string;
}

interface MemberOption {
  id: string;
  email: string;
  name?: string | null;
  role: string;
  membershipId: string | null;
}

function expiryState(row: ShareRow): 'active' | 'expired' | 'revoked' {
  if (row.status !== 'ACTIVE') return 'revoked';
  return new Date(row.expiresAt).getTime() <= Date.now() ? 'expired' : 'active';
}

function expiryLabel(row: ShareRow): string {
  const state = expiryState(row);
  if (state === 'revoked') return row.revokedAt ? `Dicabut ${new Date(row.revokedAt).toLocaleDateString('id-ID')}` : 'Dicabut';
  if (state === 'expired') return `Kedaluwarsa ${new Date(row.expiresAt).toLocaleDateString('id-ID')}`;
  return `Berlaku sampai ${new Date(row.expiresAt).toLocaleDateString('id-ID')}`;
}

export default function DeviceSharePanel({ deviceId }: { deviceId: string }) {
  const [shares, setShares] = useState<ShareRow[] | null>(null);
  const [members, setMembers] = useState<MemberOption[] | null>(null);
  const [membersError, setMembersError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [target, setTarget] = useState('');
  const [permission, setPermission] = useState<'VIEW' | 'CONTROL'>('CONTROL');
  const [days, setDays] = useState('7');

  const loadGuard = useRef(createLoadGuard());
  const load = useCallback(() => {
    const isCurrent = loadGuard.current.begin();
    setError(null);
    fetch(`/api/devices/${deviceId}/shares`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`backend ${res.status}`);
        return res.json().catch(() => { throw new Error('Backend mengembalikan respons yang tidak dapat dibaca.'); });
      })
      .then((data: unknown) => {
        if (!isCurrent()) return;
        const rows = Array.isArray(data)
          ? data
          : ((data as { items?: ShareRow[] }).items ?? []);
        setShares(rows);
      })
      .catch((cause: unknown) => {
        if (!isCurrent()) return;
        setShares([]);
        setError(cause instanceof Error ? cause.message : 'gagal memuat');
      });
  }, [deviceId]);

  useEffect(() => {
    load();
  }, [load]);

  // The directory is tenant-wide, so it is fetched once per panel rather than per device.
  useEffect(() => {
    setMembersError(null);
    fetch('/api/admin/tenant-users')
      .then(async (res) => {
        const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        if (!res.ok) throw new Error(body?.error?.message ?? `backend ${res.status}`);
        if (body === null) throw new Error('Backend mengembalikan respons yang tidak dapat dibaca.');
        return body;
      })
      .then((data: unknown) => {
        const items = (data as { items?: MemberOption[] }).items ?? [];
        setMembers(items.filter((member) => member.membershipId));
      })
      .catch((cause: unknown) => {
        setMembers(null);
        setMembersError(cause instanceof Error ? cause.message : 'gagal memuat direktori anggota');
      });
  }, []);

  const grant = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!target) {
      setFormError('Pilih anggota tim terlebih dahulu.');
      return;
    }
    const expiry = new Date(Date.now() + Number(days) * 86400000);
    if (!Number.isFinite(expiry.getTime())) {
      setFormError('Masa berlaku tidak valid.');
      return;
    }
    setBusy(true);
    setFormError(null);
    try {
      const res = await fetch(`/api/devices/${deviceId}/shares`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          grantedToMembershipId: target,
          permission,
          expiresAt: expiry.toISOString(),
        }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: { message?: string };
      };
      if (!res.ok) {
        throw new Error(body.error?.message ?? 'Gagal membuat berbagi');
      }
      setTarget('');
      load();
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : 'Gagal membuat berbagi');
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (grantId: string) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/devices/${deviceId}/shares/${grantId}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: { message?: string };
        };
        throw new Error(body.error?.message ?? 'Gagal mencabut berbagi');
      }
      load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Gagal mencabut berbagi');
    } finally {
      setBusy(false);
    }
  };

  const shareable = (members ?? []).filter(
    (m) => !shares?.some((s) => s.grantedToMembershipId === m.membershipId && expiryState(s) === 'active'),
  );

  return (
    <section
      className="iot2-panel mb-5"
      style={{ padding: 20 }}
      aria-labelledby="device-share-heading"
    >
      <div className="mb-4 flex items-center gap-2.5">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-teal-500/15">
          <Share2 className="h-4.5 w-4.5 text-teal-300" strokeWidth={1.9} />
        </span>
        <div>
          <h2 id="device-share-heading" className="m-0 text-[14.5px] font-bold text-slate-100">
            Bagikan Perangkat
          </h2>
          <p className="m-0 text-[12px] text-slate-500">
            Anggota tim yang diberi akses dapat melihat dan mengirim perintah ke perangkat ini.
          </p>
        </div>
      </div>

      {membersError ? (
        <p role="alert" className="mb-4 flex items-center gap-2 rounded-lg border border-red-500/25 bg-red-500/10 px-4 py-3 text-[12px] text-red-300">
          <AlertTriangle className="h-4 w-4 shrink-0" /> Direktori anggota tidak tersedia: {membersError}. Pemberian akses dinonaktifkan sampai direktori pulih.
        </p>
      ) : null}

      <form onSubmit={grant} className="mb-4 grid gap-3 sm:grid-cols-[1fr_auto_auto_auto]">
        <label className="block">
          <span className="sr-only">Anggota tim</span>
          <select
            value={target}
            disabled={members === null}
            onChange={(e) => setTarget(e.target.value)}
            className="w-full rounded-xl border border-slate-700/70 bg-slate-900/60 px-3.5 py-2.5 text-[13.5px] text-slate-200 outline-none focus:border-teal-500"
          >
            <option value="">Pilih anggota tim…</option>
            {shareable.map((m) => (
              <option key={m.membershipId} value={m.membershipId ?? ''}>
                {m.name || m.email} · {m.role}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="sr-only">Izin</span>
          <select
            value={permission}
            onChange={(e) => setPermission(e.target.value as 'VIEW' | 'CONTROL')}
            className="rounded-xl border border-slate-700/70 bg-slate-900/60 px-3.5 py-2.5 text-[13.5px] text-slate-200 outline-none focus:border-teal-500"
          >
            <option value="VIEW">Lihat saja</option>
            <option value="CONTROL">Lihat + kontrol</option>
          </select>
        </label>
        <label className="block">
          <span className="sr-only">Masa berlaku (hari)</span>
          <input
            value={days}
            onChange={(e) => setDays(e.target.value.replace(/[^0-9]/g, ''))}
            inputMode="numeric"
            placeholder="Hari"
            title="Masa berlaku dalam hari (maks 90)"
            className="w-24 rounded-xl border border-slate-700/70 bg-slate-900/60 px-3.5 py-2.5 text-[13.5px] text-slate-200 outline-none placeholder:text-slate-500 focus:border-teal-500"
          />
        </label>
        <button disabled={busy || members === null || shareable.length === 0} className="iot-button">
          {busy ? 'Memproses…' : 'Bagikan'}
        </button>
        {formError ? (
          <p
            role="alert"
            className="m-0 rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-[13px] text-red-400 sm:col-span-4"
          >
            {formError}
          </p>
        ) : null}
      </form>

      {error ? (
        <p
          role="alert"
          className="m-0 flex items-center gap-2 rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-[13px] text-amber-300"
        >
          <AlertTriangle className="h-4 w-4 shrink-0" strokeWidth={2} />
          {error}
        </p>
      ) : shares === null ? (
        <p className="m-0 text-[13px] text-slate-500">Memuat daftar berbagi…</p>
      ) : shares.length === 0 ? (
        <p className="m-0 text-[13px] text-slate-500">
          Belum ada anggota tim yang diberi akses ke perangkat ini.
        </p>
      ) : (
        <ul className="m-0 grid list-none gap-2 p-0">
          {shares.map((s) => {
            const state = expiryState(s);
            const member = members?.find((m) => m.membershipId === s.grantedToMembershipId);
            const Icon = s.permission === 'CONTROL' ? Zap : Eye;
            return (
              <li
                key={s.id}
                className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-800/80 bg-[#111c2e] px-4 py-3"
              >
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-teal-500/15">
                  <Icon className="h-4 w-4 text-teal-300" strokeWidth={2} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13.5px] font-semibold text-slate-100">
                    {member?.name || member?.email || s.grantedToMembershipId.slice(0, 8)}
                  </div>
                  <div className="text-[11.5px] text-slate-500">
                    {s.permission === 'CONTROL' ? 'Lihat + kontrol' : 'Lihat saja'} · {expiryLabel(s)}
                  </div>
                </div>
                {state === 'active' ? (
                  <span className="flex items-center gap-1.5 text-[11.5px] font-semibold text-teal-300">
                    <ShieldCheck className="h-3.5 w-3.5" strokeWidth={2} /> Aktif
                  </span>
                ) : (
                  <span className="text-[11.5px] font-semibold text-slate-500">
                    {state === 'expired' ? 'Kedaluwarsa' : 'Dicabut'}
                  </span>
                )}
                {state === 'active' ? (
                  <button
                    type="button"
                    onClick={() => void revoke(s.id)}
                    disabled={busy}
                    className="flex items-center gap-1.5 rounded-lg border border-red-500/30 px-3 py-1.5 text-[12px] font-semibold text-red-400 transition-colors hover:bg-red-500/10 disabled:opacity-50"
                  >
                    <X className="h-3.5 w-3.5" strokeWidth={2.2} /> Cabut
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

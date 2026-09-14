'use client';

import { useEffect, useMemo, useState } from 'react';

interface CredentialRow {
  deviceId: string;
  deviceName: string;
  deviceType: string;
  deviceStatus: string;
  tenantName: string;
  credentialId: string | null;
  credentialPresent: boolean;
  createdAt: string | null;
  rotatedAt: string | null;
}

export default function SuperDeviceCredentialsContent() {
  const [rows, setRows] = useState<CredentialRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetch('/api/super/device-credentials')
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body?.error?.message ?? `backend ${response.status}`);
        return body;
      })
      .then((body: { items?: CredentialRow[]; secretMaterialExposed?: boolean }) => {
        if (body.secretMaterialExposed === true) throw new Error('backend mencoba mengekspos secret material');
        setRows(Array.isArray(body.items) ? body.items : []);
      })
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'gagal memuat'));
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const base = rows ?? [];
    if (!q) return base;
    return base.filter((row) =>
      `${row.deviceName} ${row.deviceId} ${row.tenantName} ${row.deviceType} ${row.deviceStatus}`
        .toLowerCase()
        .includes(q),
    );
  }, [rows, search]);

  if (error && !rows) return <StateBox title="Metadata credential tidak tersedia" detail={error} />;
  if (!rows) return <div className="h-48 animate-pulse rounded-xl bg-slate-800/60" />;

  return (
    <div>
      <div className="mb-4 rounded-xl border border-emerald-500/20 bg-emerald-500/[.05] px-4 py-3 text-[12.5px] leading-relaxed text-emerald-200">
        Hanya metadata credential yang ditampilkan. <strong>Password hash, secret, dan token pairing tidak pernah dikirim ke UI.</strong>
      </div>
      <input
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Cari perangkat, tenant, tipe, atau status…"
        className="mb-4 w-full rounded-xl border border-slate-700/70 bg-slate-900/60 px-4 py-2.5 text-[13.5px] text-slate-200 outline-none placeholder:text-slate-500 focus:border-teal-500"
      />
      {filtered.length === 0 ? (
        <StateBox title={search ? 'Tidak ada hasil' : 'Belum ada perangkat dengan credential aktif'} />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-800/80">
          <table className="min-w-full text-left text-[12.5px]">
            <thead className="bg-slate-900/70 text-[10.5px] uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Perangkat</th><th className="px-4 py-3">Tenant</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Dibuat</th><th className="px-4 py-3">Rotasi / Update</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr key={row.deviceId} className="border-t border-slate-800/70 text-slate-300">
                  <td className="px-4 py-3"><div className="font-semibold text-white">{row.deviceName}</div><code className="text-[10.5px] text-slate-600">{row.deviceId}</code></td>
                  <td className="px-4 py-3">{row.tenantName}</td>
                  <td className="px-4 py-3"><span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-[10.5px] font-bold text-emerald-300">CREDENTIAL PRESENT</span><div className="mt-1 text-[10.5px] text-slate-600">{row.deviceStatus} · {row.deviceType}</div></td>
                  <td className="px-4 py-3 text-slate-500">{formatDate(row.createdAt)}</td>
                  <td className="px-4 py-3 text-slate-500">{formatDate(row.rotatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleString('id-ID') : '—';
}
function StateBox({ title, detail }: { title: string; detail?: string }) {
  return <div className="rounded-xl border border-dashed border-slate-700/70 p-10 text-center"><p className="m-0 text-[15px] font-semibold text-slate-300">{title}</p>{detail ? <p className="mt-2 text-[13px] text-slate-500">Backend ({detail}).</p> : null}</div>;
}

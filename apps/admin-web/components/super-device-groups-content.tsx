'use client';

import { useEffect, useMemo, useState } from 'react';

interface GroupRow {
  id: string;
  tenantId: string;
  tenantName: string;
  name: string;
  description?: string | null;
  memberCount: number;
  memberPreview: Array<{ id: string; name: string; status: string; type: string }>;
  updatedAt: string;
}

export default function SuperDeviceGroupsContent() {
  const [rows, setRows] = useState<GroupRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetch('/api/super/device-groups')
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body?.error?.message ?? `backend ${response.status}`);
        return body;
      })
      .then((body: { items?: GroupRow[] }) => setRows(Array.isArray(body.items) ? body.items : []))
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'gagal memuat'));
  }, []);

  const filtered = useMemo(() => {
    const base = rows ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return base;
    return base.filter((row) =>
      `${row.name} ${row.tenantName} ${row.description ?? ''} ${row.memberPreview.map((item) => item.name).join(' ')}`
        .toLowerCase()
        .includes(q),
    );
  }, [rows, search]);

  if (error && !rows) {
    return <StateBox title="Device Groups tidak tersedia" detail={error} />;
  }
  if (!rows) return <div className="h-48 animate-pulse rounded-xl bg-slate-800/60" />;

  return (
    <div>
      <div className="mb-4 rounded-xl border border-sky-500/20 bg-sky-500/[.05] px-4 py-3 text-[12.5px] leading-relaxed text-sky-200">
        Surface platform ini <strong>read-only</strong>. Grup tetap milik tenant; mutasi anggota/nama dilakukan melalui konsol tenant agar batas tenant tidak berubah diam-diam.
      </div>
      <input
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Cari grup, tenant, deskripsi, atau perangkat…"
        className="mb-4 w-full rounded-xl border border-slate-700/70 bg-slate-900/60 px-4 py-2.5 text-[13.5px] text-slate-200 outline-none placeholder:text-slate-500 focus:border-teal-500"
      />
      {filtered.length === 0 ? (
        <StateBox title={search ? 'Tidak ada hasil' : 'Belum ada device group'} />
      ) : (
        <div className="space-y-3">
          {filtered.map((row) => (
            <article key={row.id} className="rounded-2xl border border-slate-800/80 bg-[#0f1929] p-5">
              <div className="flex flex-wrap items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-[14.5px] font-bold text-white">{row.name}</div>
                  <div className="mt-1 text-[11.5px] text-slate-500">
                    {row.tenantName} · {row.memberCount} anggota · update {new Date(row.updatedAt).toLocaleString('id-ID')}
                  </div>
                  {row.description ? <p className="mb-0 mt-2 text-[12.5px] text-slate-400">{row.description}</p> : null}
                </div>
                <span className="rounded-full bg-teal-500/10 px-3 py-1 text-[11px] font-bold text-teal-300">TENANT-SCOPED</span>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {row.memberPreview.length === 0 ? (
                  <span className="text-[12px] text-slate-600">Belum ada anggota.</span>
                ) : row.memberPreview.map((device) => (
                  <span key={device.id} className="rounded-lg border border-slate-800 bg-slate-900/60 px-2.5 py-1.5 text-[11.5px] text-slate-400">
                    {device.name} · {device.type} · {device.status}
                  </span>
                ))}
                {row.memberCount > row.memberPreview.length ? (
                  <span className="px-2 py-1.5 text-[11.5px] text-slate-500">+{row.memberCount - row.memberPreview.length} lainnya</span>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function StateBox({ title, detail }: { title: string; detail?: string }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-700/70 p-10 text-center">
      <p className="m-0 text-[15px] font-semibold text-slate-300">{title}</p>
      {detail ? <p className="mt-2 text-[13px] text-slate-500">Backend ({detail}).</p> : null}
    </div>
  );
}

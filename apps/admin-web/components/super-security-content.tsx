'use client';

/**
 * Super Admin Security & Audit (blueprint §1) — live merged RBAC + share
 * audit entries via /api/super/audit-logs. Fail-closed, immutable source.
 */

import { useEffect, useState } from 'react';

interface AuditRow {
  id: string;
  source: string;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  allowed: boolean;
  detail?: string | null;
  createdAt: string;
}

export default function SuperSecurityContent() {
  const [rows, setRows] = useState<AuditRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetch('/api/super/audit-logs')
      .then(async (res) => {
        if (!res.ok) throw new Error(`backend ${res.status}`);
        return res.json();
      })
      .then((data: { items?: AuditRow[] }) => {
        if (!cancelled) setRows(Array.isArray(data.items) ? data.items : []);
      })
      .catch((cause: unknown) => {
        if (!cancelled)
          setError(cause instanceof Error ? cause.message : 'gagal memuat');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error && !rows) {
    return (
      <div className="rounded-xl border border-dashed border-slate-700/70 p-10 text-center">
        <p className="m-0 text-[15px] font-semibold text-slate-300">
          Log audit tidak tersedia
        </p>
        <p className="mt-2 text-[13px] text-slate-500">Backend ({error}).</p>
      </div>
    );
  }

  if (!rows) {
    return <div className="h-48 animate-pulse rounded-xl bg-slate-800/60" />;
  }

  const q = search.trim().toLowerCase();
  const filtered = q
    ? rows.filter((row) =>
        `${row.action} ${row.resourceType} ${row.source}`
          .toLowerCase()
          .includes(q),
      )
    : rows;

  if (filtered.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-700/70 p-10 text-center">
        <div className="text-3xl">⛨</div>
        <p className="mt-3 mb-0 text-[15px] font-semibold text-slate-300">
          {q ? 'Tidak ada hasil' : 'Belum ada aktivitas audit'}
        </p>
      </div>
    );
  }

  return (
    <div>
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Cari aksi atau resource…"
        className="mb-4 w-full rounded-xl border border-slate-700/70 bg-slate-900/60 px-4 py-2.5 text-[13.5px] text-slate-200 outline-none placeholder:text-slate-500 focus:border-teal-500"
      />
      <div className="max-h-[520px] space-y-2 overflow-y-auto pr-1">
        {filtered.map((row) => (
          <div
            key={row.id}
            className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-800/70 px-5 py-3"
          >
            <span
              className={`rounded-full px-2.5 py-0.5 text-[10.5px] font-bold ${
                row.source === 'RBAC'
                  ? 'bg-teal-500/10 text-teal-300'
                  : 'bg-indigo-500/10 text-indigo-300'
              }`}
            >
              {row.source}
            </span>
            <code className="text-[12px] font-bold text-slate-200">
              {row.action}
            </code>
            <span className="text-[12px] text-slate-400">
              {row.resourceType}
              {row.resourceId ? ` · ${row.resourceId.slice(0, 8)}…` : ''}
            </span>
            {!row.allowed ? (
              <span className="rounded-full bg-red-500/10 px-2.5 py-0.5 text-[10.5px] font-bold text-red-400">
                DENIED
              </span>
            ) : null}
            <span className="ml-auto text-[11.5px] text-slate-500">
              {new Date(row.createdAt).toLocaleString('id-ID')}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

'use client';

/**
 * Reusable enterprise data-table (UI v4).
 * Generic, bounded, client-side search + pagination over provided rows.
 */

import { useMemo, useState } from 'react';

export interface Column<T> {
  key: string;
  header: string;
  render?: (row: T) => React.ReactNode;
  sortable?: boolean;
}

export function EnterpriseTable<T extends { id?: string }>({
  rows,
  columns,
  searchPlaceholder = 'Cari…',
  pageSize = 10,
  emptyText = 'Tidak ada data.',
}: {
  rows: T[];
  columns: Column<T>[];
  searchPlaceholder?: string;
  pageSize?: number;
  emptyText?: string;
}) {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) =>
      columns.some((col) => {
        const raw =
          col.render !== undefined
            ? String(row[col.key as keyof T] ?? '')
            : String(row[col.key as keyof T] ?? '');
        return raw.toLowerCase().includes(q);
      }),
    );
  }, [rows, search, columns]);

  const pageCount = Math.max(Math.ceil(filtered.length / pageSize), 1);
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = filtered.slice(
    safePage * pageSize,
    safePage * pageSize + pageSize,
  );

  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(0);
          }}
          placeholder={` ${searchPlaceholder}`}
          className="min-w-[220px] flex-1 rounded-xl border border-slate-700 bg-slate-900/70 px-4 py-2.5 text-sm text-slate-200 outline-none transition-all placeholder-slate-500 focus:border-teal-500/50 focus:shadow-[0_0_0_3px_rgba(45,212,191,.12)]"
        />
        <span className="text-[12.5px] text-slate-500">
          {filtered.length} entri
        </span>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-800/80">
        <table className="w-full text-left text-[13.5px]">
          <thead>
            <tr className="border-b border-slate-800 text-[11px] uppercase tracking-wider text-slate-500">
              {columns.map((c) => (
                <th key={c.key} className="px-4 py-3 font-bold">
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageRows.map((row, i) => (
              <tr
                key={row.id ?? i}
                className="border-b border-slate-800/50 transition-colors last:border-0 hover:bg-white/[.03]"
              >
                {columns.map((c) => (
                  <td key={c.key} className="px-4 py-3">
                    {c.render ? c.render(row) : String(row[c.key as keyof T] ?? '—')}
                  </td>
                ))}
              </tr>
            ))}
            {pageRows.length === 0 && (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-4 py-10 text-center text-slate-500"
                >
                  {emptyText}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {pageCount > 1 && (
        <div className="mt-4 flex items-center gap-3">
          <button
            disabled={safePage === 0}
            onClick={() => setPage(safePage - 1)}
            className="rounded-lg border border-slate-700 px-3.5 py-1.5 text-[13px] text-slate-300 enabled:hover:bg-slate-800 disabled:opacity-40"
          >
            ‹ Sebelumnya
          </button>
          <span className="text-[12.5px] text-slate-500">
            Halaman {safePage + 1}/{pageCount}
          </span>
          <button
            disabled={safePage >= pageCount - 1}
            onClick={() => setPage(safePage + 1)}
            className="rounded-lg border border-slate-700 px-3.5 py-1.5 text-[13px] text-slate-300 enabled:hover:bg-slate-800 disabled:opacity-40"
          >
            Berikutnya ›
          </button>
        </div>
      )}
    </div>
  );
}

/** Status pill used across enterprise tables. */
export function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    ACTIVE: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25',
    ONLINE: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25',
    HEALTHY: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25',
    PAIRED: 'bg-teal-500/10 text-teal-300 border-teal-500/25',
    PROVISIONING: 'bg-amber-500/10 text-amber-400 border-amber-500/25',
    WARNING: 'bg-amber-500/10 text-amber-400 border-amber-500/25',
    INACTIVE: 'bg-slate-700/40 text-slate-400 border-slate-600/30',
    OFFLINE: 'bg-slate-700/40 text-slate-400 border-slate-600/30',
    REVOKED: 'bg-red-500/10 text-red-400 border-red-500/25',
    CRITICAL: 'bg-red-500/10 text-red-400 border-red-500/25',
    CANCELLED: 'bg-red-500/10 text-red-400 border-red-500/25',
  };
  const cls = map[status.toUpperCase()] ?? 'bg-slate-700/40 text-slate-300 border-slate-600/30';
  return (
    <span className={`inline-block rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${cls}`}>
      {status}
    </span>
  );
}

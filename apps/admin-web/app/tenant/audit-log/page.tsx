'use client';

import { useCallback, useEffect, useState } from 'react';
import { ShieldCheck, RefreshCw, AlertTriangle } from 'lucide-react';
import { TenantShell } from '@/components/tenant-shell';
import { EmptyState, SkeletonCard } from '@/components/ui-polish';

const ACTIONS = ['CREATE', 'READ', 'UPDATE', 'DELETE', 'GRANT', 'REVOKE'] as const;

type AuditAction = (typeof ACTIONS)[number];

interface AuditRow {
  id: string;
  action: AuditAction;
  resourceType: string;
  resourceId?: string | null;
  actorMembershipId: string;
  allowed: boolean;
  detail?: string | null;
  createdAt: string;
}

interface AuditPagePayload {
  items?: AuditRow[];
  nextCursor?: string | null;
}

function when(value: string): string {
  return new Date(value).toLocaleString('id-ID');
}

export default function TenantAuditLogPage() {
  const [rows, setRows] = useState<AuditRow[] | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [action, setAction] = useState('');
  const [resourceType, setResourceType] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const fetchPage = useCallback(
    async (cursor?: string, append = false) => {
      if (append) setLoadingMore(true);
      else setRows(null);
      setError(null);
      try {
        const query = new URLSearchParams({ limit: '50' });
        if (action) query.set('action', action);
        if (resourceType.trim()) query.set('resourceType', resourceType.trim());
        if (cursor) query.set('cursor', cursor);
        const response = await fetch(`/api/tenant/audit-logs?${query.toString()}`, {
          cache: 'no-store',
        });
        if (!response.ok) throw new Error(`backend ${response.status}`);
        const payload = (await response.json()) as AuditPagePayload;
        const items = Array.isArray(payload.items) ? payload.items : [];
        setRows((current) => (append && current ? [...current, ...items] : items));
        setNextCursor(typeof payload.nextCursor === 'string' ? payload.nextCursor : null);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'gagal memuat log audit');
        if (!append) setRows([]);
      } finally {
        setLoadingMore(false);
      }
    },
    [action, resourceType],
  );

  useEffect(() => {
    void fetchPage();
  }, [fetchPage]);

  return (
    <TenantShell
      title="Audit"
      subtitle="Jejak mutasi tenant — siapa mengubah resource apa dan boundary otorisasi yang dipakai"
      active="/tenant/audit-log"
    >
      <div className="mb-4 grid gap-3 md:grid-cols-[180px_minmax(220px,1fr)_auto]">
        <select
          value={action}
          onChange={(event) => setAction(event.target.value)}
          aria-label="Filter aksi audit"
          className="rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2 text-[13px] text-slate-100 outline-none focus:border-teal-400"
        >
          <option value="">Semua aksi</option>
          {ACTIONS.map((value) => (
            <option key={value} value={value}>{value}</option>
          ))}
        </select>
        <input
          value={resourceType}
          onChange={(event) => setResourceType(event.target.value)}
          placeholder="Filter resource type, mis. scene"
          aria-label="Filter tipe resource audit"
          className="rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2 text-[13px] text-slate-100 outline-none placeholder:text-slate-500 focus:border-teal-400"
        />
        <button
          type="button"
          onClick={() => void fetchPage()}
          className="flex items-center justify-center gap-1.5 rounded-lg border border-slate-700 px-3 py-2 text-[12.5px] font-semibold text-slate-300 hover:border-teal-500/50 hover:text-teal-300"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Muat ulang
        </button>
      </div>

      {error ? (
        <div role="alert" className="mb-4 flex items-start gap-2.5 rounded-xl border border-red-500/25 bg-red-500/[.06] px-4 py-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
          <span className="text-[13px] text-red-200">Log audit gagal dimuat ({error}).</span>
        </div>
      ) : null}

      {rows === null ? (
        <div className="grid gap-3 lg:grid-cols-2"><SkeletonCard /><SkeletonCard /></div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={ShieldCheck}
          title="Belum ada aktivitas yang cocok"
          description="Audit hanya berisi mutasi yang benar-benar direkam backend. Ubah filter bila Anda sedang mencari resource lain."
        />
      ) : (
        <div className="space-y-2">
          {rows.map((row) => (
            <article key={row.id} className="rounded-xl border border-slate-800/80 bg-[#111c2e] px-4 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-teal-500/10 px-2.5 py-0.5 text-[10.5px] font-bold text-teal-300">{row.action}</span>
                <code className="text-[12px] font-semibold text-slate-200">{row.resourceType}</code>
                {row.resourceId ? <code className="text-[11px] text-slate-500">{row.resourceId}</code> : null}
                {!row.allowed ? <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-[10.5px] font-bold text-red-400">DENIED</span> : null}
                <span className="ml-auto text-[11.5px] text-slate-500">{when(row.createdAt)}</span>
              </div>
              <div className="mt-2 grid gap-1 text-[11.5px] text-slate-400 md:grid-cols-[220px_1fr]">
                <div>Actor membership: <code className="text-slate-300">{row.actorMembershipId}</code></div>
                <div>{row.detail ?? 'Tidak ada detail tambahan.'}</div>
              </div>
            </article>
          ))}
          {nextCursor ? (
            <button
              type="button"
              disabled={loadingMore}
              onClick={() => void fetchPage(nextCursor, true)}
              className="mt-2 w-full rounded-xl border border-slate-700 px-4 py-2.5 text-[12.5px] font-semibold text-slate-300 hover:border-teal-500/50 hover:text-teal-300 disabled:opacity-50"
            >
              {loadingMore ? 'Memuat…' : 'Muat 50 aktivitas berikutnya'}
            </button>
          ) : null}
        </div>
      )}
    </TenantShell>
  );
}

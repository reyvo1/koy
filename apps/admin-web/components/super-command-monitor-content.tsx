'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createLoadGuard } from '@/lib/safe-fetch';

type CommandStatus = 'PENDING' | 'SENT' | 'ACKNOWLEDGED' | 'FAILED' | 'TIMED_OUT';
interface CommandRow {
  id: string;
  correlationId: string;
  tenantName: string;
  deviceId: string;
  deviceName: string;
  deviceStatus: string;
  payload: Record<string, unknown>;
  status: CommandStatus;
  createdAt: string;
  sentAt: string | null;
  acknowledgedAt: string | null;
  updatedAt: string;
}

const STATUSES: Array<{ value: string; label: string }> = [
  { value: '', label: 'Semua status' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'SENT', label: 'Sent / menunggu ACK' },
  { value: 'ACKNOWLEDGED', label: 'Acknowledged' },
  { value: 'FAILED', label: 'Failed' },
  { value: 'TIMED_OUT', label: 'Timed out' },
];
const STATUS_STYLE: Record<CommandStatus, string> = {
  PENDING: 'bg-amber-500/10 text-amber-300',
  SENT: 'bg-sky-500/10 text-sky-300',
  ACKNOWLEDGED: 'bg-emerald-500/10 text-emerald-300',
  FAILED: 'bg-red-500/10 text-red-300',
  TIMED_OUT: 'bg-orange-500/10 text-orange-300',
};

export default function SuperCommandMonitorContent() {
  const [rows, setRows] = useState<CommandRow[] | null>(null);
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const loadGuard = useRef(createLoadGuard());
  const load = useCallback(async () => {
    const isCurrent = loadGuard.current.begin();
    setRefreshing(true);
    setError(null);
    try {
      const query = new URLSearchParams({ limit: '150' });
      if (status) query.set('status', status);
      const response = await fetch(`/api/super/commands?${query.toString()}`);
      const body = await response.json().catch(() => { throw new Error('Backend mengembalikan respons yang tidak dapat dibaca.'); });
      if (!response.ok) throw new Error(body?.error?.message ?? `backend ${response.status}`);
      if (body.sendCommandEnabled === true) throw new Error('kontrak read-only dilanggar backend');
      if (!isCurrent()) return;
      setRows(Array.isArray(body.items) ? body.items : []);
    } catch (cause) {
      if (!isCurrent()) return;
      setError(cause instanceof Error ? cause.message : 'gagal memuat command');
    } finally {
      if (isCurrent()) setRefreshing(false);
    }
  }, [status]);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    const base = rows ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return base;
    return base.filter((row) =>
      `${row.tenantName} ${row.deviceName} ${row.deviceId} ${row.correlationId} ${Object.keys(row.payload ?? {}).join(' ')}`
        .toLowerCase()
        .includes(q),
    );
  }, [rows, search]);

  const queueCount = (rows ?? []).filter((row) => row.status === 'PENDING' || row.status === 'SENT').length;
  const failedCount = (rows ?? []).filter((row) => row.status === 'FAILED' || row.status === 'TIMED_OUT').length;

  return (
    <div>
      <div className="mb-4 grid gap-3 md:grid-cols-3">
        <Stat label="Rows loaded" value={rows === null ? '—' : String(rows.length)} />
        <Stat label="Queue / awaiting ACK" value={rows === null ? '—' : String(queueCount)} />
        <Stat label="Failed / timed out" value={rows === null ? '—' : String(failedCount)} />
      </div>
      <div className="mb-4 rounded-xl border border-amber-500/20 bg-amber-500/[.05] px-4 py-3 text-[12.5px] leading-relaxed text-amber-100">
        Platform surface ini <strong>monitoring-only</strong>. Tidak ada tombol Send Command lintas tenant; dispatch tetap memakai jalur tenant/device yang terotorisasi.
      </div>
      <div className="mb-4 flex flex-wrap gap-2">
        <select value={status} onChange={(event) => setStatus(event.target.value)} className="rounded-xl border border-slate-700 bg-slate-900/70 px-3.5 py-2.5 text-[13px] text-slate-200 outline-none focus:border-teal-500">
          {STATUSES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari tenant, device, correlation ID, capability…" className="min-w-[260px] flex-1 rounded-xl border border-slate-700 bg-slate-900/70 px-3.5 py-2.5 text-[13px] text-slate-200 outline-none placeholder:text-slate-500 focus:border-teal-500" />
        <button type="button" onClick={() => void load()} disabled={refreshing} className="rounded-xl border border-teal-500/30 bg-teal-500/10 px-4 py-2.5 text-[12.5px] font-bold text-teal-300 disabled:opacity-50">
          {refreshing ? 'Memuat…' : 'Refresh'}
        </button>
      </div>
      {error && rows === null ? <StateBox title="Command monitor tidak tersedia" detail={error} /> : null}
      {error && rows !== null ? <p role="alert" className="mb-4 rounded-xl border border-red-500/20 bg-red-500/[.05] px-4 py-2.5 text-[12.5px] text-red-300">{error}</p> : null}
      {rows === null && !error ? <div className="h-56 animate-pulse rounded-xl bg-slate-800/60" /> : null}
      {rows !== null && filtered.length === 0 ? <StateBox title="Tidak ada command pada filter ini" /> : null}
      {filtered.length > 0 ? (
        <div className="space-y-2.5">
          {filtered.map((row) => (
            <article key={row.id} className="rounded-xl border border-slate-800/80 bg-[#0f1929] px-4 py-3.5">
              <div className="flex flex-wrap items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[13.5px] font-bold text-white">{row.deviceName}</span>
                    <span className="text-[11px] text-slate-600">· {row.tenantName}</span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[10.5px] text-slate-600">
                    <span>corr: <code className="text-slate-500">{row.correlationId}</code></span>
                    <span>created {formatDate(row.createdAt)}</span>
                    {row.sentAt ? <span>sent {formatDate(row.sentAt)}</span> : null}
                    {row.acknowledgedAt ? <span>ack {formatDate(row.acknowledgedAt)}</span> : null}
                  </div>
                </div>
                <span className={`rounded-full px-3 py-1 text-[10.5px] font-bold ${STATUS_STYLE[row.status]}`}>{row.status}</span>
              </div>
              <pre className="mt-3 overflow-x-auto rounded-lg bg-slate-950/70 px-3 py-2 text-[11px] leading-relaxed text-slate-400">{JSON.stringify(row.payload, null, 2)}</pre>
            </article>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-slate-800/80 bg-slate-900/45 px-4 py-3"><div className="text-[10.5px] uppercase tracking-wide text-slate-600">{label}</div><div className="mt-1 text-xl font-extrabold text-white">{value}</div></div>;
}
function StateBox({ title, detail }: { title: string; detail?: string }) {
  return <div className="rounded-xl border border-dashed border-slate-700/70 p-10 text-center"><p className="m-0 text-[15px] font-semibold text-slate-300">{title}</p>{detail ? <p className="mt-2 text-[13px] text-slate-500">Backend ({detail}).</p> : null}</div>;
}
function formatDate(value: string | null) { return value ? new Date(value).toLocaleString('id-ID') : '—'; }

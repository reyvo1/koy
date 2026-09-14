'use client';

import { useCallback, useEffect, useState } from 'react';

interface ReportRow {
  tenantId: string;
  tenantName: string;
  users: number;
  devices: number;
  deviceGroups: number;
  credentialedDevices: number;
  telemetryEvents: number;
  commands: { pending: number; sent: number; acknowledged: number; failed: number; timedOut: number };
  analytics: { warning: number; critical: number };
}
interface ReportPayload { generatedAt: string; from: string; hours: number; items: ReportRow[]; }
const RANGES = [24, 168, 720];

export default function SuperReportsContent() {
  const [hours, setHours] = useState(24);
  const [report, setReport] = useState<ReportPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const response = await fetch(`/api/super/reports/tenant-summary?hours=${hours}`);
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error?.message ?? `backend ${response.status}`);
      setReport({ ...body, items: Array.isArray(body.items) ? body.items : [] });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'gagal memuat laporan');
    } finally { setLoading(false); }
  }, [hours]);
  useEffect(() => { void load(); }, [load]);

  const exportCsv = () => {
    if (!report?.items.length) return;
    const headers = ['tenant','users','devices','device_groups','credentialed_devices','telemetry_events','command_pending','command_sent','command_acknowledged','command_failed','command_timed_out','analytics_warning','analytics_critical'];
    const rows = report.items.map((row) => [row.tenantName,row.users,row.devices,row.deviceGroups,row.credentialedDevices,row.telemetryEvents,row.commands.pending,row.commands.sent,row.commands.acknowledged,row.commands.failed,row.commands.timedOut,row.analytics.warning,row.analytics.critical]);
    const csv = [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `platform-tenant-summary-${hours}h.csv`; anchor.click(); URL.revokeObjectURL(url);
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {RANGES.map((value) => <button key={value} onClick={() => setHours(value)} className={`rounded-full px-4 py-1.5 text-[12px] font-bold ${hours === value ? 'bg-teal-500 text-slate-950' : 'bg-slate-800 text-slate-400 hover:text-white'}`}>{value === 24 ? '24 jam' : value === 168 ? '7 hari' : '30 hari'}</button>)}
        <button type="button" onClick={exportCsv} disabled={!report?.items.length || loading} className="ml-auto rounded-xl border border-teal-500/30 bg-teal-500/10 px-4 py-2 text-[12.5px] font-bold text-teal-300 disabled:opacity-40">Export CSV</button>
      </div>
      <div className="mb-4 rounded-xl border border-slate-800/80 bg-slate-900/40 px-4 py-3 text-[11.5px] text-slate-500">
        Snapshot server-generated: inventory saat ini + aktivitas sejak {report ? new Date(report.from).toLocaleString('id-ID') : '—'}. CSV dibuat dari row yang sama; bukan data simulasi.
      </div>
      {error && !report ? <StateBox title="Platform report tidak tersedia" detail={error} /> : null}
      {loading && !report ? <div className="h-56 animate-pulse rounded-xl bg-slate-800/60" /> : null}
      {report && report.items.length === 0 ? <StateBox title="Belum ada tenant pada report" /> : null}
      {report?.items.length ? (
        <div className="overflow-x-auto rounded-xl border border-slate-800/80">
          <table className="min-w-[1100px] w-full text-left text-[12px]">
            <thead className="bg-slate-900/70 text-[10px] uppercase tracking-wide text-slate-500"><tr><th className="px-3 py-3">Tenant</th><th className="px-3 py-3">Users</th><th className="px-3 py-3">Devices</th><th className="px-3 py-3">Groups</th><th className="px-3 py-3">Cred.</th><th className="px-3 py-3">Telemetry</th><th className="px-3 py-3">Pending/Sent</th><th className="px-3 py-3">ACK</th><th className="px-3 py-3">Fail/Timeout</th><th className="px-3 py-3">Warn/Crit</th></tr></thead>
            <tbody>{report.items.map((row) => <tr key={row.tenantId} className="border-t border-slate-800/70 text-slate-300"><td className="px-3 py-3 font-semibold text-white">{row.tenantName}</td><td className="px-3 py-3">{row.users}</td><td className="px-3 py-3">{row.devices}</td><td className="px-3 py-3">{row.deviceGroups}</td><td className="px-3 py-3">{row.credentialedDevices}</td><td className="px-3 py-3">{row.telemetryEvents}</td><td className="px-3 py-3">{row.commands.pending} / {row.commands.sent}</td><td className="px-3 py-3 text-emerald-300">{row.commands.acknowledged}</td><td className="px-3 py-3 text-red-300">{row.commands.failed} / {row.commands.timedOut}</td><td className="px-3 py-3 text-amber-300">{row.analytics.warning} / {row.analytics.critical}</td></tr>)}</tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
function csvCell(value: string | number) { return `"${String(value).replace(/"/g, '""')}"`; }
function StateBox({ title, detail }: { title: string; detail?: string }) { return <div className="rounded-xl border border-dashed border-slate-700/70 p-10 text-center"><p className="m-0 text-[15px] font-semibold text-slate-300">{title}</p>{detail ? <p className="mt-2 text-[13px] text-slate-500">Backend ({detail}).</p> : null}</div>; }

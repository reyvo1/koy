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

/**
 * A stored report, as the backend returns it.
 *
 * `payload` is deliberately absent from the list shape: the list is metadata, and fetching every
 * stored body to render a list of dates would be a way of making the archive expensive to read.
 */
interface SavedRow {
  id: string;
  kind: string;
  rangeFrom: string;
  rangeTo: string;
  requestedHours: number;
  rowCount: number;
  createdAt: string;
  expiresAt: string;
}
interface SavedPayload { items: SavedRow[]; total: number; retentionDays: number; }

const RANGES = [24, 168, 720];

export default function SuperReportsContent() {
  const [hours, setHours] = useState(24);
  const [report, setReport] = useState<ReportPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // `null` until the request resolves, not `[]`. An empty list is a claim -- "this tenant has no
  // saved reports" -- and before the request returns the console has made no such claim, so a
  // first render and a render after an outage must not look alike.
  const [saved, setSaved] = useState<SavedPayload | null>(null);
  // Which tenant's archive is on screen. The report itself is cross-tenant, but a *saved* report
  // belongs to one tenant, so the archive needs a target the cross-tenant report cannot supply.
  // Left blank rather than defaulting to the first row: a default would mean saving under a
  // tenant the operator never chose, and the archive would fill with reports attributed to
  // whichever tenant happened to sort first.
  const [archiveTenant, setArchiveTenant] = useState('');
  const [savedError, setSavedError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveNote, setSaveNote] = useState<string | null>(null);

  const loadSaved = useCallback(async () => {
    setSavedError(null);
    if (!archiveTenant.trim()) {
      // Not an error: no tenant chosen means no archive to show. `null` rather than an empty list,
      // so the panel can say "choose a tenant" instead of claiming the tenant has no reports.
      setSaved(null);
      return;
    }
    try {
      const response = await fetch(
        `/api/super/reports/saved?tenantId=${encodeURIComponent(archiveTenant.trim())}`,
        { cache: 'no-store' },
      );
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error?.message ?? `backend ${response.status}`);
      setSaved({
        items: Array.isArray(body.items) ? body.items : [],
        total: body.total ?? 0,
        retentionDays: body.retentionDays ?? 28,
      });
    } catch (cause) {
      setSaved(null);
      setSavedError(cause instanceof Error ? cause.message : 'gagal memuat laporan tersimpan');
    }
  }, [archiveTenant]);

  useEffect(() => { void loadSaved(); }, [loadSaved]);

  /**
   * Store the report currently on screen.
   *
   * The operator saves the run rather than the backend saving every run: an archive that grows
   * automatically is a table nobody reads, and it would fill with reports generated for a passing
   * glance. The button sits next to the run it stores, because the thing being saved is what is
   * on screen.
   */
  const saveCurrent = useCallback(async () => {
    setSaving(true);
    setSaveNote(null);
    try {
      // The tenant the operator chose for the archive, not one inferred from the report rows. The
      // report spans every tenant, so any row would do -- and "any row" means the archive gets
      // attributed to whichever tenant sorted first, which is not a decision anyone made.
      const tenantId = archiveTenant.trim();
      if (!tenantId) {
        setSaveNote('Pilih tenant tujuan arsip terlebih dahulu.');
        return;
      }
      const response = await fetch('/api/super/reports/saved', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tenantId, hours }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error?.message ?? `backend ${response.status}`);
      setSaveNote(
        body?.note ?? 'Laporan disimpan. Angka yang diunduh nanti adalah angka yang disimpan ini.',
      );
      await loadSaved();
    } catch (cause) {
      setSaveNote(cause instanceof Error ? cause.message : 'gagal menyimpan laporan');
    } finally {
      setSaving(false);
    }
  }, [archiveTenant, hours, loadSaved]);

  /**
   * Download a stored report.
   *
   * This fetches the payload the backend stored. It does not re-run the report: regenerating on
   * download would let the numbers move between saving and re-reading, which is the one thing a
   * saved report exists to prevent.
   */
  const downloadSaved = useCallback(async (row: SavedRow) => {
    const response = await fetch(
      `/api/super/reports/saved/download?id=${encodeURIComponent(row.id)}&tenantId=${encodeURIComponent(archiveTenant.trim())}`,
      { cache: 'no-store' },
    );
    const body = await response.json();
    if (!response.ok) throw new Error(body?.error?.message ?? `backend ${response.status}`);

    const payload = body?.payload ?? body?.saved?.payload;
    const items = Array.isArray(payload?.items) ? payload.items : [];
    const csv = items.length
      ? [Object.keys(items[0]), ...items.map((item: Record<string, unknown>) => Object.values(item))]
          .map((line) => line.map(csvCell).join(','))
          .join('\n')
      : 'tidak ada baris';

    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `platform-tenant-summary-${row.requestedHours}h-${row.id.slice(0, 8)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
    }, [archiveTenant]);

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
        {/* Save sits beside Export CSV because both act on the report currently on screen --
            "save what I am looking at" is the whole gesture. Storing it somewhere else would mean
            an operator saving one window while believing they saved another. */}
        <button
          type="button"
          onClick={() => void saveCurrent()}
          disabled={!report?.items.length || loading || saving || !archiveTenant.trim()}
          className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-[12.5px] font-bold text-amber-300 disabled:opacity-40"
        >
          {saving ? 'Menyimpan…' : 'Simpan laporan'}
        </button>
      </div>
      {saveNote ? (
        <p className="mb-3 rounded-xl border border-slate-800/80 bg-slate-900/40 px-4 py-2.5 text-[11.5px] text-slate-400">
          {saveNote}
        </p>
      ) : null}
      {savedError ? (
        <p className="mb-3 rounded-xl border border-red-500/25 bg-red-500/[.06] px-4 py-2.5 text-[11.5px] text-red-300">
          Laporan tersimpan tidak dapat dimuat ({savedError}) — ini bukan berarti tidak ada laporan
          tersimpan.
        </p>
      ) : null}
      {/* The archive, next to the run that fills it. A list on a page nobody navigates to is not a
          list; this is where an operator looks right after saving something. */}
      <div className="mb-4 rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="m-0 text-[12.5px] font-bold text-slate-200">Laporan tersimpan</h3>
          {/* Which tenant's archive. Explicit because the report above spans every tenant while a
              saved report belongs to exactly one, so the report's own rows cannot say which. */}
          <input
            type="text"
            value={archiveTenant}
            onChange={(event) => setArchiveTenant(event.target.value)}
            placeholder="Tenant ID arsip"
            aria-label="Tenant ID arsip laporan tersimpan"
            className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-1 text-[11.5px] text-slate-200 outline-none focus:border-teal-500"
          />
          {saved ? (
            <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10.5px] font-bold text-slate-400">
              {saved.total} laporan · retensi {saved.retentionDays} hari
            </span>
          ) : null}
        </div>
        {saved === null ? (
          <p className="mb-0 mt-2.5 text-[11.5px] text-slate-500">
            {archiveTenant.trim()
              ? 'Arsip belum dimuat.'
              : 'Pilih tenant arsip untuk melihat laporan yang tersimpan.'}
          </p>
        ) : saved.items.length === 0 ? (
          <p className="mb-0 mt-2.5 text-[11.5px] text-slate-500">
            Belum ada laporan tersimpan untuk tenant ini.
          </p>
        ) : (
          <ul className="mt-2.5 space-y-2">
            {saved.items.map((row) => (
              <li
                key={row.id}
                className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2"
              >
                <span className="text-[11.5px] text-slate-300">
                  {new Date(row.rangeFrom).toLocaleString('id-ID')} →{' '}
                  {new Date(row.rangeTo).toLocaleString('id-ID')}
                </span>
                <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10.5px] text-slate-400">
                  {row.requestedHours}j · {row.rowCount} baris
                </span>
                <span className="text-[10.5px] text-slate-500">
                  kedaluwarsa {new Date(row.expiresAt).toLocaleString('id-ID')}
                </span>
                <button
                  type="button"
                  onClick={() => void downloadSaved(row).catch(() => undefined)}
                  className="ml-auto rounded-lg border border-sky-500/40 bg-sky-500/10 px-3 py-1 text-[11px] font-semibold text-sky-300"
                >
                  Unduh CSV
                </button>
              </li>
            ))}
          </ul>
        )}
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

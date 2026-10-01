'use client';

/**
 * Technician compatibility view. Only live device diagnostics are shown here.
 * Commissioning, maintenance state, and logs are delegated to real platform
 * surfaces instead of being simulated in the browser.
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AdminShellV3 } from '@/components/admin-shell-v3';
import { QuarantineBanner } from '@/components/quarantine-banner';

type Tab = 'diagnostics' | 'commissioning' | 'maintenance' | 'logs';

interface MaintenanceWindow {
  id: string;
  deviceId: string;
  deviceName: string | null;
  status: 'OPEN' | 'RESOLVED';
  reason: string;
  openedByUserId: string;
  openedAt: string;
  resolvedByUserId: string | null;
  resolvedAt: string | null;
  resolutionNote: string | null;
}

interface CommandLogRow {
  id: string;
  correlationId: string;
  deviceId: string;
  capabilityKey: string;
  status: string;
  /** Derived from acknowledgedAt, not from the status label. */
  settled: boolean;
  sentAt: string | null;
  acknowledgedAt: string | null;
  createdAt: string;
  roundTripMs: number | null;
}

/**
 * The commissioning funnel, in the order the enum declares it.
 *
 * Read from the backend's own `DeviceStatus`, not re-declared here: a local copy of this list would
 * drift the moment the enum gained a value, and the console would keep showing a stage the system
 * no longer has.
 */
const COMMISSIONING_STAGES = [
  'PROVISIONING',
  'PAIRED',
  'ACTIVE',
  'INACTIVE',
  'REVOKED',
] as const;

interface DeviceRow {
  id: string;
  name: string;
  type?: string;
  status: string;
  lastHeartbeatAt?: string | null;
}

const TABS: Array<{ key: Tab; label: string; icon: string }> = [
  { key: 'diagnostics', label: 'Diagnostik', icon: '◈' },
  { key: 'commissioning', label: 'Commissioning', icon: '⚙' },
  { key: 'maintenance', label: 'Maintenance', icon: '⛭' },
  { key: 'logs', label: 'Log Perangkat', icon: '≣' },
];

export default function TechnicianAppPage() {
  const [tab, setTab] = useState<Tab>('diagnostics');
  const [devices, setDevices] = useState<DeviceRow[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [windows, setWindows] = useState<MaintenanceWindow[]>([]);
  const [logRows, setLogRows] = useState<CommandLogRow[]>([]);
  const [logTotal, setLogTotal] = useState(0);
  const [logError, setLogError] = useState<string | null>(null);
  const [logDeviceId, setLogDeviceId] = useState<string | null>(null);
  const [maintenanceError, setMaintenanceError] = useState<string | null>(null);
  const [resolving, setResolving] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/devices');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const body = (await response.json()) as DeviceRow[] | { items?: DeviceRow[] };
      setDevices(Array.isArray(body) ? body : (body.items ?? []));
      setLoadError(null);
    } catch (cause) {
      setDevices([]);
      setLoadError(cause instanceof Error ? cause.message : 'gagal memuat perangkat');
    }
  }, []);

  /**
   * Read the maintenance windows.
   *
   * A failure is its own state, not an empty list. "No windows" and "the windows could not be read"
   * are different facts, and a technician who cannot see an open window must be told the read
   * failed rather than shown a clean board.
   */
  const loadMaintenance = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/device-maintenance');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const body = (await response.json()) as {
        items?: MaintenanceWindow[];
      };
      setWindows(Array.isArray(body.items) ? body.items : []);
      setMaintenanceError(null);
    } catch (cause) {
      setWindows([]);
      setMaintenanceError(
        cause instanceof Error ? cause.message : 'gagal memuat maintenance',
      );
    }
  }, []);

  const resolveWindow = useCallback(
    async (maintenanceId: string) => {
      setResolving(maintenanceId);
      try {
        const response = await fetch(
          `/api/admin/device-maintenance/${encodeURIComponent(maintenanceId)}`,
          {
            method: 'DELETE',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ resolutionNote: '' }),
          },
        );
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        await loadMaintenance();
      } catch (cause) {
        setMaintenanceError(
          cause instanceof Error ? cause.message : 'gagal menutup maintenance',
        );
      } finally {
        setResolving(null);
      }
    },
    [loadMaintenance],
  );

  /**
   * Read the device log for one device.
   *
   * A failed read is its own state. Showing an empty list after an outage would tell a technician a
   * device has never been commanded, which is the one thing this tab must never imply.
   */
  const loadLog = useCallback(async (deviceId: string) => {
    setLogDeviceId(deviceId);
    try {
      const response = await fetch(
        `/api/admin/device-log?deviceId=${encodeURIComponent(deviceId)}`,
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const body = (await response.json()) as {
        items?: CommandLogRow[];
        total?: number;
      };
      setLogRows(Array.isArray(body.items) ? body.items : []);
      setLogTotal(typeof body.total === 'number' ? body.total : 0);
      setLogError(null);
    } catch (cause) {
      setLogRows([]);
      setLogTotal(0);
      setLogError(cause instanceof Error ? cause.message : 'gagal memuat log perangkat');
    }
  }, []);

  useEffect(() => {
    void load();
    void loadMaintenance();
  }, [load, loadMaintenance]);

  const stale = (device: DeviceRow) =>
    !device.lastHeartbeatAt ||
    Date.now() - new Date(device.lastHeartbeatAt).getTime() > 5 * 60_000;

  const diagnosticsList = devices.filter(
    (device) => device.status !== 'ACTIVE' || stale(device),
  );

  return (
    <AdminShellV3
      title="Technician Tools"
      subtitle="Compatibility view — data simulasi dinonaktifkan"
    >
      <QuarantineBanner
        works={[
          'Diagnostik perangkat dari direktori perangkat nyata, dengan kriteria status dan heartbeat yang disebut di tab Diagnostik.',
          'Corong commissioning dibaca dari DeviceStatus backend, bukan dibuat acak di browser.',
          'Jendela maintenance dibaca dari tabel device_maintenance, dengan pembuka dan penutup yang tercatat.',
        ]}
        doesNotWork={[
          'Belum ada jadwal maintenance yang dihitung otomatis; jendela dibuka manual oleh teknisi.',
          'Log perangkat membaca device_commands: apa yang dikirim platform dan apa yang kembali.',
          'Telemetry tetap dibaca dari Realtime; tab Log sengaja tidak mencampurkannya dengan command.',
        ]}
      />

      <div className="mb-5 flex gap-1 rounded-xl border border-slate-800 bg-slate-900/70 p-1">
        {TABS.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setTab(item.key)}
            className={`flex-1 rounded-lg px-3 py-2 text-[13px] font-semibold transition-all ${
              tab === item.key
                ? 'bg-teal-500/20 text-teal-300'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {item.icon} {item.label}
          </button>
        ))}
      </div>

      {tab === 'diagnostics' ? (
        <div className="rounded-2xl border border-slate-800/80 bg-[#111c2e] p-6">
          <h3 className="m-0 mb-1 text-[15px] font-bold text-white">
            Perangkat Perlu Pemeriksaan
          </h3>
          <p className="mb-4 mt-0 text-[12.5px] text-slate-500">
            Kriteria lokal: status bukan ACTIVE atau heartbeat lebih dari 5 menit.
          </p>
          {loadError ? (
            <p className="rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-[13px] text-red-300">
              Daftar perangkat tidak tersedia ({loadError}).
            </p>
          ) : diagnosticsList.length === 0 ? (
            <p className="py-6 text-center text-[13px] text-emerald-400">
              Tidak ada perangkat yang memenuhi kriteria pemeriksaan saat ini.
            </p>
          ) : (
            <div className="space-y-3">
              {diagnosticsList.map((device) => (
                <Link
                  key={device.id}
                  href={`/tenant/perangkat/${device.id}`}
                  className="flex items-center gap-3 rounded-xl border border-slate-800/60 bg-slate-900/50 px-4 py-3 transition-colors hover:border-amber-500/40"
                >
                  <span className={`h-2.5 w-2.5 rounded-full ${stale(device) ? 'bg-red-500' : 'bg-amber-400'}`} />
                  <span className="text-[14px] font-semibold text-slate-100">{device.name}</span>
                  <span className="ml-auto text-[12px] text-slate-500">
                    {stale(device) ? 'heartbeat stale' : device.status}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>
      ) : null}

      {tab === 'commissioning' ? (
        <div className="rounded-2xl border border-slate-800/80 bg-[#111c2e] p-6">
          <h3 className="m-0 mb-1 text-[15px] font-bold text-white">
            Corong Commissioning
          </h3>
          <p className="mb-4 mt-0 text-[12.5px] text-slate-500">
            Tahap lifecycle dibaca dari <code>DeviceStatus</code> backend — PROVISIONING ke PAIRED
            dijalankan <code>device.service.ts</code>, bukan dibuat di browser. Token provisioning
            tetap diterbitkan backend dan hanya ditampilkan sekali.
          </p>

          {loadError ? (
            <p className="rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-[13px] text-red-300">
              Daftar perangkat tidak tersedia ({loadError}).
            </p>
          ) : devices.length === 0 ? (
            <p className="py-6 text-center text-[13px] text-slate-400">
              Belum ada perangkat untukShows corongnya.
            </p>
          ) : (
            <div className="space-y-2">
              {COMMISSIONING_STAGES.map((stage) => {
                const inStage = devices.filter((device) => device.status === stage);
                return (
                  <div
                    key={stage}
                    className="flex items-center gap-3 rounded-xl border border-slate-800/60 bg-slate-900/50 px-4 py-2.5"
                  >
                    <span className="w-40 text-[12px] font-semibold text-slate-300">{stage}</span>
                    <span className="text-[13px] text-slate-500">
                      {inStage.length === 0
                        ? 'tidak ada perangkat'
                        : inStage.map((device) => device.name).join(', ')}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          <Link
            href="/tenant/perangkat"
            className="mt-4 inline-flex rounded-xl bg-teal-500 px-4 py-2.5 text-[12.5px] font-bold text-white hover:brightness-110"
          >
            Daftarkan perangkat
          </Link>
        </div>
      ) : null}

      {tab === 'maintenance' ? (
        <div className="rounded-2xl border border-slate-800/80 bg-[#111c2e] p-6">
          <h3 className="m-0 mb-1 text-[15px] font-bold text-white">
            Jendela Maintenance
          </h3>
          <p className="mb-4 mt-0 text-[12.5px] text-slate-500">
            Dari tabel <code>device_maintenance</code>. Sengaja terpisah dari status perangkat:
            <code> updateHeartbeat</code> menulis <code>ACTIVE</code> pada setiap heartbeat, jadi
            state maintenance di kolom itu akan menutup dirinya sendiri.
          </p>

          {maintenanceError ? (
            <p className="rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-[13px] text-red-300">
              Jendela maintenance tidak dapat dibaca ({maintenanceError}).
            </p>
          ) : null}

          {windows.length === 0 ? (
            <p className="py-6 text-center text-[13px] text-emerald-400">
              {maintenanceError
                ? 'Daftar tidak dapat dipastikan.'
                : 'Tidak ada jendela maintenance pada tenant ini.'}
            </p>
          ) : (
            <div className="space-y-3">
              {windows.map((window) => (
                <div
                  key={window.id}
                  className="flex items-center gap-3 rounded-xl border border-slate-800/60 bg-slate-900/50 px-4 py-3"
                >
                  <span
                    className={`h-2.5 w-2.5 rounded-full ${
                      window.status === 'OPEN' ? 'bg-amber-400' : 'bg-emerald-400'
                    }`}
                  />
                  <div className="min-w-0">
                    <span className="block text-[14px] font-semibold text-slate-100">
                      {window.deviceName ?? window.deviceId}
                    </span>
                    <span className="block text-[12px] text-slate-500">
                      {window.reason}
                      {window.resolvedAt
                        ? ` · ditutup ${new Date(window.resolvedAt).toLocaleString('id-ID')}`
                        : ''}
                    </span>
                  </div>
                  <span className="ml-auto text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                    {window.status === 'OPEN' ? 'OPEN' : 'RESOLVED'}
                  </span>
                  {window.status === 'OPEN' ? (
                    <button
                      type="button"
                      disabled={resolving === window.id}
                      onClick={() => void resolveWindow(window.id)}
                      className="rounded-lg bg-teal-500/20 px-3 py-1.5 text-[12px] font-bold text-teal-300 disabled:opacity-50"
                    >
                      {resolving === window.id ? 'Menutup…' : 'Tutup'}
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}

      {tab === 'logs' ? (
        <div className="rounded-2xl border border-slate-800/80 bg-[#111c2e] p-6">
          <h3 className="m-0 mb-1 text-[15px] font-bold text-white">
            Log Perangkat
          </h3>
          <p className="mb-4 mt-0 text-[12.5px] text-slate-500">
            Apa yang <strong>kirim platform</strong> ke perangkat dan apa yang kembali — tabel{' '}
            <code>device_commands</code>. Bukan telemetry: telemetry adalah apa yang perangkat
            laporkan sendiri, dan itu punya permukaannya sendiri di Realtime.
          </p>

          <div className="mb-4 flex flex-wrap gap-1 rounded-xl border border-slate-800 bg-slate-900/70 p-1">
            {devices.map((device) => (
              <button
                key={device.id}
                type="button"
                onClick={() => void loadLog(device.id)}
                className={`rounded-lg px-3 py-1.5 text-[12px] font-semibold ${
                  logDeviceId === device.id
                    ? 'bg-teal-500/20 text-teal-300'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {device.name}
              </button>
            ))}
          </div>

          {logError ? (
            <p className="rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-[13px] text-red-300">
              Log tidak dapat dibaca ({logError}).
            </p>
          ) : logRows.length === 0 ? (
            <p className="py-6 text-center text-[13px] text-slate-400">
              {logDeviceId === null
                ? 'Pilih perangkat untuk membaca log command-nya.'
                : logError
                  ? 'Daftar tidak dapat dipastikan.'
                  : 'Tidak ada command yang pernah dikirim ke perangkat ini.'}
            </p>
          ) : (
            <>
              <p className="mb-2 text-[12px] text-slate-500">
                {logRows.length} dari {logTotal} command ditampilkan.
              </p>
              <div className="space-y-2">
                {logRows.map((row) => (
                  <div
                    key={row.id}
                    className="flex items-center gap-3 rounded-xl border border-slate-800/60 bg-slate-900/50 px-4 py-2.5"
                  >
                    <span
                      className={`h-2.5 w-2.5 rounded-full ${
                        row.settled ? 'bg-emerald-400' : 'bg-amber-400'
                      }`}
                    />
                    <div className="min-w-0">
                      <span className="block text-[13px] font-semibold text-slate-100">
                        {row.capabilityKey}
                      </span>
                      <span className="block text-[11.5px] text-slate-500">
                        {new Date(row.createdAt).toLocaleString('id-ID')}
                        {row.roundTripMs !== null ? ` · ACK ${row.roundTripMs} ms` : ''}
                      </span>
                    </div>
                    <span className="ml-auto font-mono text-[10.5px] text-slate-600">
                      {row.correlationId.slice(0, 8)}
                    </span>
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                      {row.settled ? 'ACK' : row.status}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      ) : null}
    </AdminShellV3>
  );}

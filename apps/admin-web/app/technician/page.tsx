'use client';

/**
 * Technician compatibility view. Only live device diagnostics are shown here.
 * Commissioning, maintenance state, and logs are delegated to real platform
 * surfaces instead of being simulated in the browser.
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AdminShellV3 } from '@/components/admin-shell-v3';

type Tab = 'diagnostics' | 'commissioning' | 'maintenance' | 'logs';

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

  useEffect(() => {
    void load();
  }, [load]);

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
        <ActionCard
          title="Commissioning memakai provisioning backend"
          body="Claim code tidak lagi dibuat acak di browser. Daftarkan perangkat melalui halaman Perangkat Tenant agar token diterbitkan oleh backend dan hanya ditampilkan sekali."
          href="/tenant/perangkat"
          action="Buka Perangkat Tenant"
        />
      ) : null}

      {tab === 'maintenance' ? (
        <ActionCard
          title="Status maintenance belum memiliki domain persisten"
          body="Aplikasi tidak membuat jadwal atau rekomendasi maintenance palsu. Firmware dan rollout OTA yang nyata dikelola dari konsol Platform Admin."
          href="/super/firmware"
          action="Buka Firmware & OTA"
        />
      ) : null}

      {tab === 'logs' ? (
        <ActionCard
          title="Log perangkat belum memiliki endpoint khusus"
          body="Log sintetis telah dihapus. Gunakan Realtime dan Historis untuk telemetry yang benar-benar diterima backend sampai endpoint device log resmi tersedia."
          href="/tenant/realtime"
          action="Buka Realtime"
        />
      ) : null}
    </AdminShellV3>
  );
}

function ActionCard({
  title,
  body,
  href,
  action,
}: {
  title: string;
  body: string;
  href: string;
  action: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-800/80 bg-[#111c2e] p-6">
      <h3 className="m-0 text-[15px] font-bold text-white">{title}</h3>
      <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-slate-400">{body}</p>
      <Link
        href={href}
        className="mt-4 inline-flex rounded-xl bg-teal-500 px-4 py-2.5 text-[12.5px] font-bold text-white hover:brightness-110"
      >
        {action}
      </Link>
    </div>
  );
}

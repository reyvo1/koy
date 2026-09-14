'use client';

/**
 * Super Admin Monitoring (blueprint §1).
 * Uses backend readiness plus platform-scoped tenant/device directories.
 * It never infers platform health from a tenant operational summary.
 */

import { useCallback, useEffect, useState } from 'react';

interface HealthCheck {
  status?: 'up' | 'down';
  latencyMs?: number;
  reason?: string;
}

interface HealthPayload {
  status?: string;
  timestamp?: string;
  checks?: {
    postgres?: HealthCheck;
    redis?: HealthCheck;
    mqtt?: HealthCheck;
  };
  error?: string;
}

interface PlatformDevice {
  id: string;
  status?: string;
  lastHeartbeatAt?: string | null;
}

interface TenantRow {
  id: string;
}

const STALE_HEARTBEAT_MS = 5 * 60 * 1000;

export default function SuperMonitoringContent() {
  const [health, setHealth] = useState<HealthPayload | null>(null);
  const [devices, setDevices] = useState<PlatformDevice[]>([]);
  const [tenants, setTenants] = useState<TenantRow[]>([]);
  const [checkedAt, setCheckedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const probe = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [healthRes, deviceRes, tenantRes] = await Promise.all([
        fetch('/api/super/health'),
        fetch('/api/super/platform-devices'),
        fetch('/api/super/tenants'),
      ]);

      const healthPayload = (await healthRes.json().catch(() => ({ status: 'unreachable' }))) as HealthPayload;
      setHealth(healthPayload);

      if (!deviceRes.ok) throw new Error(`device directory ${deviceRes.status}`);
      if (!tenantRes.ok) throw new Error(`tenant directory ${tenantRes.status}`);

      const devicePayload = await deviceRes.json();
      const tenantPayload = await tenantRes.json();
      setDevices(Array.isArray(devicePayload) ? devicePayload : (devicePayload.items ?? []));
      setTenants(Array.isArray(tenantPayload) ? tenantPayload : (tenantPayload.items ?? []));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'monitoring platform tidak tersedia');
    } finally {
      setCheckedAt(new Date().toLocaleTimeString('id-ID'));
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void probe();
    const timer = setInterval(() => void probe(), 30_000);
    return () => clearInterval(timer);
  }, [probe]);

  const ready = health?.status === 'ready';
  const stale = devices.filter((device) => {
    const status = device.status?.toUpperCase();
    if (!['ACTIVE', 'PAIRED', 'ONLINE'].includes(status ?? '')) return false;
    if (!device.lastHeartbeatAt) return true;
    const seen = new Date(device.lastHeartbeatAt).getTime();
    return !Number.isFinite(seen) || Date.now() - seen > STALE_HEARTBEAT_MS;
  }).length;

  const services = [
    { name: 'PostgreSQL', check: health?.checks?.postgres },
    { name: 'Redis', check: health?.checks?.redis },
    { name: 'MQTT Broker', check: health?.checks?.mqtt },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="m-0 text-[12.5px] text-slate-500">
          Probe otomatis tiap 30 detik{checkedAt ? ` · terakhir ${checkedAt}` : ''}
        </p>
        <button
          type="button"
          onClick={() => void probe()}
          disabled={loading}
          className="rounded-lg px-3 py-1.5 text-[12px] font-bold text-teal-400 hover:bg-teal-500/10 disabled:opacity-50"
        >
          {loading ? 'Memeriksa…' : 'Periksa sekarang ↻'}
        </button>
      </div>

      {error ? (
        <p role="alert" className="rounded-xl border border-red-500/25 bg-red-500/5 px-4 py-2.5 text-[13px] text-red-300">
          {error}
        </p>
      ) : null}

      <div
        className={`rounded-2xl border p-6 ${
          ready
            ? 'border-emerald-600/40 bg-emerald-500/[.06]'
            : 'border-red-600/40 bg-red-500/[.06]'
        }`}
      >
        <div className="flex items-center gap-4">
          <div>
            <div className="text-[17px] font-extrabold text-white">
              Backend {ready ? 'READY' : health?.status === 'unreachable' ? 'UNREACHABLE' : (health?.status ?? 'UNKNOWN').toUpperCase()}
            </div>
            <div className="text-[12.5px] text-slate-400">
              {ready
                ? '/health/ready melaporkan PostgreSQL, Redis, dan MQTT siap.'
                : health?.error ?? 'Readiness belum hijau — lihat dependency di bawah.'}
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {services.map(({ name, check }) => {
          const up = check?.status === 'up';
          return (
            <div key={name} className="rounded-2xl border border-slate-800/80 bg-[#111c2e] p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[15px] font-bold text-white">{name}</div>
                  <div className="mt-1 text-[11.5px] text-slate-500">
                    {typeof check?.latencyMs === 'number' ? `${check.latencyMs} ms` : 'latency belum tersedia'}
                  </div>
                  {!up && check?.reason ? (
                    <div className="mt-1 text-[11px] text-red-400">{check.reason}</div>
                  ) : null}
                </div>
                <span className={`rounded-full px-3 py-1 text-[11.5px] font-bold ${up ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
                  {up ? 'UP' : 'DOWN'}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {[
          ['Tenant terdaftar', String(tenants.length)],
          ['Perangkat platform', String(devices.length)],
          ['Heartbeat stale >5m', String(stale)],
        ].map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-slate-800/80 bg-[#111c2e] p-5">
            <div className="text-[12.5px] text-slate-400">{label}</div>
            <div className="mt-1 text-[28px] font-extrabold text-white">{value}</div>
          </div>
        ))}
      </div>

      <p className="m-0 text-[11.5px] text-slate-600">
        Dependency health berasal langsung dari `/health/ready`; workload context berasal dari directory platform-scoped, bukan tenant aktif.
      </p>
    </div>
  );
}

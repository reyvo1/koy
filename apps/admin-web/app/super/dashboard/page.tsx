'use client';

/**
 * Super Admin Dashboard (blueprint §1).
 * All operational counts are platform-scoped. It intentionally does not use
 * tenant-scoped /api/admin/* summaries and never fabricates health status.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { SuperPage, SuperAdminShell } from '@/components/super-admin-shell';
import { EnterpriseTable, StatusPill } from '@/components/enterprise-table';
import { CountUp, FadeIn, SkeletonCard, shadow } from '@/components/ui-polish';
import {
  RadioTower,
  Activity,
  Clock,
  Building2,
  Users,
  TrendingUp,
  Globe,
  MonitorSmartphone,
  ShieldCheck,
  HeartPulse,
  PackagePlus,
  type LucideIcon,
} from 'lucide-react';

interface DeviceRow {
  id: string;
  name: string;
  type?: string;
  status: string;
  tenantName?: string | null;
  lastHeartbeatAt?: string | null;
}

interface TenantRow {
  id: string;
  name: string;
  status?: string;
}

interface HealthCheck {
  status?: 'up' | 'down';
  latencyMs?: number;
  reason?: string;
}

interface HealthPayload {
  status?: 'ready' | 'not_ready' | 'unreachable' | string;
  checks?: {
    postgres?: HealthCheck;
    redis?: HealthCheck;
    mqtt?: HealthCheck;
  };
  error?: string;
}

function StatTile({
  label,
  value,
  sub,
  icon: Icon,
  accent,
}: {
  label: string;
  value: number | string;
  sub?: string;
  icon: LucideIcon;
  accent: string;
}) {
  const numeric = typeof value === 'number';
  return (
    <div
      className={`group relative overflow-hidden rounded-2xl border border-slate-800/80 bg-[#111c2e] p-5 transition-all duration-200 ease-out hover:-translate-y-1 hover:border-slate-600 ${shadow.card}`}
    >
      <div className={`absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r ${accent}`} />
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[12.5px] font-medium text-slate-400">{label}</div>
          <div className="mt-1 text-[30px] font-extrabold tabular-nums tracking-tight text-white">
            {numeric ? <CountUp value={value as number} /> : value}
          </div>
          {sub ? <div className="text-[12px] text-slate-500">{sub}</div> : null}
        </div>
        <span className={`grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br ${accent} opacity-90 transition-transform duration-200 group-hover:scale-110`}>
          <Icon className="h-5 w-5 text-white" strokeWidth={2} />
        </span>
      </div>
    </div>
  );
}

const QUICK_LINKS: { icon: LucideIcon; label: string; href: string }[] = [
  { icon: Building2, label: 'Tenants', href: '/super/tenants' },
  { icon: Users, label: 'Users & Roles', href: '/super/users' },
  { icon: RadioTower, label: 'Devices', href: '/super/devices' },
  { icon: PackagePlus, label: 'Provisioning', href: '/super/provisioning' },
  { icon: TrendingUp, label: 'Telemetry', href: '/super/telemetry' },
  { icon: Globe, label: 'MQTT Center', href: '/super/mqtt' },
  { icon: MonitorSmartphone, label: 'Monitoring', href: '/super/monitoring' },
  { icon: ShieldCheck, label: 'Security & Audit', href: '/super/security' },
];

function healthLabel(check?: HealthCheck): string {
  if (!check) return 'UNKNOWN';
  return check.status === 'up' ? 'UP' : 'DOWN';
}

export default function SuperDashboard() {
  const [devices, setDevices] = useState<DeviceRow[] | null>(null);
  const [tenants, setTenants] = useState<TenantRow[] | null>(null);
  const [health, setHealth] = useState<HealthPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [deviceRes, tenantRes, healthRes] = await Promise.all([
        fetch('/api/super/platform-devices'),
        fetch('/api/super/tenants'),
        fetch('/api/super/health'),
      ]);

      if (!deviceRes.ok) throw new Error(`device directory ${deviceRes.status}`);
      if (!tenantRes.ok) throw new Error(`tenant directory ${tenantRes.status}`);

      const devicePayload = await deviceRes.json();
      const tenantPayload = await tenantRes.json();
      const healthPayload = await healthRes.json().catch(() => ({ status: 'unreachable' }));

      setDevices(Array.isArray(devicePayload) ? devicePayload : (devicePayload.items ?? []));
      setTenants(Array.isArray(tenantPayload) ? tenantPayload : (tenantPayload.items ?? []));
      setHealth(healthPayload);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'gagal memuat dashboard platform');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const counts = useMemo(() => {
    const rows = devices ?? [];
    return {
      total: rows.length,
      active: rows.filter((device) => ['ACTIVE', 'PAIRED', 'ONLINE'].includes(device.status?.toUpperCase())).length,
      provisioning: rows.filter((device) => device.status?.toUpperCase() === 'PROVISIONING').length,
    };
  }, [devices]);

  const serviceRows = [
    { name: 'API readiness', check: health?.status === 'ready' ? { status: 'up' as const } : { status: 'down' as const, reason: health?.error } },
    { name: 'PostgreSQL', check: health?.checks?.postgres },
    { name: 'Redis', check: health?.checks?.redis },
    { name: 'MQTT Broker', check: health?.checks?.mqtt },
  ];

  const loading = devices === null || tenants === null;

  return (
    <SuperAdminShell
      title="Dashboard"
      subtitle="Ringkasan lintas tenant · Enterprise Console"
      active="/super/dashboard"
    >
      {error ? (
        <p role="alert" className="mb-4 rounded-xl border border-red-500/25 bg-red-500/5 px-4 py-2.5 text-[13px] text-red-300">
          {error}
        </p>
      ) : null}

      {loading ? (
        <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[0, 1, 2, 3].map((index) => (
            <SkeletonCard key={index} />
          ))}
        </div>
      ) : (
        <FadeIn>
          <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatTile
              label="Tenant"
              value={tenants?.length ?? 0}
              icon={Building2}
              accent="from-violet-400 to-indigo-500"
              sub="directory platform"
            />
            <StatTile
              label="Total Perangkat"
              value={counts.total}
              icon={RadioTower}
              accent="from-teal-400 to-emerald-500"
              sub="lintas tenant"
            />
            <StatTile
              label="Aktif / Paired"
              value={counts.active}
              icon={Activity}
              accent="from-emerald-400 to-green-500"
              sub="status perangkat"
            />
            <StatTile
              label="Provisioning"
              value={counts.provisioning}
              icon={Clock}
              accent="from-amber-400 to-orange-500"
              sub="menunggu pairing"
            />
          </div>
        </FadeIn>
      )}

      <div className="grid gap-5 lg:grid-cols-3">
        <FadeIn delay={80}>
          <div className={`rounded-2xl border border-slate-800/80 bg-[#111c2e] p-6 lg:col-span-2 ${shadow.card}`}>
            <h3 className="m-0 text-[16px] font-bold tracking-tight text-white">Akses Cepat</h3>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {QUICK_LINKS.map((link) => {
                const Icon = link.icon;
                return (
                  <a
                    key={link.label}
                    href={link.href}
                    className="group flex flex-col items-start gap-2.5 rounded-xl border border-slate-800/70 bg-slate-900/40 px-4 py-3.5 transition-all duration-200 ease-out hover:-translate-y-1 hover:border-teal-500/40 hover:bg-teal-500/[.06] hover:shadow-lg hover:shadow-teal-500/10"
                  >
                    <span className="grid h-8 w-8 place-items-center rounded-lg bg-slate-800/80 text-slate-400 transition-colors group-hover:bg-teal-500/15 group-hover:text-teal-300">
                      <Icon className="h-4 w-4" strokeWidth={1.9} />
                    </span>
                    <span className="text-[12.5px] font-semibold text-slate-300 group-hover:text-white">{link.label}</span>
                  </a>
                );
              })}
            </div>
          </div>
        </FadeIn>

        <FadeIn delay={140}>
          <div className={`rounded-2xl border border-slate-800/80 bg-[#111c2e] p-6 ${shadow.card}`}>
            <div className="mb-4 flex items-center justify-between gap-3">
              <h3 className="m-0 text-[16px] font-bold tracking-tight text-white">System Health</h3>
              <button type="button" onClick={() => void load()} className="text-[11.5px] font-bold text-teal-400 hover:text-teal-300">
                Refresh
              </button>
            </div>
            <div className="space-y-2.5">
              {serviceRows.map(({ name, check }) => {
                const up = check?.status === 'up';
                return (
                  <div key={name} className="flex items-center justify-between rounded-lg border border-slate-800/60 bg-slate-900/50 px-4 py-2.5">
                    <span className="flex items-center gap-2 text-[13px] font-medium text-slate-200">
                      <HeartPulse className={`h-3.5 w-3.5 ${up ? 'text-emerald-400/80' : 'text-red-400/80'}`} strokeWidth={2} />
                      {name}
                    </span>
                    <span className={`text-[11px] font-bold ${up ? 'text-emerald-400' : 'text-red-400'}`}>
                      {healthLabel(check)}
                      {typeof check?.latencyMs === 'number' ? ` · ${check.latencyMs}ms` : ''}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </FadeIn>
      </div>

      <FadeIn delay={200}>
        <div className="mt-6">
          <SuperPage>
            <h3 className="m-0 mb-1 text-[16px] font-bold tracking-tight text-white">
              Perangkat Lintas Tenant
            </h3>
            <p className="mb-4 mt-0 text-[12.5px] text-slate-500">
              Platform-scoped directory; tidak bergantung pada tenant aktif.
            </p>
            <EnterpriseTable<DeviceRow>
              rows={devices ?? []}
              searchPlaceholder="Cari nama, tipe, atau tenant…"
              columns={[
                {
                  key: 'name',
                  header: 'NAMA',
                  render: (row) => <span className="font-semibold text-slate-100">{row.name}</span>,
                },
                { key: 'tenantName', header: 'TENANT', render: (row) => row.tenantName ?? '—' },
                { key: 'type', header: 'TIPE' },
                {
                  key: 'status',
                  header: 'STATUS',
                  render: (row) => <StatusPill status={row.status} />,
                },
                {
                  key: 'lastHeartbeatAt',
                  header: 'HEARTBEAT',
                  render: (row) =>
                    row.lastHeartbeatAt
                      ? new Date(row.lastHeartbeatAt).toLocaleString('id-ID')
                      : '—',
                },
              ]}
            />
          </SuperPage>
        </div>
      </FadeIn>
    </SuperAdminShell>
  );
}

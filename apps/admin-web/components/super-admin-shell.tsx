'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu } from 'lucide-react';
import { SuperLogoutButton } from '@/components/super-logout-button';
import { useAdminSessionRole } from '@/components/use-admin-session-role';
import { ShieldAlert } from 'lucide-react';
import {
  LayoutDashboard,
  Building2,
  Users,
  RadioTower,
  TrendingUp,
  Globe,
  MonitorSmartphone,
  ShieldCheck,
  BellRing,
  Bot,
  Settings,
  Hexagon,
  type LucideIcon,
} from 'lucide-react';

/**
 * UI v4 (polish pass) — Enterprise Super Admin shell.
 * Blueprint: docs/UI-BLUEPRINT-ENTERPRISE.md §1 (Super Admin Platform).
 * Polish: lucide icons, layered shadows, hover transitions, page fade-in.
 */

interface NavChild {
  href: string;
  label: string;
}
interface NavGroup {
  label: string;
  icon: LucideIcon;
  children?: NavChild[];
  direct?: string;
}

const SUPER_NAV: NavGroup[] = [
  { label: 'Dashboard', icon: LayoutDashboard, direct: '/super/dashboard' },
  {
    label: 'Tenant Management',
    icon: Building2,
    children: [
      { href: '/super/tenants', label: 'Tenants' },
      { href: '/super/subscriptions', label: 'Subscriptions' },
      { href: '/super/quotas', label: 'Quotas' },
      { href: '/super/billing', label: 'Billing' },
    ],
  },
  {
    label: 'User Management',
    icon: Users,
    children: [
      { href: '/super/users', label: 'Users' },
      { href: '/super/roles', label: 'Roles' },
      { href: '/super/api-keys', label: 'API Keys' },
    ],
  },
  {
    label: 'Device Management',
    icon: RadioTower,
    children: [
      { href: '/super/devices', label: 'Devices' },
      { href: '/super/device-groups', label: 'Device Groups' },
      { href: '/super/provisioning', label: 'Provisioning' },
      { href: '/super/credentials', label: 'Credentials' },
      { href: '/super/firmware', label: 'Firmware & OTA' },
      { href: '/super/capabilities', label: 'Capability Registry' },
    ],
  },
  { label: 'Telemetry Center', icon: TrendingUp, direct: '/super/telemetry' },
  { label: 'Command Monitor', icon: RadioTower, direct: '/super/commands' },
  { label: 'MQTT Center', icon: Globe, direct: '/super/mqtt' },
  { label: 'Monitoring', icon: MonitorSmartphone, direct: '/super/monitoring' },
  { label: 'Alerts', icon: BellRing, direct: '/super/alerts' },
  { label: 'Security & Audit', icon: ShieldCheck, direct: '/super/security' },
  { label: 'AI Center', icon: Bot, direct: '/super/ai' },
  { label: 'Reports', icon: TrendingUp, direct: '/super/reports' },
  { label: 'Settings', icon: Settings, direct: '/super/settings' },
];

function isActiveRoute(currentPath: string | undefined, href: string | undefined): boolean {
  if (!currentPath || !href) return false;
  return currentPath === href || currentPath.startsWith(`${href}/`);
}

export function SuperAdminShell({
  title,
  subtitle,
  active,
  children,
}: {
  title: string;
  subtitle?: string;
  active?: string;
  children: ReactNode;
}) {
  const role = useAdminSessionRole();
  const pathname = usePathname();
  const activePath = active ?? pathname;
  const [drawerOpen, setDrawerOpen] = useState(false);

  if (role === undefined) {
    return <div className="min-h-screen bg-[#0b1120]" />;
  }

  if (role !== 'PLATFORM_ADMIN') {
    return (
      <div className="grid min-h-screen place-items-center bg-[#0b1120] px-6 text-slate-200">
        <div className="w-full max-w-md rounded-2xl border border-red-500/20 bg-[#111c2e] p-8 text-center">
          <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full bg-red-500/10">
            <ShieldAlert className="h-6 w-6 text-red-400" strokeWidth={2} />
          </div>
          <h1 className="m-0 text-xl font-extrabold text-white">
            Akses ditolak
          </h1>
          <p className="mt-2 text-[13.5px] leading-relaxed text-slate-400">
            Halaman ini khusus Platform Admin. Akun Anda tidak memiliki peran
            PLATFORM_ADMIN.
          </p>
          <a
            href="/tenant/dashboard"
            className="mt-6 inline-block rounded-xl bg-teal-500 px-5 py-2.5 text-[13px] font-bold text-white transition-all hover:brightness-110"
          >
            Kembali ke konsol tenant
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-[#0b1120] text-slate-200">
      {drawerOpen ? (
        <button
          type="button"
          aria-label="Tutup menu"
          onClick={() => setDrawerOpen(false)}
          className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm md:hidden"
        />
      ) : null}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex h-screen w-[248px] shrink-0 flex-col overflow-y-auto border-r border-slate-800/80 bg-[#0a0f1c] px-3 py-5 shadow-[8px_0_32px_-24px_rgba(0,0,0,.8)] transition-transform duration-200 md:sticky md:top-0 md:translate-x-0 ${
          drawerOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
          <Link
            href="/super/dashboard"
            className="mb-5 flex items-center gap-2.5 px-2 transition-opacity hover:opacity-90"
            onClick={() => setDrawerOpen(false)}
          >
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-teal-400 to-emerald-600 shadow-lg shadow-emerald-500/25">
              <Hexagon className="h-4.5 w-4.5 text-white" strokeWidth={2.5} fill="currentColor" />
            </div>
            <div>
              <div className="text-[12px] font-extrabold tracking-wide text-teal-300">
                IOT PLATFORM
              </div>
              <div className="text-[10px] text-slate-500">Enterprise Console</div>
            </div>
          </Link>

        <div className="mb-3 rounded-xl border border-white/[.06] bg-white/[.04] px-3 py-2.5">
          <span className="flex items-center gap-1.5 text-[11px] font-bold tracking-wider text-amber-400">
            <ShieldCheck className="h-3.5 w-3.5" strokeWidth={2} />
            SUPER ADMIN
          </span>
        </div>

        {SUPER_NAV.map((group) => {
          const GroupIcon = group.icon;
          return (
            <div key={group.label} className="mb-1">
              {group.children ? (
                <>
                  <div className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-[13px] font-semibold text-slate-300">
                    <GroupIcon className="h-4 w-4 text-slate-400" strokeWidth={1.8} />
                    {group.label}
                  </div>
                  <div className="ml-5 border-l border-slate-800 pl-2">
                    {group.children.map((child) => (
                      <Link
                        key={child.href}
                        href={child.href}
                        onClick={() => setDrawerOpen(false)}
                        className={`block rounded-lg px-3 py-[7px] text-[12.5px] transition-all duration-150 ${
                          isActiveRoute(activePath, child.href)
                            ? 'bg-teal-500/[.14] font-semibold text-teal-300'
                            : 'text-slate-500 hover:translate-x-0.5 hover:bg-white/[.05] hover:text-slate-200'
                        }`}
                      >
                        {child.label}
                      </Link>
                    ))}
                  </div>
                </>
              ) : (
                <Link
                  href={group.direct ?? '#'}
                  onClick={() => setDrawerOpen(false)}
                  className={`flex items-center gap-2.5 rounded-xl px-3 py-2 text-[13px] font-semibold transition-all duration-150 ${
                    isActiveRoute(activePath, group.direct)
                      ? 'bg-teal-500/[.14] text-teal-300'
                      : 'text-slate-300 hover:bg-white/[.05]'
                  }`}
                >
                  <GroupIcon
                    className={`h-4 w-4 ${isActiveRoute(activePath, group.direct) ? 'text-teal-300' : 'text-slate-400'}`}
                    strokeWidth={1.8}
                  />
                  {group.label}
                </Link>
              )}
            </div>
          );
        })}

        <div className="mt-auto border-t border-slate-800/80 px-3 pt-4">
          <div className="mb-3 flex items-center gap-2 text-[11px] font-medium text-slate-500">
            <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,.8)]" />
            v1.0 · Enterprise
          </div>
          <SuperLogoutButton />
        </div>
      </aside>

      <main className="min-w-0 flex-1 px-4 py-5 sm:px-8 sm:py-7">
        <div className="mb-6 flex items-center gap-3 md:hidden">
          <button
            type="button"
            aria-label="Buka menu"
            onClick={() => setDrawerOpen(true)}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-slate-800 bg-white/[.04] text-slate-300 transition-colors hover:bg-white/[.08]"
          >
            <Menu className="h-5 w-5" strokeWidth={2} />
          </button>
          <h1 className="m-0 min-w-0 truncate text-[18px] font-extrabold tracking-tight text-white">
            {title}
          </h1>
        </div>
        <div className="mb-7 hidden md:block">
          <h1 className="m-0 text-[26px] font-extrabold tracking-tight text-white">
            {title}
          </h1>
          {subtitle ? (
            <p className="mt-1 mb-0 text-sm text-slate-400">{subtitle}</p>
          ) : null}
        </div>
        <div className="animate-in fade-in slide-in-from-bottom-2 duration-200 ease-out">
          {children}
        </div>
      </main>
    </div>
  );
}

/** Shared page-card wrapper for super admin pages. */
export function SuperPage({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-800/80 bg-[#111c2e] p-6 shadow-[0_1px_2px_rgba(0,0,0,.4),0_12px_40px_-12px_rgba(0,0,0,.6)]">
      {children}
    </div>
  );
}

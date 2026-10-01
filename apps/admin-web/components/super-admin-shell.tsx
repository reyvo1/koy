'use client';

import type { ReactNode } from 'react';
import {
  LayoutDashboard,
  Building2,
  Users,
  RadioTower,
  TrendingUp,
  Globe,
  ShieldCheck,
  BellRing,
  Bot,
  Settings,
  Activity,
  MonitorSmartphone,
  type LucideIcon,
} from 'lucide-react';
import { AppShell, RoleGate, type AppShellNavGroup } from '@/components/app-shell';
import { useAdminSessionRole } from '@/components/use-admin-session-role';

/**
 * Super Admin (platform) console shell.
 *
 * Shares the whole frame with the tenant console via AppShell; only the navigation model and
 * the PLATFORM_ADMIN gate are platform-specific. The two consoles previously shipped different
 * sidebars, different collapse behaviour and different page widths, which made one product
 * look like two.
 *
 * Blueprint: docs/UI-BLUEPRINT-ENTERPRISE.md §1 (Super Admin Platform).
 */

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const SUPER_NAV: NavGroup[] = [
  {
    // Label must stay unique across groups: AppShell keys each group by its label, and a
    // duplicate made React drop one of the two from the reconciliation tree.
    label: 'Overview',
    items: [{ href: '/super/dashboard', label: 'Dashboard', icon: LayoutDashboard }],
  },
  {
    label: 'Tenant Management',
    items: [
      { href: '/super/tenants', label: 'Tenants', icon: Building2 },
      { href: '/super/subscriptions', label: 'Subscriptions', icon: TrendingUp },
      { href: '/super/quotas', label: 'Quotas', icon: ShieldCheck },
      { href: '/super/billing', label: 'Billing', icon: TrendingUp },
    ],
  },
  {
    label: 'User Management',
    items: [
      { href: '/super/users', label: 'Users', icon: Users },
      { href: '/super/roles', label: 'Roles', icon: ShieldCheck },
      { href: '/super/api-keys', label: 'API Keys', icon: ShieldCheck },
    ],
  },
  {
    label: 'Device Management',
    items: [
      { href: '/super/devices', label: 'Devices', icon: RadioTower },
      { href: '/super/device-groups', label: 'Device Groups', icon: RadioTower },
      { href: '/super/provisioning', label: 'Provisioning', icon: RadioTower },
      { href: '/super/credentials', label: 'Credentials', icon: ShieldCheck },
      { href: '/super/firmware', label: 'Firmware & OTA', icon: RadioTower },
      { href: '/super/capabilities', label: 'Capability Registry', icon: RadioTower },
    ],
  },
  {
    label: 'Observability',
    items: [
      { href: '/super/telemetry', label: 'Telemetry Center', icon: TrendingUp },
      { href: '/super/commands', label: 'Command Monitor', icon: RadioTower },
      { href: '/super/mqtt', label: 'MQTT Center', icon: Globe },
      { href: '/super/monitoring', label: 'Monitoring', icon: Activity },
      { href: '/super/alerts', label: 'Alerts', icon: BellRing },
    ],
  },
  {
    label: 'Intelligence',
    items: [
      { href: '/super/ai', label: 'AI Center', icon: Bot },
      { href: '/super/reports', label: 'Reports', icon: TrendingUp },
    ],
  },
  {
    label: 'Platform',
    items: [
      { href: '/super/settings', label: 'Settings', icon: Settings },
      { href: '/super/security', label: 'Security & Audit', icon: ShieldCheck },
    ],
  },
  {
    // docs/UI-ROUTE-MAP.md marks /noc QUARANTINE: the global dashboard tiles and live stream
    // read real platform state, but the world-map/location contract is incomplete, so this
    // is not canonical platform navigation. It is reachable from exactly one clearly
    // labelled group instead of being a fully built page that only a typed URL can open.
    label: 'Beta · belum produksi',
    items: [{ href: '/noc', label: 'NOC / Control Room', icon: MonitorSmartphone }],
  },
];

const NAV: AppShellNavGroup[] = SUPER_NAV.map((group) => ({
  label: group.label,
  items: group.items,
}));

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

  if (role === undefined) {
    return <RoleGate state="loading" title="" description="" />;
  }

  if (role !== 'PLATFORM_ADMIN') {
    return (
      <RoleGate
        state="denied"
        title="Akses ditolak"
        description="Halaman ini khusus Platform Admin. Akun Anda tidak memiliki peran PLATFORM_ADMIN."
      />
    );
  }

  return (
    <AppShell
      groups={NAV}
      active={active}
      title={title}
      subtitle={subtitle}
      surfaceName="Platform Console"
      roleLabel="Super Admin"
      homeHref="/super/dashboard"
      footer={
        <div className="mb-2 flex items-center gap-2 px-3 text-[var(--iot-text-xs)] font-medium text-[var(--iot-color-subtle)]">
          <span
            aria-hidden="true"
            className="h-2 w-2 rounded-full bg-[var(--iot-color-success)]"
          />
          v1.0 · Enterprise
        </div>
      }
    >
      {children}
    </AppShell>
  );
}

/** Shared page-card wrapper for super admin pages. */
export function SuperPage({ children }: { children: ReactNode }) {
  return <div className="iot-panel">{children}</div>;
}

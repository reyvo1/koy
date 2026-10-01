'use client';

import type { ReactNode } from 'react';
import {
  LayoutDashboard,
  RadioTower,
  Boxes,
  Sofa,
  Building2,
  MapPin,
  Activity,
  LineChart,
  History,
  Zap,
  Bot,
  Clapperboard,
  Clock,
  Bell,
  FileText,
  Users,
  KeyRound,
  Webhook,
  Send,
} from 'lucide-react';
import { AppShell, RoleGate, type AppShellNavGroup } from '@/components/app-shell';
import { useAdminSessionRole } from '@/components/use-admin-session-role';

/**
 * Tenant Admin console shell.
 *
 * The frame (rail, collapse, mobile drawer, page header) now lives in AppShell, shared with
 * the Super Admin console. This file keeps only what is genuinely tenant-specific: the
 * navigation model and the role gate. Adding a change to the console chrome therefore
 * applies to both roles at once instead of drifting apart.
 */

const NAV_GROUPS: AppShellNavGroup[] = [
  {
    label: 'Operasional',
    items: [
      { href: '/tenant/dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { href: '/tenant/perangkat', label: 'Perangkat', icon: RadioTower },
      { href: '/tenant/grup-perangkat', label: 'Grup Perangkat', icon: Boxes },
      { href: '/tenant/ruangan', label: 'Ruangan', icon: Sofa },
      { href: '/tenant/gedung', label: 'Gedung', icon: Building2 },
      { href: '/tenant/lokasi', label: 'Lokasi', icon: MapPin },
    ],
  },
  {
    label: 'Monitoring',
    items: [
      { href: '/tenant/realtime', label: 'Realtime', icon: Activity },
      { href: '/tenant/grafik', label: 'Grafik', icon: LineChart },
      { href: '/tenant/historis', label: 'Historis', icon: History },
    ],
  },
  {
    label: 'Otomasi',
    items: [
      { href: '/tenant/perintah', label: 'Perintah', icon: Zap },
      { href: '/tenant/otomatisasi', label: 'Otomatisasi', icon: Bot },
      { href: '/tenant/scenes', label: 'Scene', icon: Clapperboard },
      { href: '/tenant/schedules', label: 'Jadwal', icon: Clock },
    ],
  },
  {
    label: 'Administrasi',
    items: [
      { href: '/tenant/workspace', label: 'Workspace', icon: LayoutDashboard },
      { href: '/tenant/temuan', label: 'Temuan Analitik', icon: Bell },
      { href: '/tenant/notifikasi', label: 'Notifikasi', icon: Send },
      { href: '/tenant/api-keys', label: 'API Key', icon: KeyRound },
      { href: '/tenant/webhooks', label: 'Webhook', icon: Webhook },
      { href: '/tenant/organisasi', label: 'Organisasi', icon: Building2 },
      { href: '/tenant/laporan', label: 'Laporan', icon: FileText },
      { href: '/tenant/pengguna', label: 'Pengguna', icon: Users },
    ],
  },
];

export function TenantShell({
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

  // The gate is unchanged in meaning: a tenant session that is still resolving shows a
  // skeleton rather than a blank screen, and a non-admin is refused. The backend remains
  // the actual authority on authorisation.
  if (role === undefined) {
    return <RoleGate state="loading" title="" description="" />;
  }

  if (role !== 'ADMIN' && role !== 'PLATFORM_ADMIN') {
    return (
      <RoleGate
        state="denied"
        title="Akses admin tenant diperlukan"
        description="Konsol ini hanya untuk ADMIN tenant atau PLATFORM_ADMIN. Otorisasi sebenarnya tetap diverifikasi oleh backend."
      />
    );
  }

  return (
    <AppShell
      groups={NAV_GROUPS}
      active={active}
      title={title}
      subtitle={subtitle}
      surfaceName="Tenant Console"
      roleLabel="Admin Tenant"
      homeHref="/tenant/dashboard"
    >
      {children}
    </AppShell>
  );
}

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
  ShieldCheck,
  Cable,
} from 'lucide-react';
import type { AppShellNavGroup } from '@/components/app-shell';

/**
 * Canonical Tenant Console navigation.
 *
 * This is intentionally the single source of truth for every tenant-capable shell and for the
 * dashboard quick-access grid. Keeping private copies in TenantShell/AdminShellV3/dashboard caused
 * newly added production routes to disappear when an operator entered a field/lab surface.
 */
export const TENANT_NAV_GROUPS: AppShellNavGroup[] = [
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
      { href: '/tenant/audit-log', label: 'Audit', icon: ShieldCheck },
      { href: '/tenant/integrasi', label: 'Integrasi', icon: Cable },
      { href: '/tenant/api-keys', label: 'API Key', icon: KeyRound },
      { href: '/tenant/webhooks', label: 'Webhook', icon: Webhook },
      { href: '/tenant/organisasi', label: 'Organisasi', icon: Building2 },
      { href: '/tenant/laporan', label: 'Laporan', icon: FileText },
      { href: '/tenant/pengguna', label: 'Pengguna', icon: Users },
    ],
  },
];

export const TENANT_NAV_HREFS = TENANT_NAV_GROUPS.flatMap((group) =>
  group.items.map((item) => item.href),
);

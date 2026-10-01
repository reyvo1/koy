'use client';

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
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
  Wrench,
  Cctv,
  Smartphone,
} from 'lucide-react';
import { AppShell, RoleGate, type AppShellNavGroup } from '@/components/app-shell';
import { useAdminSessionRole } from '@/components/use-admin-session-role';

/**
 * Console chrome for the field/lab surfaces (technician, CCTV onboarding, mobile preview).
 *
 * These three pages previously used a separate "Compatibility View" shell: four menu entries,
 * no collapse control, no responsive breakpoint, and a sidebar that told the operator they
 * were looking at a lab page. They now render inside the same AppShell as the tenant and
 * platform consoles, so the console reads as one product whichever page opened it.
 *
 * The role gate is unchanged in meaning — ADMIN or PLATFORM_ADMIN, with the backend still the
 * actual authority on authorisation.
 */

const FIELD_NAV: AppShellNavGroup[] = [
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
      { href: '/tenant/temuan', label: 'Temuan Analitik', icon: Bell },
      { href: '/tenant/laporan', label: 'Laporan', icon: FileText },
      { href: '/tenant/pengguna', label: 'Pengguna', icon: Users },
    ],
  },
  {
    // docs/UI-ROUTE-MAP.md marks these three QUARANTINE: real source, but their product
    // contract is incomplete (no device-log endpoint, no RTSP/ONVIF streaming, no real
    // telemetry feed in the preview). They are deliberately NOT in the tenant console
    // above — canonical product navigation only carries KEEP routes. They live here in the
    // field/lab shell, under one group that says out loud they are not production, so a
    // built page is never both unreachable and indistinguishable from a finished feature.
    label: 'Laboratorium · belum produksi',
    items: [
      { href: '/technician', label: 'Teknisi', icon: Wrench },
      { href: '/cctv', label: 'CCTV', icon: Cctv },
      { href: '/mobile-preview', label: 'Pratinjau Mobile', icon: Smartphone },
    ],
  },
];

export function AdminShellV3({
  title,
  subtitle,
  email = 'admin',
  active,
  children,
}: {
  title: string;
  subtitle?: string;
  email?: string;
  active?: string;
  children: ReactNode;
}) {
  const role = useAdminSessionRole();
  const pathname = usePathname();
  const activePath = active ?? pathname;

  if (role === undefined) {
    return <RoleGate state="loading" title="" description="" />;
  }

  if (role !== 'ADMIN' && role !== 'PLATFORM_ADMIN') {
    return (
      <RoleGate
        state="denied"
        title="Akses administrator diperlukan"
        description="Halaman ini hanya tersedia untuk ADMIN tenant atau PLATFORM_ADMIN. Backend tetap menjadi otoritas izin sebenarnya."
      />
    );
  }

  return (
    <AppShell
      groups={FIELD_NAV}
      active={activePath}
      title={title}
      subtitle={subtitle}
      surfaceName="IoT Platform"
      roleLabel={email}
      homeHref="/tenant/dashboard"
    >
      {children}
    </AppShell>
  );
}

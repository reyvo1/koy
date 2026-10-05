'use client';

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { Wrench, Cctv, Smartphone } from 'lucide-react';
import { AppShell, RoleGate, type AppShellNavGroup } from '@/components/app-shell';
import { TENANT_NAV_GROUPS } from '@/lib/tenant-navigation';
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
  ...TENANT_NAV_GROUPS,
  {
    // docs/UI-ROUTE-MAP.md marks these three QUARANTINE. They remain visibly separated from
    // production routes while inheriting the complete canonical Tenant navigation above.
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

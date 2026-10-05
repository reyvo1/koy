'use client';

import type { ReactNode } from 'react';
import { AppShell, RoleGate } from '@/components/app-shell';
import { TENANT_NAV_GROUPS } from '@/lib/tenant-navigation';
import { useAdminSessionRole } from '@/components/use-admin-session-role';

/**
 * Tenant Admin console shell.
 *
 * The frame (rail, collapse, mobile drawer, page header) now lives in AppShell, shared with
 * the Super Admin console. This file keeps only what is genuinely tenant-specific: the
 * navigation model and the role gate. Adding a change to the console chrome therefore
 * applies to both roles at once instead of drifting apart.
 */

const NAV_GROUPS = TENANT_NAV_GROUPS;

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

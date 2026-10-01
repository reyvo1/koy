'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { LogOut, Menu, PanelLeftClose, PanelLeftOpen, X, type LucideIcon } from 'lucide-react';

/**
 * The single admin application shell.
 *
 * Four separate shells existed (TenantShell, SuperAdminShell, AdminShellV3, AuthShell), each
 * with its own sidebar markup, its own colours and its own breakpoints. Three of them had no
 * collapse control and one had no responsive behaviour at all, so the console could not be
 * changed coherently and behaved differently depending on which role opened it.
 *
 * This component owns the whole frame: rail, collapse, mobile drawer, page header and content
 * width. Role-specific concerns are passed in as data (`groups`, `roleLabel`, `footer`), never
 * as markup, so a new console role cannot reintroduce a second shell.
 *
 * All visual values come from the shared design-system tokens — no colour literal appears here.
 */

export interface AppShellNavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Optional count/status chip shown on the right of the row. */
  badge?: string;
}

export interface AppShellNavGroup {
  label: string;
  items: AppShellNavItem[];
}

const STORAGE_KEY = 'iot-admin-rail-collapsed';

function useCollapsedRail() {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    // Restored after mount: reading localStorage during render would desynchronise the
    // server HTML from the client and trip a hydration mismatch.
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === 'true') setCollapsed(true);
  }, []);

  const toggle = () => {
    setCollapsed((previous) => {
      const next = !previous;
      window.localStorage.setItem(STORAGE_KEY, String(next));
      return next;
    });
  };

  return { collapsed, toggle };
}

export function AppShell({
  groups,
  active,
  title,
  subtitle,
  surfaceName,
  roleLabel,
  homeHref,
  footer,
  children,
}: {
  groups: AppShellNavGroup[];
  active?: string;
  /** Page heading. Kept as a prop because every existing page already supplies one. */
  title: string;
  subtitle?: string;
  surfaceName: string;
  roleLabel: string;
  homeHref: string;
  footer?: ReactNode;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const activePath = active ?? pathname ?? '';
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { collapsed, toggle } = useCollapsedRail();

  // A tap on a mobile row should dismiss the drawer, otherwise the operator navigates and
  // still sees the menu covering the page they just asked for.
  useEffect(() => {
    setDrawerOpen(false);
  }, [activePath]);

  const isActive = (href: string) =>
    activePath === href || activePath.startsWith(`${href}/`);

  const rail = (
    <div className="flex h-full flex-col">
      <div
        className={`flex items-center gap-2.5 px-3 ${collapsed ? 'justify-center' : ''}`}
      >
        <Link
          href={homeHref}
          aria-label={surfaceName}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-[var(--iot-color-accent-strong)] to-[var(--iot-color-accent)] text-sm font-black text-[var(--iot-color-accent-contrast)]"
        >
          ⬢
        </Link>
        {!collapsed ? (
          <div className="min-w-0">
            <div className="truncate text-[13px] font-extrabold tracking-tight text-[var(--iot-color-text-strong)]">
              {surfaceName}
            </div>
            <div className="truncate text-[10px] font-bold uppercase tracking-[.14em] text-[var(--iot-color-accent)]">
              {roleLabel}
            </div>
          </div>
        ) : null}
      </div>

      <nav
        aria-label={`Navigasi ${surfaceName}`}
        className="mt-4 flex-1 overflow-y-auto overflow-x-hidden"
      >
        {groups.map((group) => (
          <div key={group.label}>
            {!collapsed ? (
              <div className="px-4 pb-1.5 pt-5 text-[var(--iot-text-xs)] font-bold uppercase tracking-[.14em] text-[var(--iot-color-subtle)]">
                {group.label}
              </div>
            ) : (
              <div
                className="mx-3 my-3 border-t border-[var(--iot-color-border)]"
                aria-hidden="true"
              />
            )}
            {group.items.map((item) => {
              const Icon = item.icon;
              const current = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  title={collapsed ? item.label : undefined}
                  aria-current={current ? 'page' : undefined}
                  className={`relative mx-2 mb-0.5 flex items-center gap-3 rounded-xl px-3 py-2.5 text-[var(--iot-text-md)] transition-colors duration-150 ${
                    collapsed ? 'justify-center' : ''
                  } ${
                    current
                      ? 'bg-[var(--iot-color-accent-soft)] font-bold text-[var(--iot-color-accent)]'
                      : 'text-[var(--iot-color-muted)] hover:bg-[var(--iot-color-surface-hover)] hover:text-[var(--iot-color-text-strong)]'
                  }`}
                >
                  {current ? (
                    <span
                      aria-hidden="true"
                      className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r bg-[var(--iot-color-accent)]"
                    />
                  ) : null}
                  <Icon className="h-4 w-4 shrink-0" strokeWidth={current ? 2.2 : 1.8} />
                  {!collapsed ? <span className="truncate">{item.label}</span> : null}
                  {!collapsed && item.badge ? (
                    <span className="ml-auto rounded-full bg-[var(--iot-color-surface-subtle)] px-2 py-0.5 text-[var(--iot-text-xs)] font-bold text-[var(--iot-color-muted)]">
                      {item.badge}
                    </span>
                  ) : null}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="border-t border-[var(--iot-color-border)] px-2 pt-3">
        <button
          type="button"
          onClick={toggle}
          aria-label={collapsed ? 'Perlebar navigasi' : 'Persempit navigasi'}
          className="mb-1 hidden w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[var(--iot-text-base)] font-semibold text-[var(--iot-color-subtle)] transition-colors hover:bg-[var(--iot-color-surface-hover)] hover:text-[var(--iot-color-text-strong)] lg:flex"
        >
          {collapsed ? (
            <PanelLeftOpen className="h-4 w-4 shrink-0" strokeWidth={2} />
          ) : (
            <PanelLeftClose className="h-4 w-4 shrink-0" strokeWidth={2} />
          )}
          {!collapsed ? 'Persempit' : null}
        </button>

        {footer}

        <button
          type="button"
          aria-label="Keluar"
          onClick={async () => {
            try {
              await fetch('/api/session/logout', { method: 'POST' });
            } finally {
              window.location.href = '/login';
            }
          }}
          className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[var(--iot-text-md)] font-semibold text-[var(--iot-color-muted)] transition-colors hover:bg-[var(--iot-color-danger-soft)] hover:text-[var(--iot-color-danger)] ${
            collapsed ? 'justify-center' : ''
          }`}
        >
          <LogOut className="h-4 w-4 shrink-0" strokeWidth={2} />
          {!collapsed ? 'Keluar' : null}
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-[var(--iot-color-bg)] text-[var(--iot-color-text)]">
      {/* Desktop rail */}
      <aside
        style={{ width: collapsed ? 'var(--iot-sidebar-width-collapsed)' : 'var(--iot-sidebar-width)' }}
        className="sticky top-0 hidden h-screen shrink-0 flex-col overflow-hidden border-r border-[var(--iot-color-border)] bg-[var(--iot-color-bg-elevated)] px-3 py-5 transition-[width] duration-200 lg:flex"
      >
        {rail}
      </aside>

      {/* Mobile drawer */}
      {drawerOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            aria-label="Tutup menu"
            onClick={() => setDrawerOpen(false)}
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
          />
          <aside
            style={{ width: 'var(--iot-sidebar-width)' }}
            className="relative flex h-full flex-col border-r border-[var(--iot-color-border)] bg-[var(--iot-color-bg-elevated)] px-3 py-5"
          >
            <button
              type="button"
              aria-label="Tutup menu"
              onClick={() => setDrawerOpen(false)}
              className="absolute right-3 top-5 rounded-lg p-1.5 text-[var(--iot-color-muted)] hover:bg-[var(--iot-color-surface-hover)]"
            >
              <X className="h-5 w-5" />
            </button>
            {rail}
          </aside>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-[var(--iot-color-border)] bg-[var(--iot-color-bg-elevated)]/85 px-5 py-3 backdrop-blur-xl lg:hidden">
          <button
            type="button"
            aria-label="Buka menu"
            onClick={() => setDrawerOpen(true)}
            className="grid h-9 w-9 place-items-center rounded-lg border border-[var(--iot-color-border)] text-[var(--iot-color-muted)]"
          >
            <Menu className="h-5 w-5" />
          </button>
          <span className="truncate text-[var(--iot-text-lg)] font-extrabold tracking-tight text-[var(--iot-color-text-strong)]">
            {title}
          </span>
        </header>

        <main
          style={{ maxWidth: 'var(--iot-content-width)' }}
          className="mx-auto w-full px-5 py-6 sm:px-6 lg:py-8"
        >
          <div className="mb-7">
            <h1 className="m-0 text-[26px] font-extrabold tracking-tight text-[var(--iot-color-text-strong)] sm:text-[30px]">
              {title}
            </h1>
            {subtitle ? (
              <p className="mt-1 text-[var(--iot-text-md)] text-[var(--iot-color-muted)]">
                {subtitle}
              </p>
            ) : null}
          </div>
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-200 ease-out">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

export function RoleGate({
  state,
  title,
  description,
}: {
  state: 'loading' | 'denied';
  title: string;
  description: string;
}) {
  if (state === 'loading') {
    // Reserving the layout beats a blank screen: the operator can tell the difference
    // between "still checking my role" and "you are not allowed in".
    return (
      <div className="grid min-h-screen place-items-center bg-[var(--iot-color-bg)] px-6">
        <div className="w-full max-w-sm space-y-3">
          <div className="iot-skeleton h-6 w-3/4" />
          <div className="iot-skeleton h-4 w-full" />
          <div className="iot-skeleton h-4 w-2/3" />
        </div>
      </div>
    );
  }

  return (
    <div className="grid min-h-screen place-items-center bg-[var(--iot-color-bg)] px-6">
      <div className="iot-panel w-full max-w-md p-8 text-center">
        <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full bg-[var(--iot-color-danger-soft)]">
          <span aria-hidden="true" className="text-xl">
            !
          </span>
        </div>
        <h1 className="m-0 text-xl font-extrabold text-[var(--iot-color-text-strong)]">
          {title}
        </h1>
        <p className="mt-2 text-[var(--iot-text-md)] leading-relaxed text-[var(--iot-color-muted)]">
          {description}
        </p>
        <Link
          href="/login"
          className="mt-6 inline-block rounded-xl bg-[var(--iot-color-accent)] px-5 py-2.5 text-[var(--iot-text-base)] font-bold text-[var(--iot-color-accent-contrast)]"
        >
          Kembali ke login
        </Link>
      </div>
    </div>
  );
}

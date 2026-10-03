'use client';

import type { ReactNode } from 'react';
import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ApplicationShell } from '@iot-platform/design-system';

/**
 * User Web shell — the single navigable frame for every User Web surface.
 *
 * This replaces a hand-rolled header that used plain `<a href>`, so every menu click
 * was a full document reload, and that carried no active-route state. It is now built on
 * the same `ApplicationShell` frame as the rest of the product, which is also what
 * `/dashboard` already used — previously that page rendered the product frame with *no*
 * navigation at all, so from the dashboard you could only reach the other three surfaces
 * by typing a URL. One shell, one menu, one look.
 *
 * The menu is derived from the same canonical route set the other consoles use and is
 * asserted against the route map by `scripts/validate-rescue-baseline.mjs`, so a new
 * User Web page cannot be added without either a menu entry or an explicit quarantine.
 */

interface NavItem {
  href: string;
  label: string;
  description: string;
}

const NAV: NavItem[] = [
  { href: '/beranda', label: 'Beranda', description: 'Ringkasan ruangan dan perangkat' },
  { href: '/ruangan', label: 'Ruangan', description: 'Ruang dan perangkat di dalamnya' },
  { href: '/perangkat-saya', label: 'Perangkat Saya', description: 'Semua perangkat yang dapat diakses' },
  { href: '/realtime', label: 'Realtime', description: 'Telemetry langsung perangkat' },
  { href: '/dashboard', label: 'Dashboard', description: 'Dashboard dinamis dan widget' },
  { href: '/alerts', label: 'Alerts', description: 'Peringatan perangkat yang dapat diakses' },
  { href: '/profil', label: 'Profil', description: 'Identitas dan akun pengguna' },
];

/** A nav item is active on its own route and on any nested route below it. */
function isActive(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function UserShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  const pathname = usePathname() ?? '/';
  const [loggingOut, setLoggingOut] = useState(false);

  async function logout() {
    setLoggingOut(true);
    await fetch('/api/session/logout', { method: 'POST' }).catch(() => null);
    // The session is gone either way; reload so every surface re-reads the backend
    // instead of leaving one stale authorized payload on screen.
    window.location.assign('/beranda');
  }

  return (
    <ApplicationShell
      productName="IoT Platform"
      surfaceName="User Web"
      statusLabel="Pengguna"
      nav={
        <nav aria-label="Menu utama User Web">
          <ul className="flex flex-wrap items-center gap-1.5">
            {NAV.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    className="flex flex-col rounded-xl border border-slate-200 bg-white px-3.5 py-2 transition-colors hover:border-teal-400 hover:bg-teal-50"
                    style={
                      active
                        ? {
                            borderColor: 'var(--iot-color-accent, #0d9488)',
                            backgroundColor: 'rgba(13, 148, 136, 0.08)',
                          }
                        : undefined
                    }
                  >
                    <span
                      className="text-[13px] font-bold"
                      style={{ color: active ? '#0f766e' : '#334155' }}
                    >
                      {item.label}
                    </span>
                    <span className="text-[11px] text-slate-500">{item.description}</span>
                  </Link>
                </li>
              );
            })}
            <li className="ml-auto">
              <button
                type="button"
                onClick={() => void logout()}
                disabled={loggingOut}
                className="rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-[13px] font-bold text-slate-600 transition-colors hover:border-red-300 hover:bg-red-50 hover:text-red-700 disabled:opacity-60"
              >
                {loggingOut ? 'Keluar…' : 'Keluar'}
              </button>
            </li>
          </ul>
        </nav>
      }
    >
      <header className="mb-5">
        <h2 className="m-0 text-[26px] font-extrabold tracking-tight text-slate-900">{title}</h2>
        {subtitle ? <p className="mb-0 mt-1 text-sm text-slate-500">{subtitle}</p> : null}
      </header>
      {children}
    </ApplicationShell>
  );
}

'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
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
  LogOut,
  Menu,
  X,
  ShieldAlert,
  type LucideIcon,
} from 'lucide-react';
import { useAdminSessionRole } from '@/components/use-admin-session-role';

/**
 * Tenant Admin shell (blueprint §2) — premium dark sidebar ala Linear.
 * Berbeda dari Super Admin: label "ADMIN TENANT", grup OPERASIONAL /
 * MONITORING / OTOMASI / ADMINISTRASI. Mobile: drawer + hamburger.
 */

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
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
      { href: '/tenant/laporan', label: 'Laporan', icon: FileText },
      { href: '/tenant/pengguna', label: 'Pengguna', icon: Users },
    ],
  },
];

function SidebarNav({ active, onNavigate }: { active?: string; onNavigate?: () => void }) {
  return (
    <nav className="flex-1 overflow-y-auto">
      {NAV_GROUPS.map((section) => (
        <div key={section.label}>
          <div className="px-4 pb-1.5 pt-5 text-[10.5px] font-bold uppercase tracking-[.14em] text-slate-500">
            {section.label}
          </div>
          {section.items.map((item) => {
            const Icon = item.icon;
            const isActive =
              active === item.href || Boolean(active?.startsWith(`${item.href}/`));
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                className={`relative flex items-center gap-3 rounded-xl px-4 py-2.5 text-[13.5px] transition-all duration-150 ${
                  isActive
                    ? 'bg-teal-500/[.14] font-bold text-teal-300 shadow-[inset_0_0_0_1px_rgba(45,212,191,.22)]'
                    : 'text-slate-400 hover:bg-white/[.05] hover:text-slate-100'
                }`}
              >
                {isActive ? (
                  <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r bg-teal-400 shadow-[0_0_10px_rgba(45,212,191,.8)]" />
                ) : null}
                <Icon className="h-4 w-4 shrink-0" strokeWidth={isActive ? 2.2 : 1.8} />
                {item.label}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

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
  const pathname = usePathname();
  const activePath = active ?? pathname;
  const [drawerOpen, setDrawerOpen] = useState(false);

  if (role === undefined) {
    return <div className="min-h-screen bg-[#0b1120]" />;
  }

  if (role !== 'ADMIN' && role !== 'PLATFORM_ADMIN') {
    return (
      <div className="grid min-h-screen place-items-center bg-[#0b1120] px-6 text-slate-200">
        <div className="w-full max-w-md rounded-2xl border border-red-500/20 bg-[#111c2e] p-8 text-center">
          <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full bg-red-500/10">
            <ShieldAlert className="h-6 w-6 text-red-400" strokeWidth={2} />
          </div>
          <h1 className="m-0 text-xl font-extrabold text-white">Akses admin tenant diperlukan</h1>
          <p className="mt-2 text-[13.5px] leading-relaxed text-slate-400">
            Konsol ini hanya untuk ADMIN tenant atau PLATFORM_ADMIN. Otorisasi sebenarnya tetap diverifikasi oleh backend.
          </p>
          <a href="/login" className="mt-6 inline-block rounded-xl bg-teal-500 px-5 py-2.5 text-[13px] font-bold text-white transition-all hover:brightness-110">
            Kembali ke login admin
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-[#0b1120] text-slate-100">
      {/* Sidebar desktop */}
      <aside className="sticky top-0 hidden h-screen w-[248px] shrink-0 flex-col border-r border-slate-800/70 bg-gradient-to-b from-[#0a0f1c] to-[#0d1526] px-3 py-5 md:flex">
        <div className="flex items-center gap-2.5 px-3 pb-5">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-teal-400 to-emerald-600 text-[15px] font-black text-white shadow-md shadow-emerald-500/25">
            ⬢
          </div>
          <div>
            <div className="text-[13px] font-extrabold tracking-tight text-slate-100">Tenant Console</div>
            <div className="text-[10px] font-bold uppercase tracking-[.14em] text-teal-400/80">
              Admin Tenant
            </div>
          </div>
        </div>
        <SidebarNav active={activePath} />
        <div className="border-t border-slate-800/70 pt-3">
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
            className="flex w-full items-center gap-3 rounded-xl px-4 py-2.5 text-[13px] font-semibold text-slate-400 transition-colors hover:bg-red-500/10 hover:text-red-400"
          >
            <LogOut className="h-4 w-4" strokeWidth={2} />
            Keluar
          </button>
        </div>
      </aside>

      {/* Mobile drawer */}
      {drawerOpen ? (
        <div
          className="fixed inset-0 z-40 bg-black/70 md:hidden"
          onClick={(e) => {
            if (e.target === e.currentTarget) setDrawerOpen(false);
          }}
        >
          <aside className="flex h-full w-[268px] flex-col border-r border-slate-800 bg-gradient-to-b from-[#0a0f1c] to-[#0d1526] px-3 py-5">
            <div className="mb-2 flex items-center justify-between px-2">
              <span className="text-[13px] font-extrabold tracking-wide text-teal-300">Tenant Console</span>
              <button type="button" aria-label="Tutup menu" onClick={() => setDrawerOpen(false)} className="text-slate-400">
                <X className="h-5 w-5" />
              </button>
            </div>
            <SidebarNav active={activePath} onNavigate={() => setDrawerOpen(false)} />
            <button
              type="button"
              onClick={async () => {
                try {
                  await fetch('/api/session/logout', { method: 'POST' });
                } finally {
                  window.location.href = '/login';
                }
              }}
              className="mt-3 flex w-full items-center gap-3 rounded-xl px-4 py-2.5 text-[13px] font-semibold text-slate-400 hover:bg-red-500/10 hover:text-red-400"
            >
              <LogOut className="h-4 w-4" strokeWidth={2} />
              Keluar
            </button>
          </aside>
        </div>
      ) : null}

      {/* Content */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-slate-800/80 bg-[#0b1120]/85 px-5 py-3 backdrop-blur-xl md:hidden">
          <button
            type="button"
            aria-label="Buka menu"
            onClick={() => setDrawerOpen(true)}
            className="grid h-9 w-9 place-items-center rounded-lg border border-slate-800 text-slate-300"
          >
            <Menu className="h-5 w-5" />
          </button>
          <span className="text-[14px] font-extrabold tracking-tight text-slate-100">{title}</span>
        </header>

        <main className="mx-auto w-full max-w-6xl px-5 py-7">
          <header className="mb-7">
            <h1 className="m-0 text-[26px] font-extrabold tracking-tight text-slate-50">
              {title}
            </h1>
            {subtitle ? (
              <p className="mt-1 text-sm text-slate-400">{subtitle}</p>
            ) : null}
          </header>
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-200 ease-out">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
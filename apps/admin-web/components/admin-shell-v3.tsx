'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ShieldAlert } from 'lucide-react';
import { useAdminSessionRole } from '@/components/use-admin-session-role';

const NAV = [
  { href: '/tenant/dashboard', label: 'Tenant Dashboard' },
  { href: '/tenant/perangkat', label: 'Perangkat' },
  { href: '/tenant/otomatisasi', label: 'Otomatisasi' },
  { href: '/tenant/temuan', label: 'Temuan Analitik' },
];

/**
 * Compatibility shell for legacy detail/lab pages. Canonical tenant pages use
 * TenantShell and platform pages use SuperAdminShell.
 */
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
    return <div className="min-h-screen bg-[#0b1120]" />;
  }

  if (role !== 'ADMIN' && role !== 'PLATFORM_ADMIN') {
    return (
      <div className="grid min-h-screen place-items-center bg-[#0b1120] px-6 text-slate-200">
        <div className="w-full max-w-md rounded-2xl border border-red-500/20 bg-[#111c2e] p-8 text-center">
          <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full bg-red-500/10">
            <ShieldAlert className="h-6 w-6 text-red-400" strokeWidth={2} />
          </div>
          <h1 className="m-0 text-xl font-extrabold text-white">Akses administrator diperlukan</h1>
          <p className="mt-2 text-[13.5px] leading-relaxed text-slate-400">
            Compatibility view hanya tersedia untuk ADMIN tenant atau PLATFORM_ADMIN. Backend tetap menjadi otoritas izin sebenarnya.
          </p>
          <a
            href="/login"
            className="mt-6 inline-block rounded-xl bg-teal-500 px-5 py-2.5 text-[13px] font-bold text-white transition-all hover:brightness-110"
          >
            Kembali ke login admin
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="on-dark flex min-h-screen bg-[#0b1120] text-slate-200">
      <aside className="sticky top-0 flex h-screen w-60 shrink-0 flex-col border-r border-slate-800/80 bg-[#0a0f1c] px-3 py-5">
        <Link href="/tenant/dashboard" className="flex items-center gap-2.5 px-2 pb-6">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-teal-400 to-emerald-600 shadow-[0_0_16px_rgba(45,212,191,.5)]" />
          <span className="text-[12px] font-extrabold tracking-[2.5px] text-teal-300">
            IOT PLATFORM
          </span>
        </Link>

        <div className="mb-4 flex items-center gap-3 rounded-xl border border-white/[.07] bg-white/[.04] px-3 py-3">
          <div className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-teal-400 to-emerald-600 text-sm font-bold text-white">
            A
          </div>
          <div className="min-w-0">
            <div className="text-[13px] font-semibold text-slate-100">Compatibility View</div>
            <div className="truncate text-[11px] text-slate-500">{email}</div>
          </div>
        </div>

        <div className="px-3 pb-2 text-[10px] font-bold uppercase tracking-widest text-slate-600">
          Jalur utama
        </div>
        {NAV.map((item) => {
          const isActive =
            activePath === item.href || Boolean(activePath?.startsWith(`${item.href}/`));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`mb-0.5 flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13.5px] transition-all ${
                isActive
                  ? 'bg-teal-500/[.12] font-semibold text-teal-300 shadow-[inset_0_0_0_1px_rgba(45,212,191,.25)]'
                  : 'text-slate-400 hover:bg-white/[.05] hover:text-slate-200'
              }`}
            >
              {item.label}
            </Link>
          );
        })}

        <div className="mt-auto border-t border-slate-800/80 px-2 pt-4">
          <div className="text-[11px] leading-relaxed text-slate-500">
            Halaman ini dipertahankan untuk kompatibilitas/lab. Gunakan konsol Tenant atau Super Admin untuk alur utama.
          </div>
        </div>
      </aside>

      <main className="min-w-0 flex-1 px-8 py-7">
        <div className="mb-7 flex items-end justify-between">
          <div>
            <h1 className="m-0 text-[28px] font-extrabold tracking-tight text-white">{title}</h1>
            {subtitle ? <p className="mb-0 mt-1 text-sm text-slate-400">{subtitle}</p> : null}
          </div>
          <Link
            href="/tenant/dashboard"
            className="rounded-xl border border-slate-700/70 px-3 py-2 text-[12px] font-semibold text-slate-300 hover:border-teal-500/50 hover:text-teal-300"
          >
            Kembali ke Tenant
          </Link>
        </div>
        {children}
      </main>
    </div>
  );
}

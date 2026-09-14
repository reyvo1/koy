import type { ReactNode } from 'react';

const NAV = [
  { href: '/beranda', label: 'Beranda', icon: '🏠' },
  { href: '/perangkat-saya', label: 'Perangkat Saya', icon: '📡' },
  { href: '/ruangan', label: 'Ruangan', icon: '🛋️' },
  { href: '/dashboard', label: 'Dashboard', icon: '📊' },
];

/**
 * User Web shell (UI v3 light, room-centric per Modul 10 architecture).
 * TANPA detail infrastruktur: tidak ada MQTT/Redis/IP/vendor di sini.
 */
export function UserShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-teal-400 to-emerald-600 text-sm font-black text-white">
              ⬢
            </div>
            <span className="text-[14px] font-bold text-slate-700">IoT Platform</span>
          </div>
          <nav className="flex items-center gap-1">
            {NAV.map((item) => (
              <Link2 key={item.href} href={item.href} label={item.label} icon={item.icon} />
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-5 py-7">
        <h1 className="m-0 text-[26px] font-extrabold tracking-tight text-slate-900">{title}</h1>
        {subtitle ? <p className="mt-1 mb-6 text-sm text-slate-500">{subtitle}</p> : null}
        {children}
      </main>
    </div>
  );
}

function Link2({ href, label, icon }: { href: string; label: string; icon: string }) {
  // Simple anchor — active state handled by pages if needed.
  return (
    <a href={href}
      className="rounded-lg px-3 py-1.5 text-[13px] font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700">
      <span className="mr-1">{icon}</span>
      {label}
    </a>
  );
}

'use client';

import { LogOut } from 'lucide-react';

export function SuperLogoutButton() {
  return (
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
      className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border border-slate-800 bg-white/[.03] px-3 py-2.5 text-[12.5px] font-semibold text-slate-400 transition-all hover:border-red-500/30 hover:bg-red-500/[.08] hover:text-red-400"
    >
      <LogOut className="h-4 w-4" strokeWidth={2} />
      Keluar
    </button>
  );
}

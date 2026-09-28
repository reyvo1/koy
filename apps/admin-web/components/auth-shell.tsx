'use client';

import { useRouter } from 'next/navigation';

/**
 * Shared chrome for the self-service auth pages (register, forgot password, reset
 * password). Kept as a component rather than exported from a page file, because the App
 * Router only permits `default` and framework exports from `page.tsx`.
 */
export function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  const router = useRouter();

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0b1120] px-6">
      <div className="w-full max-w-md">
        <div className="mb-8 flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-teal-400 to-emerald-600" />
          <span className="text-sm font-extrabold tracking-widest text-teal-300">
            IOT PLATFORM
          </span>
        </div>

        <p className="m-0 text-[13px] font-bold tracking-widest text-teal-400">
          {subtitle}
        </p>
        <h1 className="mt-2 mb-6 text-[28px] font-extrabold text-white">{title}</h1>

        {children}

        <button
          type="button"
          onClick={() => router.back()}
          className="mt-6 w-full text-center text-[12px] text-slate-600 hover:text-slate-400"
        >
          ← Kembali
        </button>
      </div>
    </div>
  );
}

export function AuthAlert({
  kind,
  message,
}: {
  kind: 'error' | 'ok';
  message: string;
}) {
  if (kind === 'error') {
    return (
      <p
        role="alert"
        className="rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-[13px] text-red-400"
      >
        {message}
      </p>
    );
  }
  return (
    <p
      role="status"
      className="rounded-xl border border-teal-500/25 bg-teal-500/10 px-4 py-3 text-[13px] text-teal-300"
    >
      {message}
    </p>
  );
}

'use client';

/**
 * UI Polish foundation — shared primitives for the Linear/Vercel-grade pass.
 * Shadow tokens, micro-animations, skeleton shimmer, empty states, toasts.
 */

import {
  ReactNode,
  useEffect,
  useState,
  createContext,
  useCallback,
  useContext,
} from 'react';
import { LucideIcon } from 'lucide-react';

/* ---------------- Shadow tokens (UI-DESIGN-SYSTEM.md compliant) ---------- */

/**
 * Depth is owned by the design-system tokens; these helpers exist only so the nine call
 * sites that still reference them keep working. New surfaces should use `.iot-panel` (or the
 * `--iot-shadow-*` variables directly) instead of carrying a shadow literal in a class
 * string, because a literal cannot follow a palette or theme change.
 */
export const shadow = {
  card: 'shadow-[var(--iot-shadow-surface)]',
  cardHover: 'hover:shadow-[var(--iot-shadow-raised)]',
  overlay: 'shadow-[0_24px_64px_-12px_rgba(2,6,23,.85)]',
};

/* ---------------- Page fade-in (150ms ease-out) --------------------------- */

export function FadeIn({
  children,
  delay = 0,
}: {
  children: ReactNode;
  delay?: number;
}) {
  return (
    <div
      style={{ animationDelay: `${delay}ms` }}
      className="animate-in fade-in slide-in-from-bottom-1 duration-200 ease-out fill-mode-both"
    >
      {children}
    </div>
  );
}

/* ---------------- Count-up statistic -------------------------------------- */

export function CountUp({
  value,
  durationMs = 700,
  suffix = '',
}: {
  value: number;
  durationMs?: number;
  suffix?: string;
}) {
  const [display, setDisplay] = useState(value);

  // Animate whenever `value` changes. An earlier "already started" ref guard was wrong
  // under React StrictMode: the mount effect was cleaned up and re-run, the guard then
  // short-circuited the second run, and the counter stayed frozen at its initial value.
  // The dashboard therefore reported "Perangkat 0" while the API had already returned the
  // real count. Restarting the animation per value is both correct and StrictMode-safe.
  useEffect(() => {
    setDisplay(value);
    if (value === 0) return;

    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(value * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, durationMs]);

  return (
    <span>
      {display.toLocaleString('id-ID')}
      {suffix}
    </span>
  );
}

/* ---------------- Skeleton shimmer ---------------------------------------- */

/*
 * Skeletons use the shared `.iot-skeleton` token rather than a local `animate-pulse
 * bg-slate-700/50`, so a loading placeholder looks identical to the loaded surface it will
 * become. 53 of 56 admin pages previously rendered nothing at all while their fetch was in
 * flight, which read as a broken page rather than a loading one.
 */
export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`iot-skeleton ${className}`} aria-hidden />;
}

export function SkeletonCard() {
  return (
    <div className="iot-panel">
      <div className="flex items-center justify-between">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-5 w-5 rounded-full" />
      </div>
      <Skeleton className="mt-3 h-8 w-16" />
      <Skeleton className="mt-4 h-3 w-full" />
      <Skeleton className="mt-2 h-3 w-3/4" />
    </div>
  );
}

/** Placeholder for a stat row — use whenever a KPI's value is still unknown. */
export function SkeletonStats({ count = 4 }: { count?: number }) {
  return (
    <div className="iot2-stats">
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="iot2-stat">
          <Skeleton className="h-8 w-8 rounded-lg" />
          <Skeleton className="mt-3 h-3 w-20" />
          <Skeleton className="mt-2 h-8 w-14" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonTable({ rows = 5 }: { rows?: number }) {
  return (
    <div className="iot-panel--flush iot-panel">
      <div className="border-b border-[var(--iot-color-border)] p-4">
        <Skeleton className="h-4 w-40" />
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-4 border-b border-[var(--iot-color-border)] px-4 py-3.5 last:border-0"
        >
          <Skeleton className="h-9 w-9 rounded-xl" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-1/3" />
            <Skeleton className="h-3 w-1/5" />
          </div>
          <Skeleton className="h-6 w-20 rounded-full" />
        </div>
      ))}
    </div>
  );
}

/* ---------------- Empty state --------------------------------------------- */

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: { label: string; onClick?: () => void; href?: string };
}) {
  return (
    <div className="iot-empty">
      <div className="grid h-14 w-14 place-items-center rounded-2xl bg-[var(--iot-color-surface-subtle)]">
        <Icon
          className="h-7 w-7 text-[var(--iot-color-subtle)]"
          strokeWidth={1.5}
        />
      </div>
      <h3 className="iot-empty__title mt-2">{title}</h3>
      <p className="iot-empty__body">{description}</p>
      {action ? (
        <a
          href={action.href ?? '#'}
          onClick={action.onClick}
          className="iot-button mt-3"
        >
          {action.label}
        </a>
      ) : null}
    </div>
  );
}

/* ---------------- Toast system (slide-in from right) ----------------------- */

type ToastKind = 'success' | 'error' | 'info';

interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
}

const ToastContext = createContext<{
  push: (kind: ToastKind, message: string) => void;
}>({ push: () => {} });

let toastSeq = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const push = useCallback((kind: ToastKind, message: string) => {
    const id = toastSeq++;
    setItems((prev) => [...prev, { id, kind, message }]);
    setTimeout(() => {
      setItems((prev) => prev.filter((t) => t.id !== id));
    }, 4200);
  }, []);

  return (
    <ToastContext.Provider value={{ push }}>
      {children}
      <div className="pointer-events-none fixed bottom-5 right-5 z-50 flex w-80 flex-col gap-2.5">
        {items.map((t) => (
          <div
            key={t.id}
            role="status"
            className={`pointer-events-auto flex items-start gap-3 rounded-xl border border-slate-700/70 bg-[#111c2e]/95 p-4 backdrop-blur animate-in fade-in slide-in-from-right-4 duration-200 ease-out ${shadow.overlay}`}
          >
            <span
              className={`mt-1 h-2 w-2 shrink-0 rounded-full ${
                t.kind === 'success'
                  ? 'bg-emerald-500'
                  : t.kind === 'error'
                    ? 'bg-red-500'
                    : 'bg-sky-500'
              }`}
            />
            <p className="m-0 text-[13px] font-medium leading-snug text-slate-200">
              {t.message}
            </p>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}

/* ---------------- Status dot + icon pill ----------------------------------- */

export function StatusPill({
  tone,
  icon: Icon,
  label,
}: {
  tone: 'online' | 'offline' | 'warn' | 'neutral';
  icon?: LucideIcon;
  label: string;
}) {
  const tones = {
    online: 'bg-emerald-500/10 text-emerald-400 ring-emerald-500/25',
    offline: 'bg-slate-500/10 text-slate-400 ring-slate-400/20',
    warn: 'bg-amber-500/10 text-amber-400 ring-amber-500/25',
    neutral: 'bg-sky-500/10 text-sky-400 ring-sky-500/25',
  } as const;
  const dots = {
    online: 'bg-emerald-500',
    offline: 'bg-slate-400',
    warn: 'bg-amber-500',
    neutral: 'bg-sky-500',
  } as const;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-semibold ring-1 ring-inset ${tones[tone]}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${dots[tone]} ${tone === 'online' ? 'animate-pulse' : ''}`} />
      {Icon && <Icon className="h-3.5 w-3.5" strokeWidth={2} />}
      {label}
    </span>
  );
}

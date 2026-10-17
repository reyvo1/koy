'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { RefreshCw, LogOut, ChevronRight, RadioTower } from 'lucide-react';
import { StateNotice } from '@iot-platform/design-system';
import type {
  AdminOperationalSummary,
  ClientErrorPayload,
} from '../lib/contracts';
import {
  isOperationalSummaryEmpty,
  isOperationalSummaryStale,
} from '../lib/operational-summary-state';
import { AdminLoginForm } from './admin-login-form';
import { TENANT_NAV_GROUPS } from '@/lib/tenant-navigation';
import {
  formatTimestamp,
  OperationalSummaryDashboard,
} from './operational-summary-dashboard';

type ViewState =
  | { kind: 'loading' }
  | { kind: 'unauthorized' }
  | { kind: 'offline'; message: string }
  | { kind: 'error'; message: string; requestId: string | null }
  | { kind: 'ready'; summary: AdminOperationalSummary };

/** Full product navigation — derived from the same canonical model as TenantShell. */
const NAV_SECTIONS = TENANT_NAV_GROUPS;

function NavigationSidebar() {
  return (
    <nav
      aria-label="Navigasi utama"
      className="iot-nav-grid mb-8 grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-4"
    >
      {NAV_SECTIONS.map((section) => (
        <div
          key={section.label}
          className="rounded-2xl border border-slate-800/80 bg-[#111c2e] p-4 shadow-[0_1px_2px_rgba(2,6,23,.5),0_8px_24px_-8px_rgba(2,6,23,.6)]"
        >
          <p className="m-0 mb-2 text-[10.5px] font-bold uppercase tracking-widest text-slate-500">
            {section.label}
          </p>
          <ul className="m-0 space-y-1 p-0">
            {section.items.map((item) => {
              const Icon = item.icon;
              return (
                <li key={item.href}>
                  <Link
                    className="group flex items-center gap-2 rounded-lg px-2 py-1.5 text-[12.5px] font-semibold text-slate-300 transition-all duration-150 hover:translate-x-0.5 hover:bg-teal-500/10 hover:text-teal-300"
                    href={item.href}
                  >
                    <Icon className="h-3.5 w-4 text-slate-500 transition-colors group-hover:text-teal-400" strokeWidth={1.9} />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

export function OperationalSummaryExperience() {
  const [state, setState] = useState<ViewState>({ kind: 'loading' });

  const load = useCallback(async () => {
    setState({ kind: 'loading' });
    try {
      const response = await fetch('/api/admin/operational-summary');
      if (response.status === 401) {
        setState({ kind: 'unauthorized' });
        return;
      }
      if (!response.ok) {
        const errorPayload = (await response
          .json()
          .catch(() => null)) as ClientErrorPayload | null;
        setState({
          kind: 'error',
          message:
            errorPayload && typeof errorPayload.message === 'string'
              ? errorPayload.message
              : `Backend merespons ${response.status}.`,
          requestId:
            errorPayload && typeof errorPayload.requestId === 'string'
              ? errorPayload.requestId
              : null,
        });
        return;
      }
      const summary = (await response.json().catch(() => { throw new Error('Backend mengembalikan respons yang tidak dapat dibaca.'); })) as AdminOperationalSummary;
      setState({
        kind: 'ready',
        summary: summary as AdminOperationalSummary,
      });
    } catch {
      setState({
        kind: 'offline',
        message: 'Admin Web saat ini tidak dapat dijangkau.',
      });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function logout() {
    await fetch('/api/session/logout', { method: 'POST' }).catch(() => null);
    setState({ kind: 'unauthorized' });
  }

  if (state.kind === 'loading') {
    return (
      <StateNotice
        description="Ringkasan tenant sedang dimuat melalui backend yang terotorisasi."
        state="loading"
        title="Memuat ringkasan operasional"
      />
    );
  }

  if (state.kind === 'unauthorized') {
    return <AdminLoginForm onAuthenticated={load} />;
  }

  if (state.kind === 'offline') {
    return (
      <StateNotice
        action={<RetryButton onRetry={load} />}
        description={state.message}
        state="offline"
        title="Layanan tidak terhubung"
      />
    );
  }

  if (state.kind === 'error') {
    return (
      <StateNotice
        action={<RetryButton onRetry={load} />}
        description={`${state.message}${state.requestId ? ` Referensi: ${state.requestId}` : ''}`}
        state="error"
        title="Ringkasan gagal dimuat"
      />
    );
  }

  const { summary } = state;

  return (
    <>
      {/* Quick access navigation to all blueprint screens */}
      <NavigationSidebar />

      <section
        aria-label="Kontrol ringkasan"
        className="mb-6 flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,.06),0_4px_16px_-4px_rgba(15,23,42,.08)]"
      >
        <div>
          <p className="iot-eyebrow">Tenant-authorized ADMIN</p>
          <h2 className="m-0 text-[18px] font-bold tracking-tight text-slate-900">
            Ringkasan operasional
          </h2>
          <p className="mb-0 mt-1 text-[13px] text-slate-500">
            Dibuat {formatTimestamp(summary.generatedAt)} · ambang stale{' '}
            {summary.staleThresholdSeconds} detik
          </p>
        </div>
        {/* UAT fix: explicit, well-separated action buttons */}
        <div className="flex shrink-0 items-center gap-3">
          <button
            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-[13px] font-bold text-slate-700 transition-all duration-150 hover:-translate-y-0.5 hover:border-teal-400 hover:text-teal-700 hover:shadow-md hover:shadow-teal-500/10"
            onClick={() => void load()}
            type="button"
          >
            <RefreshCw className="h-4 w-4" strokeWidth={2.2} />
            Perbarui
          </button>
          <button
            className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-white px-4 py-2.5 text-[13px] font-bold text-red-600 transition-all duration-150 hover:-translate-y-0.5 hover:border-red-400 hover:bg-red-50 hover:shadow-md hover:shadow-red-500/10"
            onClick={() => void logout()}
            type="button"
          >
            <LogOut className="h-4 w-4" strokeWidth={2.2} />
            Keluar
          </button>
        </div>
      </section>

      {isOperationalSummaryEmpty(summary) ? (
        <StateNotice
          description="Belum ada perangkat, capability, telemetry, atau command yang diringkas untuk tenant ini."
          state="empty"
          title="Ringkasan masih kosong"
        />
      ) : (
        <>
          {isOperationalSummaryStale(summary) ? (
            <StateNotice
              description="Satu atau lebih heartbeat atau observasi telah melewati ambang stale yang diberikan backend."
              state="stale"
              title="Data perlu diperiksa"
            />
          ) : null}
          <OperationalSummaryDashboard summary={summary} />

          {/* Clickable deep-dive from summary to full device list */}
          <Link
            className="group mt-6 flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-[0_1px_2px_rgba(15,23,42,.06),0_4px_16px_-4px_rgba(15,23,42,.08)] transition-all duration-200 ease-out hover:-translate-y-0.5 hover:border-teal-300 hover:shadow-lg hover:shadow-teal-500/10"
            href="/tenant/perangkat"
          >
            <span className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-teal-50 to-emerald-50">
                <RadioTower className="h-5 w-5 text-teal-700" strokeWidth={1.8} />
              </span>
              <span>
                <span className="block text-[14.5px] font-bold text-slate-900">
                  Lihat semua perangkat
                </span>
                <span className="block text-[12.5px] font-medium text-slate-500">
                  Daftar lengkap + filter status ({summary.devices.total} total)
                </span>
              </span>
            </span>
            <ChevronRight className="h-5 w-5 text-slate-300 transition-transform duration-200 group-hover:translate-x-1 group-hover:text-teal-500" strokeWidth={2} />
          </Link>
        </>
      )}
    </>
  );
}

function RetryButton({ onRetry }: { onRetry: () => Promise<void> }) {
  return (
    <button className="iot-button" onClick={() => void onRetry()} type="button">
      Coba lagi
    </button>
  );
}

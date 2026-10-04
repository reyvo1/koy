'use client';

/**
 * Billing content — live data via /api/super/billing
 * (backend /admin/billing/subscriptions). Fail-closed rendering.
 */

import { useCallback, useEffect, useState } from 'react';

interface Plan {
  id: string;
  tier: string;
  deviceQuota: number | null;
  telemetryRetentionDays: number | null;
  monthlyPriceCents: number | null;
}

interface Subscription {
  id: string;
  tenantId: string;
  tier: string;
  status: string;
  deviceQuota: number | null;
  monthlyPriceCents: number | null;
  currentPeriodEnd: string;
}

interface TenantOption {
  id: string;
  name: string;
}

interface UsageRow {
  tenantId: string;
  periodStart: string;
  deviceCount: number;
  telemetryPoints: number;
}

function formatPrice(cents: number | null): string {
  if (cents === null || cents === undefined) return '—';
  return `Rp${(cents / 100).toLocaleString('id-ID')}`;
}

const STATUS_STYLES: Record<string, string> = {
  ACTIVE: 'bg-emerald-500/10 text-emerald-400',
  TRIALING: 'bg-sky-500/10 text-sky-400',
  PAST_DUE: 'bg-amber-500/10 text-amber-400',
  CANCELED: 'bg-red-500/10 text-red-400',
};

export default function SuperBillingContent() {
  const [subscriptions, setSubscriptions] = useState<Subscription[] | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [tenants, setTenants] = useState<TenantOption[]>([]);
  const [tenantDirectoryError, setTenantDirectoryError] = useState<string | null>(null);
  const [usage, setUsage] = useState<UsageRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    fetch('/api/super/billing')
      .then(async (res) => {
        if (!res.ok) throw new Error(`backend ${res.status}`);
        return res.json();
      })
      .then((data: { items?: Subscription[]; plans?: Plan[]; usage?: UsageRow[] }) => {
        setSubscriptions(Array.isArray(data.items) ? data.items : []);
        setPlans(Array.isArray(data.plans) ? data.plans : []);
        setUsage(Array.isArray(data.usage) ? data.usage : []);
      })
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : 'gagal memuat');
        setSubscriptions([]);
      });
    setTenantDirectoryError(null);
    fetch('/api/super/tenants')
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(`backend ${res.status}`);
        return body;
      })
      .then((data: { items?: TenantOption[] }) => setTenants(Array.isArray(data.items) ? data.items : []))
      .catch((cause: unknown) => {
        setTenants([]);
        setTenantDirectoryError(cause instanceof Error ? cause.message : 'gagal memuat tenant');
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const tenantName = (tenantId: string) =>
    tenants.find((t) => t.id === tenantId)?.name ?? tenantId.slice(0, 8) + '…';

  if (error && subscriptions === null) {
    return (
      <div className="rounded-xl border border-dashed border-slate-700/70 p-10 text-center">
        <p className="m-0 text-[15px] font-semibold text-slate-300">Billing tidak tersedia</p>
        <p className="mt-2 text-[13px] text-slate-500">Backend ({error}).</p>
      </div>
    );
  }

  if (subscriptions === null) {
    return (
      <div className="space-y-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-14 animate-pulse rounded-xl bg-slate-800/60" />
        ))}
      </div>
    );
  }

  return (
    <div>
      {tenantDirectoryError ? (
        <div role="alert" className="mb-4 rounded-xl border border-amber-500/25 bg-amber-500/[.06] px-4 py-3 text-[12px] text-amber-300">
          Direktori nama tenant tidak tersedia ({tenantDirectoryError}). Data billing tetap ditampilkan dengan ID tenant; ini bukan daftar tenant kosong.
        </div>
      ) : null}
      {usage.length > 0 ? (
        <div className="mb-6 grid gap-4 sm:grid-cols-3">
          {usage.map((u) => (
            <div key={u.tenantId} className="rounded-2xl border border-slate-800/80 bg-[#111c2e] p-5">
              <div className="text-[11px] font-bold uppercase tracking-widest text-slate-500">
                Periode {new Date(u.periodStart).toLocaleDateString('id-ID')}
              </div>
              <div className="mt-1 text-[14px] font-bold text-slate-100">
                {tenantName(u.tenantId)}
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3 text-[12.5px]">
                <div>
                  <div className="text-slate-500">Perangkat</div>
                  <div className="text-[20px] font-extrabold text-slate-100">{u.deviceCount}</div>
                </div>
                <div>
                  <div className="text-[12.5px] text-slate-500">Titik telemetri</div>
                  <div className="text-[20px] font-extrabold text-teal-300">
                    {u.telemetryPoints.toLocaleString('id-ID')}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        {plans.map((plan) => (
          <div
            key={plan.id}
            className="rounded-2xl border border-slate-800/80 bg-[#111c2e] p-5 transition-all hover:border-teal-500/40"
          >
            <div className="text-[12px] font-bold uppercase tracking-wide text-teal-300">
              {plan.tier}
            </div>
            <div className="mt-1 text-[22px] font-extrabold text-white">
              {formatPrice(plan.monthlyPriceCents)}
              <span className="text-[12px] font-medium text-slate-500">/bulan</span>
            </div>
            <ul className="mt-3 space-y-1 text-[12.5px] text-slate-400">
              <li>Kuota perangkat: {plan.deviceQuota ?? '∞'}</li>
              <li>Retensi telemetri: {plan.telemetryRetentionDays ?? '—'} hari</li>
            </ul>
          </div>
        ))}
        {plans.length === 0 ? (
          <p className="sm:col-span-3 m-0 rounded-xl border border-dashed border-slate-700/70 p-6 text-center text-[13px] text-slate-500">
            Belum ada paket billing terdaftar.
          </p>
        ) : null}
      </div>

      {subscriptions.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-700/70 p-10 text-center">
          <p className="m-0 text-[15px] font-semibold text-slate-300">Belum ada langganan tenant</p>
          <p className="mt-2 text-[13px] text-slate-500">
            Langganan dibuat saat tenant onboarding (Modul 27).
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-800/80">
          <table className="w-full text-left text-[13px]">
            <thead>
              <tr className="bg-slate-900/60 text-[11px] uppercase tracking-wide text-slate-500">
                <th className="px-5 py-3 font-bold">Tenant</th>
                <th className="px-5 py-3 font-bold">Paket</th>
                <th className="px-5 py-3 font-bold">Status</th>
                <th className="px-5 py-3 font-bold">Harga</th>
                <th className="px-5 py-3 font-bold">Periode Berakhir</th>
              </tr>
            </thead>
            <tbody>
              {subscriptions.map((sub) => (
                <tr key={sub.id} className="border-t border-slate-800/60">
                  <td className="px-5 py-3.5 font-bold text-slate-100">
                    {tenantName(sub.tenantId)}
                  </td>
                  <td className="px-5 py-3.5 text-teal-300">{sub.tier}</td>
                  <td className="px-5 py-3.5">
                    <span
                      className={`rounded-full px-3 py-1 text-[11px] font-bold ${
                        STATUS_STYLES[sub.status] ?? 'bg-slate-500/10 text-slate-400'
                      }`}
                    >
                      {sub.status}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-slate-300">
                    {formatPrice(sub.monthlyPriceCents)}
                  </td>
                  <td className="px-5 py-3.5 text-slate-400">
                    {new Date(sub.currentPeriodEnd).toLocaleDateString('id-ID')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

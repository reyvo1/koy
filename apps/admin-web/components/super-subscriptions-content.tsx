'use client';

/**
 * Super Admin Subscriptions + Quotas (blueprint §1) — live from
 * /api/super/subscriptions (billing tables Modul 27). Fail-closed.
 */

import { useEffect, useState } from 'react';

interface SubscriptionRow {
  id: string;
  tenantId: string;
  tier: string;
  status: string;
  deviceQuota: number | null;
  monthlyPriceCents: number | null;
  currentPeriodEnd: string;
}

interface PlanRow {
  id: string;
  tier: string;
  deviceQuota: number;
  telemetryRetentionDays: number;
  monthlyPriceCents: number;
}

function formatPrice(cents: number | null): string {
  if (cents === null || cents === undefined) return '—';
  return `Rp ${(cents / 100).toLocaleString('id-ID')}`;
}

export default function SuperSubscriptionsContent() {
  const [data, setData] = useState<{
    subscriptions: SubscriptionRow[];
    plans: PlanRow[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/super/subscriptions')
      .then(async (res) => {
        if (!res.ok) throw new Error(`backend ${res.status}`);
        return res.json();
      })
      .then(
        (
          payload: { items?: SubscriptionRow[]; plans?: PlanRow[] } | null,
        ) => {
          if (cancelled) return;
          setData({
            subscriptions: payload?.items ?? [],
            plans: payload?.plans ?? [],
          });
        },
      )
      .catch((cause: unknown) => {
        if (!cancelled)
          setError(cause instanceof Error ? cause.message : 'gagal memuat');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error && !data) {
    return (
      <div className="rounded-xl border border-dashed border-slate-700/70 p-10 text-center">
        <p className="m-0 text-[15px] font-semibold text-slate-300">
          Data langganan tidak tersedia
        </p>
        <p className="mt-2 text-[13px] text-slate-500">Backend ({error}).</p>
      </div>
    );
  }

  if (!data) {
    return <div className="h-48 animate-pulse rounded-xl bg-slate-800/60" />;
  }

  return (
    <div className="space-y-6">
      {/* Plans & quotas */}
      <section>
        <h2 className="m-0 mb-3 text-[15px] font-bold text-slate-100">
          Paket &amp; Kuota
        </h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {data.plans.map((plan) => (
            <div
              key={plan.id}
              className="rounded-2xl border border-slate-800/70 bg-[#0d1626] p-5"
            >
              <div className="text-[12px] font-bold uppercase tracking-wider text-teal-300">
                {plan.tier}
              </div>
              <div className="mt-1 text-[24px] font-extrabold text-white">
                {formatPrice(plan.monthlyPriceCents)}
                <span className="text-[12px] font-semibold text-slate-500">
                  {' '}
                  /bulan
                </span>
              </div>
              <ul className="mt-3 space-y-1 text-[12.5px] text-slate-400">
                <li> Kuota {plan.deviceQuota} perangkat</li>
                <li>Retensi telemetri {plan.telemetryRetentionDays} hari</li>
              </ul>
            </div>
          ))}
          {data.plans.length === 0 ? (
            <p className="m-0 text-[13px] text-slate-500">
              Belum ada paket langganan yang dikonfigurasi.
            </p>
          ) : null}
        </div>
      </section>

      {/* Active subscriptions */}
      <section>
        <h2 className="m-0 mb-3 text-[15px] font-bold text-slate-100">
          Langganan Tenant
        </h2>
        {data.subscriptions.length === 0 ? (
          <p className="m-0 py-6 text-center text-[13.5px] text-slate-500">
            Belum ada tenant dengan langganan aktif.
          </p>
        ) : (
          <div className="space-y-2">
            {data.subscriptions.map((subscription) => (
              <div
                key={subscription.id}
                className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-800/70 px-5 py-3.5"
              >
                <code className="text-[11.5px] text-teal-300">
                  {subscription.tenantId.slice(0, 8)}…
                </code>
                <span className="rounded-full bg-teal-500/10 px-3 py-1 text-[11px] font-bold text-teal-300">
                  {(subscription.tier ?? '').toUpperCase()}
                </span>
                <span className="text-[12.5px] text-slate-400">
                  Kuota {subscription.deviceQuota ?? '—'} perangkat ·{' '}
                  {formatPrice(subscription.monthlyPriceCents)}/bln
                </span>
                <span className="ml-auto flex items-center gap-3">
                  <span className="text-[11.5px] text-slate-500">
                    Periode berakhir{' '}
                    {new Date(subscription.currentPeriodEnd).toLocaleDateString('id-ID')}
                  </span>
                  <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-[11px] font-bold text-emerald-400">
                    {(subscription.status ?? '').toUpperCase()}
                  </span>
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

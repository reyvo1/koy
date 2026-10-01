'use client';

/**
 * Super Admin billing (blueprint §1) — live from /api/super/subscriptions (billing tables
 * Modul 27). Fail-closed.
 *
 * Blueprint §1 lists Subscriptions and Quotas as two separate console items, but both are
 * projections of the same two tables. This component used to render both sections on both
 * routes, so /super/quotas and /super/subscriptions were byte-identical pages behind
 * different menu labels. The `view` prop scopes each route to the section it is named for;
 * the data contract is unchanged.
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

/**
 * Metered usage rows. `GET /admin/billing/subscriptions` already returns these alongside the
 * entitlement data — this component simply did not declare or render them, which is why the
 * Quotas page previously showed entitlement only. No new read model or migration is needed to
 * show usage against quota; the persisted BillingUsage rows are the read model.
 */
interface UsageRow {
  tenantId: string;
  periodStart: string;
  deviceCount: number;
  telemetryPoints: number;
}

/**
 * Latest metered usage row per tenant.
 *
 * BillingUsage is persisted per tenant per period, so a tenant can have more than one row.
 * The newest period is the one that describes current usage; older rows are history, not
 * something to sum (summing them would report cumulative devices as if they were live).
 */
function latestUsageByTenant(usage: UsageRow[]): Map<string, UsageRow> {
  const latest = new Map<string, UsageRow>();
  for (const row of usage) {
    const current = latest.get(row.tenantId);
    if (!current || row.periodStart > current.periodStart) {
      latest.set(row.tenantId, row);
    }
  }
  return latest;
}

function formatPrice(cents: number | null): string {
  if (cents === null || cents === undefined) return '—';
  return `Rp ${(cents / 100).toLocaleString('id-ID')}`;
}

export default function SuperSubscriptionsContent({
  view,
}: {
  view: 'plans' | 'subscriptions' | 'both';
}) {
  const [data, setData] = useState<{
    subscriptions: SubscriptionRow[];
    plans: PlanRow[];
    usage: UsageRow[];
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
          payload: {
            items?: SubscriptionRow[];
            plans?: PlanRow[];
            usage?: UsageRow[];
          } | null,
        ) => {
          if (cancelled) return;
          setData({
            subscriptions: payload?.items ?? [],
            plans: payload?.plans ?? [],
            usage: payload?.usage ?? [],
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

  const latestUsage = latestUsageByTenant(data.usage);

  return (
    <div className="space-y-6">
      {/* Plans & quotas */}
      {view === 'plans' || view === 'both' ? (
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
      ) : null}

      {view === 'plans' || view === 'both' ? (
      <section>
        <h2 className="m-0 mb-1 text-[15px] font-bold text-slate-100">
          Pemakaian vs Kuota
        </h2>
        <p className="mb-3 text-[12.5px] text-slate-500">
          Periode berjalan, dari baris <code>BillingUsage</code> yang tersimpan.
        </p>
        {latestUsage.size === 0 ? (
          <p className="m-0 rounded-xl border border-dashed border-slate-700/70 px-4 py-6 text-center text-[13px] text-slate-500">
            Belum ada pemakaian tercatat untuk periode ini. Ini bukan nol — metering
            belum menghasilkan baris.
          </p>
        ) : (
          <div className="space-y-2">
            {data.subscriptions.length === 0 ? (
              <p className="m-0 rounded-xl border border-dashed border-slate-700/70 px-4 py-5 text-center text-[13px] text-slate-500">
                Ada pemakaian tercatat, tetapi tidak ada langganan untuk dibandingkan
                dengan kuota.
              </p>
            ) : null}
            {data.subscriptions.map((subscription) => {
              const usageRow = latestUsage.get(subscription.tenantId);
              const quota = subscription.deviceQuota;
              const used = usageRow?.deviceCount ?? null;
              const over =
                quota !== null && used !== null && used > quota;
              const ratio =
                quota && used !== null && quota > 0
                  ? Math.min(used / quota, 1)
                  : 0;
              return (
                <div
                  key={subscription.id}
                  className="rounded-xl border border-slate-800/70 px-5 py-3.5"
                >
                  <div className="flex flex-wrap items-center gap-3">
                    <code className="text-[11.5px] text-teal-300">
                      {subscription.tenantId.slice(0, 8)}…
                    </code>
                    <span className="rounded-full bg-teal-500/10 px-3 py-1 text-[11px] font-bold text-teal-300">
                      {(subscription.tier ?? '').toUpperCase()}
                    </span>
                    <span className="text-[12.5px] text-slate-400">
                      {used === null ? (
                        <>Pemakaian periode ini belum tercatat</>
                      ) : (
                        <>
                          {used} / {quota ?? '—'} perangkat
                        </>
                      )}
                    </span>
                    <span className="ml-auto text-[11.5px] text-slate-500">
                      {usageRow
                        ? `periode ${new Date(usageRow.periodStart).toLocaleDateString('id-ID')}`
                        : '—'}
                    </span>
                  </div>
                  {over ? (
                    <p className="mb-0 mt-2 text-[11.5px] font-bold text-red-400">
                      Melebihi kuota {used} dari {quota} perangkat.
                    </p>
                  ) : null}
                  {quota && used !== null ? (
                    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                      <div
                        className={`h-full ${over ? 'bg-red-500' : 'bg-teal-500'}`}
                        style={{ width: `${Math.round(ratio * 100)}%` }}
                      />
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </section>
      ) : null}

      {/* Active subscriptions */}
      {view === 'subscriptions' || view === 'both' ? (
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
      ) : null}
    </div>
  );
}

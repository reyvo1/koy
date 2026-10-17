'use client';

/**
 * Alerts (blueprint §1) — temuan analitik berseveritas WARNING/CRITICAL
 * lintas-tenant. Sumber: /api/super/findings (Modul 16). Fail-closed.
 */

import { useCallback, useEffect, useState } from 'react';

interface Finding {
  id: string;
  capabilityKey: string;
  kind: string;
  severity: string;
  summary: string;
  confidence: number;
  tenantName?: string;
  createdAt: string;
}

export default function SuperAlertsContent() {
  const [findings, setFindings] = useState<Finding[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch('/api/super/findings?limit=100')
      .then(async (res) => {
        if (!res.ok) throw new Error(`backend ${res.status}`);
        return res.json().catch(() => { throw new Error('Backend mengembalikan respons yang tidak dapat dibaca.'); });
      })
      .then((data: { items?: Finding[] }) => {
        const items = Array.isArray(data.items) ? data.items : [];
        setFindings(items.filter((f) => f.severity === 'CRITICAL' || f.severity === 'WARNING'));
        setError(null);
      })
      .catch((cause: unknown) =>
        setError(cause instanceof Error ? cause.message : 'gagal memuat'),
      );
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const critical = findings?.filter((f) => f.severity === 'CRITICAL').length ?? 0;
  const warning = findings?.filter((f) => f.severity === 'WARNING').length ?? 0;

  return (
    <div>
      <div className="mb-5 flex gap-3">
        <div className="flex-1 rounded-2xl border border-red-500/30 bg-red-500/[.06] p-5">
          <div className="text-[11px] font-bold uppercase tracking-widest text-red-400">Kritis</div>
          <div className="mt-1 text-[28px] font-extrabold text-red-300">{critical}</div>
        </div>
        <div className="flex-1 rounded-2xl border border-amber-500/30 bg-amber-500/[.06] p-5">
          <div className="text-[11px] font-bold uppercase tracking-widest text-amber-400">Peringatan</div>
          <div className="mt-1 text-[28px] font-extrabold text-amber-300">{warning}</div>
        </div>
      </div>

      {error && !findings ? (
        <div className="rounded-xl border border-dashed border-slate-700/70 p-10 text-center">
          <p className="m-0 text-[15px] font-semibold text-slate-300">Alerts tidak tersedia</p>
          <p className="mt-2 text-[13px] text-slate-500">Backend ({error}).</p>
        </div>
      ) : findings === null ? (
        <div className="h-40 animate-pulse rounded-xl bg-slate-800/60" />
      ) : findings.length === 0 ? (
        <div className="rounded-xl border border-dashed border-teal-500/25 bg-teal-500/[.05] p-10 text-center">
          <p className="m-0 text-[15px] font-semibold text-teal-200">Tidak ada alert aktif</p>
          <p className="mt-2 text-[13px] text-slate-500">
            Detector Modul 16 akan mengisi halaman ini saat telemetri mengalir.
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {findings.map((f) => (
            <div key={f.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-800/70 px-5 py-3.5">
              <span
                className={`rounded-full px-3 py-1 text-[11px] font-bold ${
                  f.severity === 'CRITICAL'
                    ? 'bg-red-500/10 text-red-400'
                    : 'bg-amber-500/10 text-amber-400'
                }`}
              >
                {f.severity}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[13.5px] font-bold text-slate-100">{f.summary}</div>
                <div className="text-[11.5px] text-slate-500">
                  <code className="text-teal-300">{f.capabilityKey}</code>
                  {f.tenantName ? ` · ${f.tenantName}` : ''} ·{' '}
                  {new Date(f.createdAt).toLocaleString('id-ID')}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
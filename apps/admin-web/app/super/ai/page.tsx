'use client';

/**
 * AI Center (blueprint §6) — powered by Module 16 analytics findings.
 * Provider-neutral: the backend persists and bounds findings from pluggable
 * detectors; this page only renders persisted evidence, never fabricates
 * insight. Fail-closed when findings are unavailable.
 */

import { useCallback, useEffect, useState } from 'react';
import { SuperAdminShell } from '@/components/super-admin-shell';

interface Finding {
  id: string;
  deviceId: string;
  capabilityKey: string;
  kind: 'ANOMALY' | 'RECOMMENDATION';
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  summary: string;
  confidence: number;
  detectorVersion: string;
  tenantName?: string;
  createdAt: string;
}

const SEVERITY_STYLES: Record<string, string> = {
  CRITICAL: 'border-red-500/30 bg-red-500/10 text-red-300',
  WARNING: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
  INFO: 'border-sky-500/30 bg-sky-500/10 text-sky-300',
};

const KIND_META: Record<string, [string, string]> = {
  ANOMALY: ['⚠', 'Anomali'],
  RECOMMENDATION: ['✦', 'Rekomendasi'],
};

const ROADMAP = [
  ['Failure Prediction', '◈', 'Prediksi kegagalan perangkat dari tren telemetry'],
  ['Predictive Maintenance', '⛭', 'Jadwal perawatan sebelum kerusakan'],
  ['Energy Optimization', '⚡', 'Rekomendasi hemat energi'],
  ['AI Assistant', '✦', 'Asisten analitik percakapan'],
];

export default function AiCenterPage() {
  const [findings, setFindings] = useState<Finding[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const res = await fetch('/api/super/findings?limit=50');
      if (!res.ok) {
        setError('Temuan analitik tidak tersedia saat ini.');
        setFindings([]);
        return;
      }
      const data = (await res.json()) as { items?: Finding[] } | Finding[];
      setFindings(Array.isArray(data) ? data : (data.items ?? []));
    } catch {
      setError('Temuan analitik tidak tersedia saat ini.');
      setFindings([]);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  return (
    <SuperAdminShell title="AI Center"
      subtitle="Analitik cerdas — ditenagai Modul 16 Analytics" active="/super/ai">
      {error && (
        <p role="alert" className="mb-4 rounded-xl border border-red-500/25 bg-red-500/5 px-4 py-2.5 text-[13px] text-red-300">
          {error}
        </p>
      )}

      {findings !== null && findings.length === 0 && !error && (
        <p className="mb-4 rounded-xl border border-teal-500/20 bg-teal-500/5 px-4 py-2.5 text-[13px] text-teal-200">
          Belum ada temuan analitik yang tersimpan. Detector akan mengisi daftar ini saat berjalan.
        </p>
      )}

      {findings !== null && findings.length > 0 && (
        <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {findings.map((f) => {
            const [icon, label] = KIND_META[f.kind] ?? ['', f.kind];
            return (
              <div key={f.id}
                className="rounded-2xl border border-slate-800/80 bg-[#111c2e] p-5 transition-all hover:border-teal-500/40">
                <div className="flex items-center gap-2.5">
                  <span className="text-xl">{icon}</span>
                  <span className="text-[12px] font-bold uppercase tracking-wide text-slate-400">{label}</span>
                  <span className={`ml-auto rounded-full border px-2.5 py-0.5 text-[10.5px] font-bold ${SEVERITY_STYLES[f.severity] ?? SEVERITY_STYLES.INFO}`}>
                    {f.severity}
                  </span>
                </div>
                <p className="mt-3 text-[13.5px] leading-relaxed text-white">{f.summary}</p>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                  <code className="rounded bg-slate-900/70 px-1.5 py-0.5">{f.capabilityKey}</code>
                  {f.tenantName ? <span>· {f.tenantName}</span> : null}
                  <span>confidence {(f.confidence * 100).toFixed(0)}%</span>
                  <span className="ml-auto">v{f.detectorVersion}</span>
                </div>
                <div className="mt-2 text-[11px] text-slate-600">
                  {new Date(f.createdAt).toLocaleString('id-ID')}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <h2 className="mb-3 text-[14px] font-bold text-white">Roadmap Analitik</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {ROADMAP.map(([name, icon, desc]) => (
          <div key={name} className="rounded-2xl border border-slate-800/80 bg-[#111c2e] p-5 transition-all hover:border-slate-600">
            <div className="text-3xl">{icon}</div>
            <div className="mt-3 text-[15px] font-bold text-white">{name}</div>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-slate-500">{desc}</p>
            <span className="mt-3 inline-block rounded-full border border-slate-600/40 bg-slate-800/50 px-2.5 py-0.5 text-[10.5px] font-bold text-slate-400">
              Segera
            </span>
          </div>
        ))}
      </div>
    </SuperAdminShell>
  );
}

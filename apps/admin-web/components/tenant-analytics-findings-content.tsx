'use client';

/**
 * Tenant Analytics Findings — persisted Module 16 findings via
 * /api/admin/analytics-findings. This surface deliberately does NOT claim to
 * be notification-delivery history; Module 14 delivery needs its own read
 * contract before a Notifications surface can be promoted.
 */

import { useEffect, useState } from 'react';
import { CircleAlert, SearchX, ServerCrash } from 'lucide-react';

interface Finding {
  id?: string;
  kind?: string;
  summary?: string;
  title?: string;
  severity?: string;
  deviceId?: string;
  capabilityKey?: string;
  confidence?: number;
  createdAt?: string;
}

const SEVERITY_TOKEN: Record<string, { badge: string; alert: string; label: string }> = {
  CRITICAL: { badge: 'iot2-badge--offline', alert: 'iot2-alert--critical', label: 'CRITICAL' },
  HIGH: { badge: 'iot2-badge--offline', alert: 'iot2-alert--critical', label: 'HIGH' },
  WARNING: { badge: 'iot2-badge--warning', alert: 'iot2-alert--warning', label: 'WARNING' },
  MEDIUM: { badge: 'iot2-badge--warning', alert: 'iot2-alert--warning', label: 'MEDIUM' },
  LOW: { badge: 'iot2-badge--warning', alert: 'iot2-alert--info', label: 'LOW' },
  INFO: { badge: 'iot2-badge--warning', alert: 'iot2-alert--info', label: 'INFO' },
};

function normalizeSeverity(value?: string): keyof typeof SEVERITY_TOKEN {
  const s = (value ?? '').toUpperCase();
  return s in SEVERITY_TOKEN ? (s as keyof typeof SEVERITY_TOKEN) : 'INFO';
}

export default function TenantAnalyticsFindingsContent() {
  const [findings, setFindings] = useState<Finding[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/admin/analytics-findings?limit=50')
      .then(async (res) => {
        if (!res.ok) throw new Error(`backend ${res.status}`);
        return res.json().catch(() => { throw new Error('Backend mengembalikan respons yang tidak dapat dibaca.'); });
      })
      .then((data: unknown) => {
        if (cancelled) return;
        setFindings(
          Array.isArray(data)
            ? (data as Finding[])
            : ((data as { items?: Finding[] }).items ?? []),
        );
        setError(null);
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setFindings(null);
          setError(cause instanceof Error ? cause.message : 'gagal memuat');
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!findings && !error) {
    return (
      <div className="iot2-panel space-y-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-16 animate-pulse rounded-xl bg-slate-200/70" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="iot2-panel flex flex-col items-center py-14 text-center">
        <span className="grid h-16 w-16 place-items-center rounded-2xl bg-slate-100">
          <ServerCrash className="h-8 w-8 text-slate-400" strokeWidth={1.5} />
        </span>
        <p className="mb-0 mt-5 text-[15px] font-bold">Temuan analitik tidak tersedia</p>
        <p className="mt-2 mb-0 text-[13px]" style={{ color: 'var(--iot-color-muted)' }}>
          {error}
        </p>
      </div>
    );
  }

  if (!findings || findings.length === 0) {
    return (
      <div className="iot2-panel flex flex-col items-center py-14 text-center">
        <span className="grid h-16 w-16 place-items-center rounded-2xl bg-slate-100">
          <SearchX className="h-8 w-8 text-slate-400" strokeWidth={1.5} />
        </span>
        <p className="mb-0 mt-5 text-[15px] font-bold">Belum ada temuan analitik</p>
        <p className="mt-2 mb-0 text-[13px]" style={{ color: 'var(--iot-color-muted)' }}>
          Belum ada finding Module 16 pada data yang tersedia. Ini bukan status pengiriman notifikasi.
        </p>
      </div>
    );
  }

  return (
    <div className="iot2-panel">
      <div className="mb-4 flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-500/10">
          <CircleAlert className="h-5 w-5 text-amber-500" strokeWidth={1.8} />
        </span>
        <div>
          <h3 className="iot2-panel__title">Temuan Analitik</h3>
          <p className="iot2-panel__sub">
            Finding anomali/rekomendasi Module 16 — bukan riwayat delivery notifikasi.
          </p>
        </div>
      </div>
      <div>
        {findings.map((item, index) => {
          const severity = normalizeSeverity(item.severity);
          const token = SEVERITY_TOKEN[severity];
          const title = item.summary ?? item.title ?? item.kind ?? 'Temuan analitik';
          return (
            <div key={item.id ?? `finding-${index}`} className={`iot2-alert ${token.alert}`}>
              <span className="iot2-alert__dot" />
              <div className="min-w-0 flex-1">
                <div className="text-[14px] font-bold" style={{ color: 'var(--iot-color-text)' }}>
                  {title}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <span className={`iot2-badge ${token.badge}`}>{token.label}</span>
                  {item.kind ? (
                    <span className="text-[11.5px]" style={{ color: 'var(--iot-color-muted)' }}>
                      {item.kind}
                    </span>
                  ) : null}
                  {item.capabilityKey ? (
                    <code className="text-[11px]" style={{ color: 'var(--iot-color-muted)' }}>
                      {item.capabilityKey}
                    </code>
                  ) : null}
                </div>
              </div>
              <span className="iot2-alert__time">
                {item.createdAt ? new Date(item.createdAt).toLocaleString('id-ID') : ''}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

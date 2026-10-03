'use client';
import { useEffect, useState } from 'react';

type AlertItem = { id: string; deviceId: string; deviceName: string; capabilityKey: string; kind: string; severity: string; summary: string; confidence: number; createdAt: string };
type Payload = { items: AlertItem[]; deviceScopeTruncated: boolean; limit: number };

export function AlertsExperience() {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { void fetch('/api/alerts').then(async (r) => { const p = await r.json(); if (!r.ok) throw new Error(p.message ?? 'Alert gagal dimuat'); setData(p); }).catch((e) => setError(e instanceof Error ? e.message : 'Alert gagal dimuat')); }, []);
  if (error) return <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p>;
  if (!data) return <p className="text-sm text-slate-500">Memuat alert…</p>;
  if (!data.items.length) return <p className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">Tidak ada WARNING/CRITICAL untuk perangkat yang dapat Anda akses.</p>;
  return <div className="grid gap-3">{data.items.map((item) => <article key={item.id} className="rounded-xl border border-slate-200 bg-white p-4"><div className="flex flex-wrap items-center justify-between gap-2"><strong className="text-slate-900">{item.deviceName}</strong><span className="rounded-full bg-amber-50 px-2 py-1 text-xs font-bold text-amber-700">{item.severity}</span></div><p className="mt-2 text-sm text-slate-700">{item.summary}</p><p className="mt-2 text-xs text-slate-500">{item.kind} · {item.capabilityKey} · {new Date(item.createdAt).toLocaleString()}</p></article>)}</div>;
}

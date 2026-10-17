'use client';

import { useEffect, useMemo, useState } from 'react';

interface CapRow {
  id: string;
  key: string;
  semanticType?: string;
  dataType?: string;
  unit?: string | null;
  constraints?: unknown;
  schemaVersion?: string;
  isReadable?: boolean;
  isWritable?: boolean;
  isReportable?: boolean;
  deviceName: string | null;
  tenantName: string | null;
  createdAt?: string;
  updatedAt?: string;
}

const inputClass = 'w-full rounded-xl border border-slate-700/70 bg-slate-900/60 px-3.5 py-2.5 text-[13.5px] text-slate-200 outline-none placeholder:text-slate-500 focus:border-teal-500';

export default function SuperCapabilitiesContent() {
  const [caps, setCaps] = useState<CapRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetch('/api/super/capabilities')
      .then(async (res) => {
        const body = await res.json().catch(() => { throw new Error('Backend mengembalikan respons yang tidak dapat dibaca.'); });
        if (!res.ok) throw new Error(body?.error?.message ?? `backend ${res.status}`);
        return body;
      })
      .then((data: { items?: CapRow[] }) => setCaps(Array.isArray(data.items) ? data.items : []))
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'gagal memuat'));
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const base = caps ?? [];
    if (!q) return base;
    return base.filter((c) => `${c.key} ${c.semanticType ?? ''} ${c.dataType ?? ''} ${c.schemaVersion ?? ''} ${c.deviceName ?? ''} ${c.tenantName ?? ''}`.toLowerCase().includes(q));
  }, [caps, search]);

  const grouped = useMemo(() => {
    const map = new Map<string, CapRow[]>();
    for (const c of filtered) {
      const list = map.get(c.key) ?? [];
      list.push(c);
      map.set(c.key, list);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered]);

  if (error && !caps) return <StateBox title="Registry tidak tersedia" detail={error} />;
  if (caps === null) return <div className="h-40 animate-pulse rounded-xl bg-slate-800/60" />;

  return (
    <div>
      <div className="mb-4 rounded-xl border border-sky-500/20 bg-sky-500/[.05] px-4 py-3 text-[12.5px] leading-relaxed text-sky-200">
        Registry ini menampilkan <strong>observed per-device definitions</strong> dari capability nyata. Template/version lifecycle tenant juga tersedia melalui panel Versioning: deklarasi template, publish/deprecate versi, preview, dan apply tetap dipisahkan agar publikasi tidak mengubah perangkat secara diam-diam.
      </div>
      <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari key, semantic type, data type, version, perangkat, tenant…" className={`${inputClass} mb-4`} />
      {grouped.length === 0 ? <StateBox title={search ? 'Tidak ada hasil' : 'Belum ada capability terdaftar'} /> : (
        <div className="space-y-3">
          {grouped.map(([key, list]) => {
            const versions = [...new Set(list.map((item) => item.schemaVersion ?? '1.0.0'))].sort();
            const signatures = new Set(list.map((item) => `${item.semanticType ?? ''}|${item.dataType ?? ''}|${item.unit ?? ''}|${JSON.stringify(item.constraints ?? null)}|${item.isReadable}|${item.isWritable}|${item.isReportable}`));
            return (
              <article key={key} className="rounded-2xl border border-slate-800/80 bg-[#111c2e] p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <code className="text-[13.5px] font-bold text-teal-300">{key}</code>
                  <span className="rounded-full bg-slate-800/70 px-2.5 py-0.5 text-[10.5px] font-bold text-slate-400">{list.length} binding</span>
                  <span className="rounded-full bg-sky-500/10 px-2.5 py-0.5 text-[10.5px] font-bold text-sky-300">version {versions.join(', ')}</span>
                  {signatures.size > versions.length ? <span className="rounded-full bg-amber-500/10 px-2.5 py-0.5 text-[10.5px] font-bold text-amber-300">definition drift observed</span> : null}
                </div>
                <div className="mt-3 grid gap-2 lg:grid-cols-2">
                  {list.slice(0, 8).map((c) => (
                    <div key={c.id} className="rounded-xl border border-slate-800/70 bg-slate-900/45 px-3 py-2.5">
                      <div className="flex flex-wrap items-center gap-2 text-[11.5px]"><span className="font-semibold text-slate-200">{c.deviceName ?? '—'}</span><span className="text-slate-600">· {c.tenantName ?? '—'}</span><span className="ml-auto text-teal-300">v{c.schemaVersion ?? '1.0.0'}</span></div>
                      <div className="mt-1 text-[10.5px] text-slate-500">{c.semanticType ?? '—'} · {c.dataType ?? 'string'}{c.unit ? ` · ${c.unit}` : ''} · {flags(c)}</div>
                      {c.constraints ? <code className="mt-1 block overflow-x-auto text-[10px] text-slate-600">{JSON.stringify(c.constraints)}</code> : null}
                    </div>
                  ))}
                </div>
                {list.length > 8 ? <div className="mt-2 text-[11px] text-slate-600">+{list.length - 8} binding lainnya</div> : null}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
function flags(c: CapRow) { return [c.isReadable ? 'READ' : null, c.isWritable ? 'WRITE' : null, c.isReportable ? 'REPORT' : null].filter(Boolean).join('/') || 'NO ACCESS FLAGS'; }
function StateBox({ title, detail }: { title: string; detail?: string }) { return <div className="rounded-xl border border-dashed border-slate-700/70 p-10 text-center"><p className="m-0 text-[15px] font-semibold text-slate-300">{title}</p>{detail ? <p className="mt-2 text-[13px] text-slate-500">Backend ({detail}).</p> : null}</div>; }

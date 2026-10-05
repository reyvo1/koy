'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Cable, Plus, RefreshCw, Trash2, AlertTriangle } from 'lucide-react';
import { TenantShell } from '@/components/tenant-shell';
import { EmptyState, SkeletonCard } from '@/components/ui-polish';

const PROVIDERS = ['ALEXA', 'GOOGLE_HOME', 'HOME_ASSISTANT', 'MQTT_BRIDGE'] as const;
type Provider = (typeof PROVIDERS)[number];

interface IntegrationRow {
  id: string;
  provider: Provider;
  displayName: string;
  status: string;
  lastError?: string | null;
  createdAt: string;
}

function providerLabel(provider: Provider): string {
  return provider.replaceAll('_', ' ');
}

export default function TenantIntegrationsPage() {
  const [rows, setRows] = useState<IntegrationRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [provider, setProvider] = useState<Provider>('HOME_ASSISTANT');
  const [displayName, setDisplayName] = useState('');
  const [credentialRef, setCredentialRef] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const response = await fetch('/api/tenant/integrations', { cache: 'no-store' });
      if (!response.ok) throw new Error(`backend ${response.status}`);
      const payload = (await response.json()) as { items?: IntegrationRow[] };
      setRows(Array.isArray(payload.items) ? payload.items : []);
    } catch (cause) {
      setRows(null);
      setError(cause instanceof Error ? cause.message : 'gagal memuat integrasi');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function register(event: FormEvent) {
    event.preventDefault();
    setBusy('create');
    setError(null);
    setNotice(null);
    try {
      const response = await fetch('/api/tenant/integrations', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ provider, displayName, credentialRef }),
      });
      const payload = (await response.json().catch(() => ({}))) as { message?: string; note?: string };
      if (!response.ok) throw new Error(payload.message ?? `backend ${response.status}`);
      setDisplayName('');
      setCredentialRef('');
      setNotice(payload.note ?? 'Integrasi terdaftar.');
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'gagal mendaftarkan integrasi');
    } finally {
      setBusy(null);
    }
  }

  async function remove(row: IntegrationRow) {
    if (!window.confirm(`Hapus registry integrasi "${row.displayName}"?`)) return;
    setBusy(row.id);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`/api/tenant/integrations/${encodeURIComponent(row.id)}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { message?: string };
        throw new Error(payload.message ?? `backend ${response.status}`);
      }
      setNotice(`Integrasi "${row.displayName}" dihapus.`);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'gagal menghapus integrasi');
    } finally {
      setBusy(null);
    }
  }

  return (
    <TenantShell
      title="Integrasi"
      subtitle="Registry ekosistem eksternal — referensi secret saja, bukan credential mentah"
      active="/tenant/integrasi"
    >
      <div className="mb-5 rounded-xl border border-amber-500/20 bg-amber-500/[.06] px-4 py-3 text-[12px] leading-relaxed text-amber-200/90">
        Status <strong>REGISTERED</strong> hanya membuktikan row registry tersimpan. Koneksi dan sinkronisasi nyata bergantung pada adapter/provider runtime yang tersedia; halaman ini tidak mengklaim provider sudah terhubung.
      </div>

      <form onSubmit={register} className="mb-5 grid gap-3 rounded-2xl border border-slate-800/80 bg-[#111c2e] p-5 lg:grid-cols-[180px_1fr_1.2fr_auto]">
        <select value={provider} onChange={(e) => setProvider(e.target.value as Provider)} className="rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2 text-[13px] text-slate-100">
          {PROVIDERS.map((value) => <option key={value} value={value}>{providerLabel(value)}</option>)}
        </select>
        <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={120} required placeholder="Nama integrasi" className="rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2 text-[13px] text-slate-100 placeholder:text-slate-500" />
        <input value={credentialRef} onChange={(e) => setCredentialRef(e.target.value)} maxLength={256} required placeholder="secret://tenant/provider/key" className="rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2 font-mono text-[12.5px] text-slate-100 placeholder:text-slate-500" />
        <button type="submit" disabled={busy === 'create'} className="flex items-center justify-center gap-1.5 rounded-lg bg-teal-500/15 px-4 py-2 text-[12.5px] font-semibold text-teal-300 ring-1 ring-inset ring-teal-500/30 disabled:opacity-50">
          <Plus className="h-3.5 w-3.5" /> {busy === 'create' ? 'Menyimpan…' : 'Daftarkan'}
        </button>
      </form>
      <p className="-mt-3 mb-5 text-[11.5px] text-slate-500">Gunakan hanya identifier <code>secret://...</code> yang menunjuk secret store. Jangan tempel token/password asli.</p>

      {error ? <div role="alert" className="mb-4 flex items-start gap-2 rounded-xl border border-red-500/25 bg-red-500/[.06] px-4 py-3 text-[13px] text-red-200"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />{error}</div> : null}
      {notice ? <div className="mb-4 rounded-xl border border-emerald-500/20 bg-emerald-500/[.06] px-4 py-3 text-[13px] text-emerald-200">{notice}</div> : null}

      <div className="mb-3 flex justify-end">
        <button type="button" onClick={() => void load()} className="flex items-center gap-1.5 text-[12px] font-semibold text-slate-400 hover:text-teal-300"><RefreshCw className="h-3.5 w-3.5" />Muat ulang</button>
      </div>

      {rows === null ? (
        <div className="grid gap-3 lg:grid-cols-2"><SkeletonCard /><SkeletonCard /></div>
      ) : rows.length === 0 ? (
        <EmptyState icon={Cable} title="Belum ada integrasi" description="Daftarkan referensi secret untuk provider yang akan dikelola oleh adapter runtime." />
      ) : (
        <div className="space-y-3">
          {rows.map((row) => (
            <article key={row.id} className="rounded-xl border border-slate-800/80 bg-[#111c2e] px-4 py-3">
              <div className="flex flex-wrap items-center gap-3">
                <div className="min-w-[220px] flex-1">
                  <div className="text-[13.5px] font-bold text-slate-100">{row.displayName}</div>
                  <div className="mt-0.5 text-[11.5px] text-slate-500">{providerLabel(row.provider)} · dibuat {new Date(row.createdAt).toLocaleString('id-ID')}</div>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-[10.5px] font-bold ${row.status === 'CONNECTED' ? 'bg-emerald-500/10 text-emerald-300' : row.status === 'ERROR' ? 'bg-red-500/10 text-red-300' : 'bg-sky-500/10 text-sky-300'}`}>{row.status}</span>
                <button type="button" disabled={busy === row.id} onClick={() => void remove(row)} aria-label={`Hapus integrasi ${row.displayName}`} className="rounded-lg border border-red-500/20 p-2 text-red-300 hover:bg-red-500/10 disabled:opacity-50"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
              {row.lastError ? <p className="mb-0 mt-2 font-mono text-[11.5px] text-red-300/80">{row.lastError}</p> : null}
            </article>
          ))}
        </div>
      )}
    </TenantShell>
  );
}

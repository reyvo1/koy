'use client';

/**
 * Workspace (Modul 18) — dashboard list + detail (resolution) + delete.
 * Data widget nyata dari /dashboards backend. Fail-closed.
 */

import { useCallback, useEffect, useState } from 'react';
import { LayoutDashboard, Trash2, Loader2, ArrowLeft } from 'lucide-react';
import { EmptyState } from '@/components/ui-polish';

interface DashboardRow {
  id: string;
  name?: string;
  title?: string;
  widgets?: Array<{ id: string; kind?: string; title?: string }>;
  widgetCount?: number;
  updatedAt?: string;
  isShared?: boolean;
  ownerName?: string;
}

interface Resolution {
  dashboard?: { id: string; name?: string };
  widgets?: Array<{
    id: string;
    kind?: string;
    title?: string;
    deviceId?: string;
    capabilityKey?: string;
    position?: { x: number; y: number; w?: number; h?: number };
  }>;
}

export default function TenantWorkspaceContent() {
  const [rows, setRows] = useState<DashboardRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [resolution, setResolution] = useState<Resolution | null>(null);
  const toast = { push: (kind: string, msg: string) => console.log(kind, msg) };

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/tenant/dashboards');
      if (!res.ok) throw new Error(`backend ${res.status}`);
      const data = (await res.json()) as { items?: DashboardRow[] } | DashboardRow[];
      setRows(Array.isArray(data) ? data : (data.items ?? []));
      setError(null);
    } catch (cause) {
      setRows([]);
      setError(cause instanceof Error ? cause.message : 'gagal memuat');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const open = async (id: string) => {
    setBusy(`open-${id}`);
    try {
      const res = await fetch(`/api/tenant/dashboards/${id}`);
      const data = (await res.json()) as Resolution;
      setResolution(data);
      setOpenId(id);
    } catch {
      toast.push('error', 'Gagal membuka workspace');
    } finally {
      setBusy(null);
    }
  };

  const remove = async (id: string, name: string) => {
    setBusy(`delete-${id}`);
    try {
      const res = await fetch(`/api/tenant/dashboards/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Gagal menghapus workspace');
      toast.push('success', `Workspace "${name}" dihapus.`);
      setOpenId(null);
      setResolution(null);
      await load();
    } catch (cause) {
      toast.push('error', cause instanceof Error ? cause.message : 'Gagal menghapus');
    } finally {
      setBusy(null);
    }
  };

  if (rows === null && !error) {
    return <div className="h-40 animate-pulse rounded-2xl bg-slate-800/60" />;
  }

  if (openId) {
    const widgets = resolution?.widgets ?? [];
    return (
      <div>
        <button
          type="button"
          onClick={() => {
            setOpenId(null);
            setResolution(null);
          }}
          className="mb-4 flex items-center gap-2 rounded-lg border border-slate-700/70 px-3 py-1.5 text-[12.5px] font-semibold text-slate-300 hover:border-teal-500/50 hover:text-teal-300"
        >
          <ArrowLeft className="h-4 w-4" /> Kembali ke daftar
        </button>
        <h2 className="mb-1 text-[18px] font-extrabold tracking-tight text-slate-50">
          {resolution?.dashboard?.name ?? 'Workspace'}
        </h2>
        <p className="mb-5 text-[12.5px] text-slate-500">
          {widgets.length} widget · modul 10 widget types
        </p>
        {widgets.length === 0 ? (
          <EmptyState
            icon={LayoutDashboard}
            title="Workspace kosong"
            description="Workspace ini belum memiliki widget. Widget ditambahkan lewat editor Modul 10."
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {widgets.map((widget) => (
              <div
                key={widget.id}
                className="rounded-2xl border border-slate-800/80 bg-[#111c2e] p-5"
              >
                <div className="text-[10.5px] font-bold uppercase tracking-widest text-teal-400">
                  {widget.kind ?? 'WIDGET'}
                </div>
                <div className="mt-2 text-[15px] font-bold text-slate-100">
                  {widget.title ?? widget.id.slice(0, 8)}
                </div>
                <div className="mt-1 text-[12px] text-slate-500">
                  {widget.deviceId ? `perangkat ${widget.deviceId.slice(0, 8)}…` : '—'}
                  {widget.capabilityKey ? ` · ${widget.capabilityKey}` : ''}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      {error ? (
        <EmptyState icon={LayoutDashboard} title="Workspace tidak tersedia" description={`${error}. Coba beberapa saat lagi.`} />
      ) : rows === null ? (
        <div className="h-40 animate-pulse rounded-2xl bg-slate-800/60" />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={LayoutDashboard}
          title="Belum ada workspace"
          description="Workspace/personal dashboard akan muncul di sini saat dibuat."
        />
      ) : (
        <div className="space-y-2.5">
          {rows.map((row) => (
            <div key={row.id} className="iot2-panel flex flex-wrap items-center gap-4" style={{ padding: '16px 20px' }}>
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-teal-500/15">
                <LayoutDashboard className="h-5 w-5 text-teal-300" strokeWidth={1.9} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[15px] font-bold text-slate-100">{row.name ?? row.id.slice(0, 8)}</div>
                <div className="text-[12px]" style={{ color: 'var(--iot-text-muted)' }}>
                  {row.isShared ? 'dibagikan' : 'pribadi'}
                  {row.updatedAt ? ` · diubah ${new Date(row.updatedAt).toLocaleDateString('id-ID')}` : ''}
                </div>
              </div>
              <button
                type="button"
                onClick={() => void open(row.id)}
                className="iot2-badge cursor-pointer"
                style={{ border: '1px solid rgba(45,212,191,.35)', color: '#5eead4' }}
              >
                {busy === `open-${row.id}` ? '…' : 'Buka'}
              </button>
              <button
                type="button"
                onClick={() => void remove(row.id, row.name ?? row.id)}
                disabled={busy !== null}
                aria-label={`Hapus ${row.name}`}
                className="grid h-10 w-10 place-items-center rounded-xl border border-red-500/30 text-red-400 transition-colors hover:bg-red-500/10 disabled:opacity-50"
              >
                {busy === `delete-${row.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" strokeWidth={2} />}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
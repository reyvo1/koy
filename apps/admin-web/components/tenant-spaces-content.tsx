'use client';

/**
 * Tenant space hierarchy (Modul 17) — create + delete + list per kind.
 * Shared by Lokasi/Gedung/Lantai/Ruangan pages via `kind` prop. Dark v2.2.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  MapPin,
  Building2,
  Layers,
  Sofa,
  Trash2,
  Loader2,
  type LucideIcon,
} from 'lucide-react';
import { EmptyState, useToast } from '@/components/ui-polish';

interface SpaceNode {
  id: string;
  name: string;
  kind: 'SITE' | 'BUILDING' | 'FLOOR' | 'ROOM';
  parentId: string | null;
  path: string;
  depth: number;
}

const KIND_META: Record<SpaceNode['kind'], { icon: LucideIcon; label: string }> = {
  SITE: { icon: MapPin, label: 'Lokasi' },
  BUILDING: { icon: Building2, label: 'Gedung' },
  FLOOR: { icon: Layers, label: 'Lantai' },
  ROOM: { icon: Sofa, label: 'Ruangan' },
};

const PARENT_KIND: Record<SpaceNode['kind'], SpaceNode['kind'] | null> = {
  SITE: null,
  BUILDING: 'SITE',
  FLOOR: 'BUILDING',
  ROOM: 'FLOOR',
};

const inputClass =
  'w-full rounded-xl border border-slate-700/70 bg-slate-900/60 px-3.5 py-2.5 text-[13.5px] text-slate-200 outline-none focus:border-teal-500';

export default function TenantSpacesContent({ kind }: { kind: SpaceNode['kind'] }) {
  const [nodes, setNodes] = useState<SpaceNode[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const toast = useToast();

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/tenant/spaces');
      if (!res.ok) throw new Error(`backend ${res.status}`);
      const data = (await res.json()) as { items?: SpaceNode[] };
      setNodes(Array.isArray(data.items) ? data.items : []);
      setError(null);
    } catch (cause) {
      setNodes([]);
      setError(cause instanceof Error ? cause.message : 'gagal memuat');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => (nodes ?? []).filter((n) => n.kind === kind), [nodes, kind]);
  const parentKind = PARENT_KIND[kind];
  const parentOptions = useMemo(
    () => (nodes ?? []).filter((n) => n.kind === parentKind),
    [nodes, parentKind],
  );

  const create = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy('create');
    setFormError(null);
    const form = new FormData(event.currentTarget);
    const payload: Record<string, unknown> = {
      name: String(form.get('name') ?? '').trim(),
      kind,
    };
    const parentId = String(form.get('parentId') ?? '');
    if (parentId) payload.parentId = parentId;
    try {
      const res = await fetch('/api/tenant/spaces', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: { message?: string }; message?: string };
      if (!res.ok) throw new Error(body.error?.message ?? body.message ?? 'Gagal membuat lokasi');
      toast.push('success', `${KIND_META[kind].label} "${payload.name}" dibuat.`);
      setShowForm(false);
      await load();
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : 'Gagal membuat lokasi');
    } finally {
      setBusy(null);
    }
  };

  const remove = async (node: SpaceNode) => {
    setBusy(`delete-${node.id}`);
    try {
      const res = await fetch(`/api/tenant/spaces/${node.id}`, { method: 'DELETE' });
      const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
      if (!res.ok) throw new Error(body.error?.message ?? 'Gagal menghapus lokasi');
      toast.push('success', `${node.name} dihapus.`);
      await load();
    } catch (cause) {
      toast.push('error', cause instanceof Error ? cause.message : 'Gagal menghapus lokasi');
    } finally {
      setBusy(null);
    }
  };

  if (nodes === null && !error) {
    return <div className="h-40 animate-pulse rounded-2xl bg-slate-800/60" />;
  }

  const Icon = KIND_META[kind].icon;

  return (
    <div>
      <div className="mb-5 flex justify-end">
        <button type="button" onClick={() => setShowForm((v) => !v)} className="iot-button">
          {showForm ? 'Tutup' : `+ Tambah ${KIND_META[kind].label}`}
        </button>
      </div>

      {showForm ? (
        <form onSubmit={create} className="iot2-panel mb-6 grid gap-4 sm:grid-cols-2" style={{ padding: 20 }}>
          <label className="block">
            <span className="mb-1.5 block text-[12px] font-semibold" style={{ color: 'var(--iot-text-muted)' }}>
              Nama {KIND_META[kind].label.toLowerCase()} *
            </span>
            <input name="name" required maxLength={80} placeholder={`Nama ${KIND_META[kind].label.toLowerCase()}`} className={inputClass} />
          </label>
          {parentKind ? (
            <label className="block">
              <span className="mb-1.5 block text-[12px] font-semibold" style={{ color: 'var(--iot-text-muted)' }}>
                Induk ({KIND_META[parentKind].label}) *
              </span>
              <select name="parentId" required className={inputClass} defaultValue="">
                <option value="" disabled>Pilih induk…</option>
                {parentOptions.map((n) => (
                  <option key={n.id} value={n.id}>{n.name}</option>
                ))}
              </select>
            </label>
          ) : null}
          <div className="flex items-end">
            <button disabled={busy !== null} className="iot-button w-full">
              {busy === 'create' ? 'Menyimpan…' : 'Simpan'}
            </button>
          </div>
          {formError ? (
            <p role="alert" className="sm:col-span-2 m-0 rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-[13px] text-red-400">
              {formError}
            </p>
          ) : null}
        </form>
      ) : null}

      {error ? (
        <EmptyState icon={Icon} title="Struktur lokasi tidak tersedia" description={`${error}. Coba beberapa saat lagi.`} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Icon}
          title={`Belum ada ${KIND_META[kind].label.toLowerCase()}`}
          description={
            parentKind
              ? `Tambahkan ${KIND_META[kind].label.toLowerCase()} di bawah ${KIND_META[parentKind].label.toLowerCase()} yang sudah ada.`
              : `Tambahkan ${KIND_META[kind].label.toLowerCase()} pertama untuk menyusun struktur lokasi.`
          }
          action={{ label: `+ Tambah ${KIND_META[kind].label}`, onClick: () => setShowForm(true) }}
        />
      ) : (
        <div className="space-y-2.5">
          {filtered.map((node) => (
            <div key={node.id} className="iot2-panel flex flex-wrap items-center gap-4" style={{ padding: '16px 20px' }}>
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-teal-500/15">
                <Icon className="h-5 w-5 text-teal-300" strokeWidth={1.9} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[15px] font-bold text-slate-100">{node.name}</div>
                <div className="text-[12px]" style={{ color: 'var(--iot-text-muted)' }}>{node.path}</div>
              </div>
              <button
                type="button"
                onClick={() => void remove(node)}
                disabled={busy !== null}
                aria-label={`Hapus ${node.name}`}
                className="grid h-10 w-10 place-items-center rounded-xl border border-red-500/30 text-red-400 transition-colors hover:bg-red-500/10 disabled:opacity-50"
              >
                {busy === `delete-${node.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" strokeWidth={2} />}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

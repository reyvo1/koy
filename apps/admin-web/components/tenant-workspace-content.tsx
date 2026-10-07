'use client';
import { GeoMap, type MapLocation } from '@iot-platform/design-system';

/**
 * Workspace (Modul 18) — dashboard list + detail (resolution) + widget readings + delete.
 *
 * The resolution response says *which* widgets a dashboard has and whether they resolved
 * at all. It does not contain a single reading: values arrive per widget from
 * `GET /dashboards/:id/widgets/:widgetId/data`. This screen used to render only the
 * resolution — kind, title, a truncated device id — so an operator looking at a workspace
 * saw a grid of labels and no telemetry, with nothing on the page to indicate that numbers
 * were available elsewhere in the product. Each card now loads its own reading.
 *
 * Fail-closed throughout: a widget that cannot be queried renders its backend state and
 * reason, never a placeholder value. Absence of data is shown as absence, not as zero.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  LayoutDashboard,
  Trash2,
  Loader2,
  ArrowLeft,
  Plus,
} from 'lucide-react';
import { EmptyState, useToast } from '@/components/ui-polish';
import TenantDashboardEditor from '@/components/tenant-dashboard-editor-panel';

interface DashboardRow {
  id: string;
  name?: string;
  title?: string;
  widgets?: Array<{ id: string; kind?: string; title?: string }>;
  widgetCount?: number;
  /** Optimistic-concurrency token the backend requires on delete. */
  revision?: number;
  updatedAt?: string;
  isShared?: boolean;
  ownerName?: string;
}

interface ResolvedBinding {
  id: string;
  alias?: string;
  device?: { id: string; status?: string } | null;
  capability?: {
    key?: string;
    unit?: string | null;
    constraints?: { min?: number; max?: number; precision?: number };
  } | null;
}

interface ResolvedWidget {
  id: string;
  kind?: string;
  title?: string;
  state?: 'READY' | 'INVALID' | 'UNSUPPORTED';
  message?: string | null;
  presentation?: Record<string, unknown>;
  bindings?: ResolvedBinding[];
}

interface Resolution {
  dashboardId?: string;
  dashboard?: { id: string; name?: string };
  widgets?: ResolvedWidget[];
}

interface WidgetBindingData {
  id: string;
  alias: string;
  state: string;
  message: string | null;
  observedAt: string | null;
  data: Record<string, unknown> | null;
}

interface WidgetData {
  widgetId: string;
  kind?: string;
  title?: string;
  state: string;
  reasonCode: string | null;
  message: string | null;
  generatedAt: string;
  bindings: WidgetBindingData[];
}

/** Per-widget load result. `null` data means "still loading", not "no value". */
type WidgetReading = WidgetData | { failed: string };

const STATE_LABEL: Record<string, string> = {
  READY: 'Siap',
  EMPTY: 'Kosong',
  STALE: 'Perlu diperbarui',
  INVALID: 'Tidak valid',
  UNSUPPORTED: 'Belum didukung',
  ERROR: 'Gangguan',
};

export default function TenantWorkspaceContent() {
  const [rows, setRows] = useState<DashboardRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [resolution, setResolution] = useState<Resolution | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newShared, setNewShared] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [readings, setReadings] = useState<Record<string, WidgetReading>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const toast = useToast();
  const readingToken = useRef(0);

  /**
   * Load one widget's readings.
   *
   * 401/403 are not swallowed: they mean the session itself is unauthorized, and the page
   * must not keep presenting cached numbers from a session that has lost access. Every other
   * failure is recorded per widget so one broken binding cannot blank the whole dashboard.
   */
  const loadReading = useCallback(
    async (dashboardId: string, widget: ResolvedWidget, token: number) => {
      try {
        const res = await fetch(
          `/api/tenant/dashboards/${encodeURIComponent(
            dashboardId,
          )}/widgets/${encodeURIComponent(widget.id)}/data`,
          { cache: 'no-store' },
        );
        const payload = (await res.json().catch(() => null)) as unknown;
        const problem =
          payload as { message?: string; error?: { message?: string } } | null;

        if (res.status === 401 || res.status === 403) {
          throw new Error(payloadUnauthorized(problem));
        }
        if (!res.ok) {
          throw new Error(payloadError(problem) ?? `backend ${res.status}`);
        }
        if (token !== readingToken.current) return;
        setReadings((prev) => ({
          ...prev,
          [widget.id]: payload as WidgetData,
        }));
      } catch (cause) {
        if (token !== readingToken.current) return;
        setReadings((prev) => ({
          ...prev,
          [widget.id]: {
            failed:
              cause instanceof Error ? cause.message : 'Gagal memuat data widget',
          },
        }));
      }
    },
    [],
  );

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

  /**
   * Create a workspace. The backend endpoint and the proxy now exist; before this the
   * page had no create affordance at all, so "Belum ada workspace" was a permanent state
   * rather than a starting one.
   */
  const create = async () => {
    if (!newName.trim()) {
      setCreateError('Nama workspace wajib diisi.');
      return;
    }
    setBusy('create');
    setCreateError(null);
    try {
      const res = await fetch('/api/tenant/dashboards', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: newName.trim(),
          audience: newShared ? 'TENANT_SHARED' : 'PERSONAL',
        }),
      });
      const payload = (await res.json().catch(() => null)) as {
        message?: string;
        error?: { message?: string };
      } | null;
      if (!res.ok) {
        throw new Error(
          payload?.message ?? payload?.error?.message ?? `backend ${res.status}`,
        );
      }
      setNewName('');
      setNewShared(false);
      setShowCreate(false);
      toast.push('success', 'Workspace dibuat.');
      await load();
    } catch (cause) {
      setCreateError(cause instanceof Error ? cause.message : 'Gagal membuat workspace');
    } finally {
      setBusy(null);
    }
  };

  const open = async (id: string) => {
    setBusy(`open-${id}`);
    try {
      const res = await fetch(`/api/tenant/dashboards/${id}`);
      const data = (await res.json()) as Resolution;
      setResolution(data);
      setOpenId(id);

      // A token bump invalidates any in-flight reading from a workspace the operator has
      // already navigated away from, so a slow response cannot repaint the current grid
      // with another dashboard's numbers.
      const token = readingToken.current + 1;
      readingToken.current = token;
      setReadings({});
      for (const widget of data.widgets ?? []) {
        if (widget.state !== 'READY') continue;
        void loadReading(id, widget, token);
      }
    } catch {
      toast.push('error', 'Gagal membuka workspace');
    } finally {
      setBusy(null);
    }
  };

  /**
   * Delete a workspace.
   *
   * The backend requires the revision the operator was actually looking at. Sending the
   * revision from the rendered row is the whole point: if the dashboard changed since the
   * list was drawn, the backend refuses with 409 and the operator keeps their work instead
   * of deleting a version they never saw. A missing revision is not defaulted here for the
   * same reason the proxy does not default it.
   */
  const remove = async (id: string, name: string, revision: number) => {
    setBusy(`delete-${id}`);
    try {
      const res = await fetch(
        `/api/tenant/dashboards/${encodeURIComponent(
          id,
        )}?expectedRevision=${encodeURIComponent(String(revision))}`,
        { method: 'DELETE' },
      );
      const payload = (await res.json().catch(() => null)) as {
        message?: string;
        error?: { message?: string };
      } | null;
      if (!res.ok) {
        throw new Error(
          res.status === 409
            ? 'Workspace berubah sejak ditampilkan. Muat ulang daftar lalu coba lagi.'
            : (payload?.message ??
              payload?.error?.message ??
              `backend ${res.status}`),
        );
      }
      toast.push('success', `Workspace "${name}" dihapus.`);
      readingToken.current += 1;
      setOpenId(null);
      setResolution(null);
      setReadings({});
      await load();
    } catch (cause) {
      toast.push('error', cause instanceof Error ? cause.message : 'Gagal menghapus');
    } finally {
      setBusy(null);
    }
  };

  if (editingId) {
    return (
      <TenantDashboardEditor
        dashboardId={editingId}
        onClose={() => {
          const wasOpen = openId;
          setEditingId(null);
          // Re-read both the list and the resolution. The editor saved a whole-document
          // replace, so what is rendered may no longer match what is stored. Reloading
          // only the list left the open workspace showing "0 widget" right after a save that
          // added one — the widget existed but was invisible until a full page refresh.
          void load();
          if (wasOpen) void open(wasOpen);
        }}
      />
    );
  }

  if (rows === null && !error) {
    return <div className="h-40 animate-pulse rounded-2xl bg-slate-800/60" />;
  }

  if (openId) {
    const widgets = resolution?.widgets ?? [];
    return (
      <div>
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => {
              readingToken.current += 1;
              setOpenId(null);
              setResolution(null);
              setReadings({});
            }}
            className="flex items-center gap-2 rounded-lg border border-slate-700/70 px-3 py-1.5 text-[12.5px] font-semibold text-slate-300 hover:border-teal-500/50 hover:text-teal-300"
          >
            <ArrowLeft className="h-4 w-4" /> Kembali ke daftar
          </button>
          <button
            type="button"
            onClick={() => setEditingId(openId)}
            className="rounded-lg border border-teal-500/50 px-3 py-1.5 text-[12.5px] font-semibold text-teal-300 hover:bg-teal-500/10"
          >
            Edit layout &amp; widget
          </button>
        </div>
        <h2 className="mb-1 text-[18px] font-extrabold tracking-tight text-slate-50">
          {resolution?.dashboard?.name ?? 'Workspace'}
        </h2>
        <p className="mb-5 text-[12.5px] text-slate-500">
          {widgets.length} widget · modul 10 widget types
        </p>
        {widgets.length === 0 ? (
          <div className="iot2-panel">
            <EmptyState
              icon={LayoutDashboard}
              title="Workspace kosong"
              description="Workspace ini belum memiliki widget. Gunakan Edit layout & widget untuk menambahkannya."
            />
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {widgets.map((widget) => (
              <WidgetCard
                key={widget.id}
                widget={widget}
                reading={readings[widget.id] ?? null}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      {/* Create control. Its absence is what made this page permanently empty: the
          backend has accepted dashboard creation since Modul 18, but nothing on screen
          could reach it. */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => {
            setShowCreate((v) => !v);
            setCreateError(null);
          }}
          className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-teal-400 to-emerald-500 px-4 py-2 text-[13px] font-bold text-slate-950 transition-all hover:-translate-y-0.5 hover:brightness-110"
        >
          <Plus className="h-4 w-4" strokeWidth={2.5} />
          Workspace Baru
        </button>
        {rows && rows.length > 0 ? (
          <span className="text-[12px] text-slate-500">
            {rows.length} workspace
          </span>
        ) : null}
      </div>

      {showCreate ? (
        <div className="iot2-panel mb-4">
          <label className="mb-1.5 block text-[12.5px] font-semibold text-slate-400">
            Nama workspace
          </label>
          <input
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void create();
            }}
            maxLength={120}
            placeholder="contoh: Pemantauan Lantai 1"
            className="w-full rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2 text-[13.5px] text-slate-100 outline-none focus:border-teal-400"
          />
          <label className="mt-3 flex items-center gap-2 text-[12.5px] text-slate-400">
            <input
              type="checkbox"
              checked={newShared}
              onChange={(event) => setNewShared(event.target.checked)}
              className="h-4 w-4 accent-teal-400"
            />
            Bagikan ke seluruh tenant (butuh peran ADMIN)
          </label>
          {createError ? (
            <p role="alert" className="mb-0 mt-2 text-[12px] text-red-300">
              {createError}
            </p>
          ) : null}
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={() => void create()}
              disabled={busy === 'create'}
              className="rounded-lg bg-teal-400 px-4 py-2 text-[13px] font-bold text-slate-950 transition-colors hover:bg-teal-300 disabled:opacity-50"
            >
              {busy === 'create' ? 'Membuat…' : 'Buat Workspace'}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowCreate(false);
                setCreateError(null);
              }}
              className="text-[12.5px] font-medium text-slate-400 hover:text-slate-200"
            >
              Batal
            </button>
          </div>
        </div>
      ) : null}

      {error ? (
        <EmptyState icon={LayoutDashboard} title="Workspace tidak tersedia" description={`${error}. Coba beberapa saat lagi.`} />
      ) : rows === null ? (
        <div className="h-40 animate-pulse rounded-2xl bg-slate-800/60" />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={LayoutDashboard}
          title="Belum ada workspace"
          description="Belum ada workspace. Tekan tombol Workspace Baru di atas untuk membuat dasbor pertamamu."
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
                onClick={() => {
                  // A row with no revision cannot be deleted safely: the backend requires the
                  // token precisely so a stale click cannot destroy a newer version, and
                  // guessing one would remove that protection. Refuse instead.
                  if (typeof row.revision !== 'number') {
                    toast.push(
                      'error',
                      'Revisi workspace tidak dimuat. Muat ulang halaman lalu coba lagi.',
                    );
                    return;
                  }
                  void remove(row.id, row.name ?? row.id, row.revision);
                }}
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

/**
 * One widget tile: identity from the resolution, values from the widget-data query.
 *
 * The two are deliberately kept apart. A widget that failed to resolve never gets queried,
 * and a widget that resolved but has no readings is not turned into a zero — the card says
 * which of those two happened, because "0" and "no data" are different facts about a
 * device and an operator acting on them should not be misled.
 */
function WidgetCard({
  widget,
  reading,
}: {
  widget: ResolvedWidget;
  reading: WidgetReading | null;
}) {
  const binding = widget.bindings?.[0];
  const deviceLabel = binding?.device?.id
    ? `perangkat ${binding.device.id.slice(0, 8)}…`
    : '—';

  return (
    <div className="rounded-2xl border border-slate-800/80 bg-[#111c2e] p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="text-[10.5px] font-bold uppercase tracking-widest text-teal-400">
          {widget.kind ?? 'WIDGET'}
        </div>
        <span className="shrink-0 rounded-full border border-slate-700 bg-slate-900/60 px-2 py-0.5 text-[10.5px] font-bold text-slate-400">
          {readingStateLabel(widget, reading)}
        </span>
      </div>
      <div className="mt-2 text-[15px] font-bold text-slate-100">
        {widget.title ?? widget.id.slice(0, 8)}
      </div>
      <div className="mt-1 text-[12px] text-slate-500">
        {deviceLabel}
        {binding?.capability?.key ? ` · ${binding.capability.key}` : ''}
      </div>
      <div className="mt-3 border-t border-slate-800/70 pt-3">
        <WidgetReadings widget={widget} reading={reading} />
      </div>
    </div>
  );
}

function readingStateLabel(
  widget: ResolvedWidget,
  reading: WidgetReading | null,
): string {
  if (widget.state && widget.state !== 'READY') {
    return STATE_LABEL[widget.state] ?? widget.state;
  }
  if (!reading) return 'Memuat…';
  if ('failed' in reading) return 'Gangguan';
  return STATE_LABEL[reading.state] ?? reading.state;
}

function WidgetReadings({
  widget,
  reading,
}: {
  widget: ResolvedWidget;
  reading: WidgetReading | null;
}) {
  // A widget the resolver rejected is never queried, so this is the only honest thing to
  // show: the resolver's own reason, not an empty data panel.
  if (widget.state && widget.state !== 'READY') {
    return (
      <p className="m-0 text-[12px] text-slate-500">
        {widget.message ?? 'Widget tidak dapat di-resolve.'}
      </p>
    );
  }

  if (!reading) {
    return <p className="m-0 text-[12px] text-slate-500">Memuat data widget…</p>;
  }

  if ('failed' in reading) {
    return <p className="m-0 text-[12px] text-amber-300">{reading.failed}</p>;
  }

  if (reading.state !== 'READY' && !(widget.kind === 'MAP' && reading.state === 'STALE')) {
    return (
      <p className="m-0 text-[12px] text-slate-400">
        {reading.message ?? STATE_LABEL[reading.state] ?? reading.state}
      </p>
    );
  }

  if (reading.bindings.length === 0) {
    return <p className="m-0 text-[12px] text-slate-400">Widget tanpa binding.</p>;
  }

  if (widget.kind === 'MAP') return <GeoMap locations={reading.bindings.filter((entry) => entry.data && (entry.state === 'READY' || entry.state === 'STALE')).map((entry) => entry.data as unknown as MapLocation)} />;

  const unit = widget.bindings?.[0]?.capability?.unit ?? null;
  const precision = widget.bindings?.[0]?.capability?.constraints?.precision;

  return (
    <dl className="m-0 space-y-2">
      {reading.bindings.map((entry) => (
        <div key={entry.id} className="flex items-baseline justify-between gap-3">
          <dt className="text-[12px] text-slate-500">{entry.alias}</dt>
          <dd className="m-0 text-right text-[14px] font-bold text-slate-100">
            {formatBinding(entry, unit, precision)}
          </dd>
        </div>
      ))}
      <WidgetTimestamp data={reading} />
    </dl>
  );
}

function WidgetTimestamp({ data }: { data: WidgetData }) {
  const observedAt = data.bindings.find((entry) => entry.observedAt)?.observedAt;
  const value = observedAt ?? data.generatedAt;
  return (
    <div className="border-t border-slate-800/70 pt-2 text-[11px] text-slate-500">
      Diperbarui <time dateTime={value}>{formatDate(value)}</time>
    </div>
  );
}

/**
 * Render one binding's value.
 *
 * A binding can answer with a scalar (`value`/`status`) or with a series (`points`/
 * `buckets`, each row carrying `observedAt` plus one of `value`/`avg`/`max`/`min`). Any
 * shape not recognized falls through to the binding's own state rather than inventing a
 * number, which is the whole point of reading the backend's `state` instead of formatting
 * blindly.
 */
function formatBinding(
  binding: WidgetBindingData,
  unit: string | null,
  precision?: number,
): string {
  if (!binding.data) return STATE_LABEL[binding.state] ?? binding.state;
  if ('value' in binding.data) {
    return withUnit(formatUnknown(binding.data.value, precision), unit);
  }
  if ('status' in binding.data) {
    return withUnit(formatUnknown(binding.data.status, precision), unit);
  }
  const series = extractSeries(binding);
  if (series.length > 0) {
    const latest = series[series.length - 1]?.value;
    return withUnit(formatUnknown(latest, precision), unit);
  }
  return STATE_LABEL[binding.state] ?? binding.state;
}

function extractSeries(binding: WidgetBindingData) {
  const candidates = binding.data?.points ?? binding.data?.buckets;
  if (!Array.isArray(candidates)) return [];

  return candidates.flatMap((candidate) => {
    if (!candidate || typeof candidate !== 'object') return [];
    const row = candidate as Record<string, unknown>;
    const observedAt = row.observedAt ?? row.end ?? row.start;
    const value = row.value ?? row.avg ?? row.average ?? row.max ?? row.min;
    return typeof observedAt === 'string' && value !== undefined
      ? [{ observedAt, value }]
      : [];
  });
}

function withUnit(value: string, unit: string | null): string {
  return unit ? `${value} ${unit}` : value;
}

function formatUnknown(value: unknown, precision?: number): string {
  if (typeof value === 'number') {
    return new Intl.NumberFormat('id-ID', {
      maximumFractionDigits: precision ?? 2,
    }).format(value);
  }
  if (typeof value === 'boolean') return value ? 'Aktif' : 'Nonaktif';
  if (typeof value === 'string') return value;
  if (value === null || value === undefined) return 'Tidak tersedia';
  return 'Data tersedia';
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'waktu tidak diketahui'
    : new Intl.DateTimeFormat('id-ID', {
        dateStyle: 'short',
        timeStyle: 'short',
      }).format(date);
}

function payloadError(
  payload: { message?: string; error?: { message?: string } } | null,
): string | null {
  if (!payload) return null;
  return payload.message ?? payload.error?.message ?? null;
}

function payloadUnauthorized(
  payload: { message?: string; error?: { message?: string } } | null,
): string {
  return (
    payloadError(payload) ??
    'Sesi tidak valid. Data widget tidak dapat dimuat.'
  );
}
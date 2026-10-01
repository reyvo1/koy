'use client';

/**
 * The dashboard editor (Modul 10).
 *
 * Until this existed, the Workspace page told an operator that widgets were added "lewat
 * editor Modul 10" — a screen that was not in the console. The backend has accepted
 * `PUT /dashboards/:id` since the aggregate write DTO landed, and the read response was
 * already shaped to be writable, so the only missing piece was this component.
 *
 * Every aggregate change is saved as one whole-document replace. The backend demands
 * `expectedRevision` and refuses a stale one with 409, which is why the revision is carried
 * from the loaded aggregate and never defaulted: a 409 here means someone else changed the
 * document, and overwriting it would silently discard their widgets.
 *
 * Fail-closed throughout, matching the rest of the console: a device list or capability
 * list that cannot be loaded renders as a stated failure, never as an empty picker that
 * looks like a tenant with no devices.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  Loader2,
  Plus,
  Save,
  Trash2,
  TriangleAlert,
} from 'lucide-react';
import { useToast } from '@/components/ui-polish';
import {
  newLocalId,
  toWritePayload,
  type Binding,
  type BindingIntent,
  type BindingMode,
  type Breakpoint,
  type CapabilityOption,
  type DashboardAggregate,
  type DeviceOption,
  type LayoutItem,
  type Widget,
  type WidgetKind,
} from '@/components/tenant-dashboard-editor';

const WIDGET_KINDS: WidgetKind[] = [
  'CARD',
  'SWITCH',
  'GAUGE',
  'CHART',
  'MAP',
  'TABLE',
  'STATUS',
];
const INTENTS: BindingIntent[] = ['READ', 'REPORT', 'WRITE'];
const MODES: BindingMode[] = [
  'DEVICE_STATUS',
  'LATEST',
  'HISTORY',
  'AGGREGATE',
  'COMMAND',
];
const BREAKPOINTS: Breakpoint[] = ['DESKTOP', 'TABLET', 'MOBILE'];

const KIND_LABEL: Record<WidgetKind, string> = {
  CARD: 'Kartu',
  SWITCH: 'Saklar',
  GAUGE: 'Gauge',
  CHART: 'Grafik',
  MAP: 'Peta',
  TABLE: 'Tabel',
  STATUS: 'Status',
};

const MODE_LABEL: Record<BindingMode, string> = {
  DEVICE_STATUS: 'Status perangkat',
  LATEST: 'Nilai terakhir',
  HISTORY: 'Riwayat',
  AGGREGATE: 'Agregat',
  COMMAND: 'Perintah',
};

/** A GAUGE is rejected without a min/max range; see `DASHBOARD_WIDGET_RESOLUTION_INVALID`. */
function presentationFor(kind: WidgetKind): Record<string, unknown> | undefined {
  return kind === 'GAUGE' ? { min: 0, max: 100 } : undefined;
}

interface Props {
  dashboardId: string;
  onClose: () => void;
}

export default function TenantDashboardEditor({ dashboardId, onClose }: Props) {
  const [aggregate, setAggregate] = useState<DashboardAggregate | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [devices, setDevices] = useState<DeviceOption[] | null>(null);
  const [deviceError, setDeviceError] = useState<string | null>(null);
  const [capabilities, setCapabilities] = useState<Record<string, CapabilityOption[]>>({});
  const [capabilityError, setCapabilityError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const toast = useToast();
  const loadToken = useRef(0);

  const message = (cause: unknown, fallback: string) => {
    if (cause instanceof Error) return cause.message;
    if (cause && typeof cause === 'object' && 'message' in cause) {
      return String((cause as { message: unknown }).message);
    }
    return fallback;
  };

  const load = useCallback(async () => {
    const token = loadToken.current + 1;
    loadToken.current = token;
    try {
      const res = await fetch(`/api/tenant/dashboards/${encodeURIComponent(dashboardId)}/aggregate`, {
        cache: 'no-store',
      });
      const payload = (await res.json().catch(() => null)) as Record<string, unknown> | null;
      if (res.status === 401 || res.status === 403) {
        throw new Error('Sesi tidak diizinkan untuk workspace ini.');
      }
      if (!res.ok || !payload) throw new Error(`backend ${res.status}`);
      if (token !== loadToken.current) return;
      setAggregate(payload as unknown as DashboardAggregate);
      setLoadError(null);
    } catch (cause) {
      if (token !== loadToken.current) return;
      setLoadError(message(cause, 'Gagal memuat workspace'));
    }
  }, [dashboardId]);

  const loadDevices = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/tenant-devices', { cache: 'no-store' });
      if (!res.ok) throw new Error(`backend ${res.status}`);
      const payload = (await res.json().catch(() => null)) as
        | DeviceOption[]
        | { items?: DeviceOption[] }
        | null;
      const rows = Array.isArray(payload) ? payload : (payload?.items ?? []);
      setDevices(rows);
      setDeviceError(null);
    } catch (cause) {
      // Fail closed: an empty picker would read as "this tenant has no devices", which is a
      // different statement and the one an operator would act on.
      setDevices(null);
      setDeviceError(message(cause, 'Gagal memuat daftar perangkat'));
    }
  }, []);

  const loadCapabilities = useCallback(async (deviceId: string) => {
    if (capabilities[deviceId]) return;
    try {
      const res = await fetch(
        `/api/admin/device-capabilities?deviceId=${encodeURIComponent(deviceId)}`,
        { cache: 'no-store' },
      );
      if (!res.ok) throw new Error(`backend ${res.status}`);
      const payload = (await res.json().catch(() => null)) as
        | CapabilityOption[]
        | { items?: CapabilityOption[] }
        | null;
      const rows = Array.isArray(payload) ? payload : (payload?.items ?? []);
      setCapabilities((prev) => ({ ...prev, [deviceId]: rows }));
      setCapabilityError(null);
    } catch (cause) {
      setCapabilityError(message(cause, 'Gagal memuat capability perangkat'));
    }
  }, [capabilities]);

  useEffect(() => {
    void load();
    void loadDevices();
  }, [load, loadDevices]);

  /**
   * Give a layout-less dashboard one. Dashboards created before the create route shipped a
   * default grid have no layout, and a layout item cannot name a parent that does not exist,
   * so without this the editor is a dead end for them — it opens, shows a reason, and offers
   * no way forward.
   */
  const addLayout = () => {
    setAggregate((prev) => {
      if (!prev) return prev;
      const used = new Set(prev.layouts.map((l) => l.breakpoint));
      const breakpoint = BREAKPOINTS.find((b) => !used.has(b)) ?? 'DESKTOP';
      return {
        ...prev,
        layouts: [
          ...prev.layouts,
          { id: newLocalId(), breakpoint, columns: 12, rowHeight: 8, gap: 12, items: [] },
        ],
      };
    });
    setDirty(true);
  };

  const addWidget = () => {
    setAggregate((prev) => {
      if (!prev) return prev;
      const layout = prev.layouts[0];
      if (!layout) return prev;
      const id = newLocalId();
      const widget: Widget = {
        id,
        kind: 'CARD',
        title: `Widget ${prev.widgets.length + 1}`,
        schemaVersion: '1.0.0',
        presentationConfig: presentationFor('CARD'),
        bindings: [],
      };
      const item: LayoutItem = {
        id: newLocalId(),
        layoutId: layout.id,
        widgetId: id,
        x: 0,
        y: prev.layouts[0].items.length,
        width: Math.min(4, layout.columns),
        height: 3,
      };
      const next: DashboardAggregate = {
        ...prev,
        widgets: [...prev.widgets, widget],
        layouts: prev.layouts.map((l) =>
          l.id === layout.id ? { ...l, items: [...l.items, item] } : l,
        ),
      };
      setDirty(true);
      return next;
    });
  };

  const removeWidget = (widgetId: string) => {
    setAggregate((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        widgets: prev.widgets.filter((w) => w.id !== widgetId),
        layouts: prev.layouts.map((l) => ({
          ...l,
          items: l.items.filter((i) => i.widgetId !== widgetId),
        })),
      };
    });
    setDirty(true);
  };

  const patchWidget = (widgetId: string, patch: Partial<Widget>) => {
    setAggregate((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        widgets: prev.widgets.map((w) => (w.id === widgetId ? { ...w, ...patch } : w)),
      };
    });
    setDirty(true);
  };

  const patchItem = (itemId: string, patch: Partial<LayoutItem>) => {
    setAggregate((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        layouts: prev.layouts.map((l) => ({
          ...l,
          items: l.items.map((i) => (i.id === itemId ? { ...i, ...patch } : i)),
        })),
      };
    });
    setDirty(true);
  };

  const addBinding = (widgetId: string) => {
    const device = devices?.[0];
    if (!device) {
      toast.push('error', 'Belum ada perangkat yang bisa dipilih.');
      return;
    }
    setAggregate((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        widgets: prev.widgets.map((w) => {
          if (w.id !== widgetId) return w;
          const binding: Binding = {
            id: newLocalId(),
            widgetId,
            alias: `data${w.bindings.length + 1}`,
            intent: 'READ',
            mode: 'LATEST',
            deviceId: device.id,
          };
          // Load its capabilities immediately. Otherwise the first binding on a widget is
          // born with an empty capability picker and only fills in if the operator happens
          // to switch the device — the binding they just created looks unusable.
          void loadCapabilities(device.id);
          return { ...w, bindings: [...w.bindings, binding] };
        }),
      };
    });
    setDirty(true);
  };

  const patchBinding = (
    widgetId: string,
    bindingId: string,
    patch: Partial<Binding>,
  ) => {
    setAggregate((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        widgets: prev.widgets.map((w) =>
          w.id === widgetId
            ? {
                ...w,
                bindings: w.bindings.map((b) =>
                  b.id === bindingId ? { ...b, ...patch } : b,
                ),
              }
            : w,
        ),
      };
    });
    setDirty(true);
  };

  const removeBinding = (widgetId: string, bindingId: string) => {
    setAggregate((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        widgets: prev.widgets.map((w) =>
          w.id === widgetId
            ? { ...w, bindings: w.bindings.filter((b) => b.id !== bindingId) }
            : w,
        ),
      };
    });
    setDirty(true);
  };

  const save = async () => {
    if (!aggregate) return;
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch(`/api/tenant/dashboards/${encodeURIComponent(dashboardId)}/aggregate`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(toWritePayload(aggregate)),
      });
      const payload = (await res.json().catch(() => null)) as {
        message?: string;
        error?: { message?: string };
      } | null;
      if (res.status === 409) {
        // Someone else saved first. Do not retry with our own revision — that would overwrite
        // their widgets, which is exactly what the revision token exists to prevent.
        throw new Error(
          'Workspace berubah sejak Anda membukanya. Muat ulang lalu gabungkan perubahan Anda.',
        );
      }
      if (!res.ok) {
        throw new Error(
          payload?.message ?? payload?.error?.message ?? `backend ${res.status}`,
        );
      }
      toast.push('success', 'Workspace disimpan.');
      await load();
      setDirty(false);
    } catch (cause) {
      const text = message(cause, 'Gagal menyimpan workspace');
      // Both, deliberately. The toast is transient and disappears before the operator has
      // finished reading a backend validation message like "Gauge widgets require a numeric
      // capability" — and a save that failed silently looks exactly like a save that never
      // ran. The inline banner keeps the reason on screen while the editor is still open.
      toast.push('error', text);
      setSaveError(text);
    } finally {
      setSaving(false);
    }
  };

  if (loadError) {
    return (
      <div className="iot2-panel">
        <p className="mb-3 flex items-center gap-2 text-[13px] font-semibold text-rose-300">
          <TriangleAlert className="h-4 w-4" /> {loadError}
        </p>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-slate-700 px-3 py-1.5 text-[12.5px] font-semibold text-slate-300"
        >
          Kembali
        </button>
      </div>
    );
  }

  if (!aggregate) {
    return <div className="h-40 animate-pulse rounded-2xl bg-slate-800/60" />;
  }

  const itemsByWidget = new Map<string, LayoutItem[]>();
  for (const layout of aggregate.layouts) {
    for (const item of layout.items) {
      const list = itemsByWidget.get(item.widgetId) ?? [];
      list.push(item);
      itemsByWidget.set(item.widgetId, list);
    }
  }

  return (
    <div>
      {saveError ? (
        <div
          role="alert"
          className="mb-4 flex items-start gap-2 rounded-xl border border-rose-500/40 bg-rose-500/10 px-3.5 py-2.5 text-[13px] font-semibold text-rose-200"
        >
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            {saveError}
            <span className="mt-1 block text-[12px] font-normal text-rose-300/80">
              Perubahanmu belum tersimpan. Perbaiki lalu tekan Simpan lagi.
            </span>
          </span>
        </div>
      ) : null}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onClose}
          className="flex items-center gap-2 rounded-lg border border-slate-700/70 px-3 py-1.5 text-[12.5px] font-semibold text-slate-300 hover:border-teal-500/50"
        >
          <ArrowLeft className="h-4 w-4" /> Kembali
        </button>
        <h2 className="text-[18px] font-extrabold tracking-tight text-slate-50">
          Edit: {aggregate.name}
        </h2>
        <span className="text-[12px] text-slate-500">
          rev {aggregate.revision}
          {dirty ? ' · belum disimpan' : ''}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={addWidget}
            className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-teal-400 to-emerald-500 px-3.5 py-2 text-[13px] font-bold text-slate-950"
          >
            <Plus className="h-4 w-4" strokeWidth={2.5} /> Tambah widget
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving || !dirty}
            className="flex items-center gap-2 rounded-xl border border-teal-500/50 px-3.5 py-2 text-[13px] font-bold text-teal-300 disabled:opacity-40"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Simpan
          </button>
        </div>
      </div>

      {deviceError ? (
        <p className="mb-3 flex items-center gap-2 rounded-lg border border-rose-500/30 bg-rose-500/5 px-3 py-2 text-[12.5px] text-rose-300">
          <TriangleAlert className="h-4 w-4" /> {deviceError} — binding tidak bisa dipilih
          sampai daftar perangkat termuat.
        </p>
      ) : null}

      {aggregate.layouts.length === 0 ? (
        <div className="iot2-panel">
          <p className="mb-3 text-[13px] text-slate-400">
            Workspace ini belum punya layout, jadi widget belum bisa ditempatkan. Tambahkan
            layout dulu.
          </p>
          <button
            type="button"
            onClick={addLayout}
            className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-teal-400 to-emerald-500 px-3.5 py-2 text-[13px] font-bold text-slate-950"
          >
            <Plus className="h-4 w-4" strokeWidth={2.5} /> Tambah layout
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {aggregate.widgets.length === 0 ? (
            <div className="iot2-panel">
              <p className="text-[13px] text-slate-400">
                Belum ada widget. Gunakan &quot;Tambah widget&quot; untuk memulai.
              </p>
            </div>
          ) : null}

          {aggregate.widgets.map((widget) => {
            const items = itemsByWidget.get(widget.id) ?? [];
            return (
              <div key={widget.id} className="iot2-panel">
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <select
                    value={widget.kind}
                    onChange={(e) => {
                      const kind = e.target.value as WidgetKind;
                      patchWidget(widget.id, { kind, presentationConfig: presentationFor(kind) });
                    }}
                    className="rounded-lg border border-slate-700 bg-slate-900/60 px-2.5 py-1.5 text-[12.5px] text-slate-100"
                    aria-label="Jenis widget"
                  >
                    {WIDGET_KINDS.map((k) => (
                      <option key={k} value={k}>
                        {KIND_LABEL[k]}
                      </option>
                    ))}
                  </select>
                  <input
                    value={widget.title}
                    onChange={(e) => patchWidget(widget.id, { title: e.target.value })}
                    maxLength={120}
                    className="min-w-[200px] flex-1 rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-1.5 text-[12.5px] text-slate-100"
                    aria-label="Judul widget"
                  />
                  <button
                    type="button"
                    onClick={() => removeWidget(widget.id)}
                    className="flex items-center gap-1.5 rounded-lg border border-rose-500/40 px-2.5 py-1.5 text-[12px] font-semibold text-rose-300"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Hapus
                  </button>
                </div>

                {items.length > 0 ? (
                  <div className="mb-3 flex flex-wrap gap-2 text-[12px] text-slate-500">
                    {items.map((item) => (
                      <span
                        key={item.id}
                        className="rounded-lg border border-slate-700/70 px-2 py-1"
                      >
                        x{item.x} y{item.y} · {item.width}×{item.height}
                      </span>
                    ))}
                  </div>
                ) : null}

                <div className="space-y-2">
                  {widget.bindings.length === 0 ? (
                    <p className="text-[12.5px] text-slate-500">
                      Belum ada binding data.
                    </p>
                  ) : null}
                  {widget.bindings.map((binding) => (
                    <div
                      key={binding.id}
                      className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-700/60 bg-slate-900/40 p-2"
                    >
                      <input
                        value={binding.alias}
                        onChange={(e) =>
                          patchBinding(widget.id, binding.id, { alias: e.target.value })
                        }
                        maxLength={64}
                        className="w-28 rounded-lg border border-slate-700 bg-slate-900/70 px-2 py-1 text-[12px] text-slate-100"
                        aria-label="Alias binding"
                      />
                      <select
                        value={binding.deviceId}
                        onChange={(e) => {
                          const deviceId = e.target.value;
                          patchBinding(widget.id, binding.id, { deviceId, capabilityId: undefined });
                          void loadCapabilities(deviceId);
                        }}
                        className="rounded-lg border border-slate-700 bg-slate-900/70 px-2 py-1 text-[12px] text-slate-100"
                        aria-label="Perangkat"
                      >
                        {(devices ?? []).map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.name}
                          </option>
                        ))}
                      </select>
                      <select
                        value={binding.intent}
                        onChange={(e) =>
                          patchBinding(widget.id, binding.id, {
                            intent: e.target.value as BindingIntent,
                          })
                        }
                        className="rounded-lg border border-slate-700 bg-slate-900/70 px-2 py-1 text-[12px] text-slate-100"
                        aria-label="Intent"
                      >
                        {INTENTS.map((i) => (
                          <option key={i} value={i}>
                            {i}
                          </option>
                        ))}
                      </select>
                      <select
                        value={binding.mode}
                        onChange={(e) =>
                          patchBinding(widget.id, binding.id, {
                            mode: e.target.value as BindingMode,
                          })
                        }
                        className="rounded-lg border border-slate-700 bg-slate-900/70 px-2 py-1 text-[12px] text-slate-100"
                        aria-label="Mode"
                      >
                        {MODES.map((m) => (
                          <option key={m} value={m}>
                            {MODE_LABEL[m]}
                          </option>
                        ))}
                      </select>
                      <select
                        value={binding.capabilityId ?? ''}
                        onChange={(e) =>
                          patchBinding(widget.id, binding.id, {
                            capabilityId: e.target.value || undefined,
                          })
                        }
                        className="rounded-lg border border-slate-700 bg-slate-900/70 px-2 py-1 text-[12px] text-slate-100"
                        aria-label="Capability"
                      >
                        <option value="">— tanpa capability —</option>
                        {(capabilities[binding.deviceId] ?? []).map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.key}
                            {c.unit ? ` (${c.unit})` : ''}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => removeBinding(widget.id, binding.id)}
                        className="ml-auto rounded-lg border border-rose-500/40 px-2 py-1 text-[12px] font-semibold text-rose-300"
                      >
                        Hapus
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => addBinding(widget.id)}
                    className="rounded-lg border border-teal-500/40 px-2.5 py-1.5 text-[12px] font-semibold text-teal-300"
                  >
                    Tambah binding
                  </button>
                </div>
              </div>
            );
          })}

          <details className="iot2-panel">
            <summary className="cursor-pointer text-[12.5px] font-semibold text-slate-400">
              Posisi widget ({BREAKPOINTS.join(' / ')})
            </summary>
            <div className="mt-3 space-y-2">
              {aggregate.layouts.map((layout) => (
                <div key={layout.id}>
                  <p className="mb-1 text-[12px] font-semibold text-slate-400">
                    {layout.breakpoint} · {layout.columns} kolom · tinggi {layout.rowHeight} ·
                    celah {layout.gap}
                  </p>
                  {layout.items.map((item) => (
                    <div
                      key={item.id}
                      className="mb-1.5 flex flex-wrap items-center gap-2 rounded-lg border border-slate-700/60 p-2"
                    >
                      <span className="w-40 truncate text-[12px] text-slate-300">
                        {aggregate.widgets.find((w) => w.id === item.widgetId)?.title ??
                          item.widgetId}
                      </span>
                      {(['x', 'y', 'width', 'height'] as const).map((field) => (
                        <label key={field} className="flex items-center gap-1 text-[11.5px] text-slate-500">
                          {field}
                          <input
                            type="number"
                            min={field === 'width' || field === 'height' ? 1 : 0}
                            max={field === 'width' ? 24 : field === 'height' ? 256 : 64}
                            value={item[field]}
                            onChange={(e) =>
                              patchItem(item.id, { [field]: Number(e.target.value) || 0 })
                            }
                            className="w-16 rounded border border-slate-700 bg-slate-900/70 px-1.5 py-0.5 text-[12px] text-slate-100"
                          />
                        </label>
                      ))}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </details>

          {capabilityError ? (
            <p className="text-[12px] text-amber-300">{capabilityError}</p>
          ) : null}
        </div>
      )}
    </div>
  );
}

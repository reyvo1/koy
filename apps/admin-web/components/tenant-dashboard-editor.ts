/**
 * Types mirroring the dashboard aggregate the backend reads and writes.
 *
 * These are the read shape, and the write DTO is deliberately compatible with it: the
 * aggregate response echoes `layoutId` on every layout item and `widgetId` on every binding,
 * because the write DTO takes both as flat top-level arrays where the parent must be named.
 * A read that omitted them would be readable but not writable, and the client would have to
 * re-attach parents by hand to avoid a validation error on a document the server wrote.
 */

export type WidgetKind =
  | 'CARD'
  | 'SWITCH'
  | 'GAUGE'
  | 'CHART'
  | 'MAP'
  | 'TABLE'
  | 'STATUS';

export type BindingIntent = 'READ' | 'REPORT' | 'WRITE';
export type BindingMode =
  | 'DEVICE_STATUS'
  | 'LATEST'
  | 'HISTORY'
  | 'AGGREGATE'
  | 'COMMAND';
export type Breakpoint = 'DESKTOP' | 'TABLET' | 'MOBILE';

export interface LayoutItem {
  id: string;
  layoutId: string;
  widgetId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  minWidth?: number;
  minHeight?: number;
}

export interface Binding {
  id: string;
  widgetId: string;
  alias: string;
  intent: BindingIntent;
  mode: BindingMode;
  deviceId: string;
  capabilityId?: string;
  queryConfig?: Record<string, unknown>;
}

export interface Widget {
  id: string;
  kind: WidgetKind;
  title: string;
  schemaVersion?: string;
  presentationConfig?: Record<string, unknown>;
  bindings: Binding[];
}

export interface Layout {
  id: string;
  breakpoint: Breakpoint;
  columns: number;
  rowHeight: number;
  gap: number;
  items: LayoutItem[];
}

export interface DashboardAggregate {
  id: string;
  name: string;
  description?: string;
  audience: 'PERSONAL' | 'TENANT_SHARED';
  /** Optimistic-concurrency token; the write DTO requires it as `expectedRevision`. */
  revision: number;
  schemaVersion?: string;
  layouts: Layout[];
  widgets: Widget[];
}

/** The write payload: the same records, flattened to the top level. */
export interface DashboardWritePayload {
  name: string;
  description?: string;
  schemaVersion?: string;
  layouts: Array<Omit<Layout, 'items'>>;
  widgets: Array<Omit<Widget, 'bindings'>>;
  layoutItems: LayoutItem[];
  bindings: Binding[];
  expectedRevision: number;
}

export interface DeviceOption {
  id: string;
  name: string;
  status?: string;
}

export interface CapabilityOption {
  id: string;
  key: string;
  dataType?: string;
  unit?: string | null;
  isReadable?: boolean;
  isWritable?: boolean;
  constraints?: { min?: number; max?: number; precision?: number } | null;
}

/**
 * Flatten an aggregate into the write payload.
 *
 * `layoutItems` and `bindings` are nested in the read and flat in the write, and the parent
 * id has to travel with the child. Building the payload here rather than in the component
 * keeps one implementation of that mapping, so an editor that adds a widget cannot forget to
 * flatten its binding and discover it as a 400.
 */
export function toWritePayload(aggregate: DashboardAggregate): DashboardWritePayload {
  return {
    name: aggregate.name,
    description: aggregate.description,
    schemaVersion: aggregate.schemaVersion ?? '1.0.0',
    layouts: aggregate.layouts.map(({ id, breakpoint, columns, rowHeight, gap }) => ({
      id,
      breakpoint,
      columns,
      rowHeight,
      gap,
    })),
    widgets: aggregate.widgets.map(
      ({ id, kind, title, schemaVersion, presentationConfig }) => ({
        id,
        kind,
        title,
        schemaVersion: schemaVersion ?? '1.0.0',
        presentationConfig,
      }),
    ),
    layoutItems: aggregate.layouts.flatMap((layout) => layout.items),
    bindings: aggregate.widgets.flatMap((widget) => widget.bindings),
    expectedRevision: aggregate.revision,
  };
}

/** `crypto.randomUUID` is unavailable in insecure contexts, so fall back deterministically. */
export function newLocalId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // A v4-shaped fallback: the DTO validates UUID format, and an operator without a secure
  // context still has to be able to add a widget rather than hit a validation error they
  // cannot act on.
  const hex = '0123456789abcdef';
  let out = '';
  for (let i = 0; i < 36; i += 1) {
    if (i === 8 || i === 13 || i === 18 || i === 23) {
      out += '-';
    } else if (i === 14) {
      out += '4';
    } else if (i === 19) {
      out += hex[(Math.floor(Math.random() * 16) & 0x3) | 0x8].toUpperCase();
    } else {
      out += hex[Math.floor(Math.random() * 16)];
    }
  }
  return out;
}

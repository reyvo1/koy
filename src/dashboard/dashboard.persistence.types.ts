import {
  DashboardBindingIntent,
  DashboardBindingMode,
  DashboardBreakpoint,
  DashboardWidgetKind,
  Prisma,
} from '@prisma/client';

export interface DashboardLayoutPersistenceInput {
  id: string;
  breakpoint: DashboardBreakpoint;
  columns: number;
  rowHeight: number;
  gap: number;
}

export interface DashboardWidgetPersistenceInput {
  id: string;
  kind: DashboardWidgetKind;
  title: string;
  schemaVersion?: string;
  presentationConfig?: Prisma.InputJsonValue;
}

export interface DashboardLayoutItemPersistenceInput {
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

export interface DashboardWidgetBindingPersistenceInput {
  id: string;
  widgetId: string;
  alias: string;
  intent: DashboardBindingIntent;
  mode: DashboardBindingMode;
  deviceId: string;
  capabilityId?: string;
  queryConfig?: Prisma.InputJsonValue;
}

export interface DashboardAggregatePersistenceInput {
  tenantId: string;
  ownerMembershipId: string;
  name: string;
  description?: string;
  schemaVersion?: string;
  layouts: DashboardLayoutPersistenceInput[];
  widgets: DashboardWidgetPersistenceInput[];
  layoutItems: DashboardLayoutItemPersistenceInput[];
  bindings: DashboardWidgetBindingPersistenceInput[];
}

export interface ReplaceDashboardAggregatePersistenceInput extends DashboardAggregatePersistenceInput {
  dashboardId: string;
  expectedRevision: number;
}

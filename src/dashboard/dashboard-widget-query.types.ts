import { DashboardBindingMode, DashboardWidgetKind } from '@prisma/client';
export type DashboardWidgetDataState =
  'READY' | 'EMPTY' | 'STALE' | 'INVALID' | 'UNSUPPORTED' | 'ERROR';

export interface DashboardWidgetBindingDataResult {
  id: string;
  alias: string;
  mode: DashboardBindingMode;
  state: DashboardWidgetDataState;
  reasonCode: string | null;
  message: string | null;
  observedAt: string | null;
  data: Record<string, unknown> | null;
}

export interface DashboardWidgetDataSummary {
  total: number;
  ready: number;
  empty: number;
  stale: number;
  invalid: number;
  unsupported: number;
  error: number;
}

export interface DashboardWidgetDataResult {
  widgetId: string;
  kind: DashboardWidgetKind;
  title: string;
  state: DashboardWidgetDataState;
  reasonCode: string | null;
  message: string | null;
  generatedAt: string;
  summary: DashboardWidgetDataSummary;
  bindings: DashboardWidgetBindingDataResult[];
}

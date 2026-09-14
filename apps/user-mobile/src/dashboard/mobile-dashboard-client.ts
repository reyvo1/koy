import { MobileApiError } from '../session/mobile-session-client';
import {
  MobileDashboardAggregate,
  MobileDashboardExperience,
  MobileDashboardResolution,
  MobileResolvedWidget,
  MobileWidgetData,
  parseMobileDashboardAggregate,
  parseMobileDashboardList,
  parseMobileDashboardResolution,
  parseMobileWidgetData,
} from './mobile-dashboard-model';

const DASHBOARD_LIMIT = 50;
const WIDGET_QUERY_CONCURRENCY = 4;

export interface MobileDashboardGateway {
  requestJson<T>(pathname: string, init?: RequestInit): Promise<T>;
}

export async function loadMobileDashboardExperience(
  gateway: MobileDashboardGateway,
  requestedDashboardId: string | null,
): Promise<MobileDashboardExperience> {
  const listPayload = await gateway.requestJson<unknown>(
    `/dashboards?limit=${DASHBOARD_LIMIT}`,
  );
  const dashboards = parseMobileDashboardList(listPayload);
  const selectedDashboardId = selectDashboardId(
    dashboards,
    requestedDashboardId,
  );

  if (!selectedDashboardId) {
    return {
      dashboards,
      selectedDashboardId: null,
      dashboard: null,
      resolution: null,
      widgetData: {},
    };
  }

  const encodedDashboardId = encodeURIComponent(selectedDashboardId);
  const [aggregatePayload, resolutionPayload] = await Promise.all([
    gateway.requestJson<unknown>(`/dashboards/${encodedDashboardId}`),
    gateway.requestJson<unknown>(
      `/dashboards/${encodedDashboardId}/resolution`,
    ),
  ]);

  const dashboard = parseMobileDashboardAggregate(aggregatePayload);
  const resolution = parseMobileDashboardResolution(resolutionPayload);
  assertDashboardConsistency(selectedDashboardId, dashboard, resolution);

  const widgetEntries = await mapWithConcurrency(
    resolution.widgets,
    WIDGET_QUERY_CONCURRENCY,
    async (widget): Promise<[string, MobileWidgetData]> => {
      if (widget.state !== 'READY') {
        return [widget.id, unavailableWidgetData(dashboard, widget)];
      }

      try {
        const widgetPayload = await gateway.requestJson<unknown>(
          `/dashboards/${encodedDashboardId}/widgets/${encodeURIComponent(
            widget.id,
          )}/data`,
        );
        const widgetData = parseMobileWidgetData(widgetPayload);
        assertWidgetConsistency(dashboard, widget, widgetData);
        return [widget.id, widgetData];
      } catch (error) {
        if (
          error instanceof MobileApiError &&
          (error.status === 401 || error.status === 403)
        ) {
          throw error;
        }

        return [widget.id, failedWidgetData(dashboard, widget)];
      }
    },
  );

  return {
    dashboards,
    selectedDashboardId,
    dashboard,
    resolution,
    widgetData: Object.fromEntries(widgetEntries),
  };
}

function selectDashboardId(
  dashboards: MobileDashboardExperience['dashboards'],
  requestedDashboardId: string | null,
): string | null {
  if (
    requestedDashboardId &&
    dashboards.some((dashboard) => dashboard.id === requestedDashboardId)
  ) {
    return requestedDashboardId;
  }
  return dashboards[0]?.id ?? null;
}

async function mapWithConcurrency<T, R>(
  values: readonly T[],
  concurrency: number,
  worker: (value: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let nextIndex = 0;

  async function runWorker(): Promise<void> {
    while (nextIndex < values.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await worker(values[currentIndex] as T);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, values.length) }, () =>
      runWorker(),
    ),
  );

  return results;
}

function assertDashboardConsistency(
  selectedDashboardId: string,
  dashboard: MobileDashboardAggregate,
  resolution: MobileDashboardResolution,
): void {
  if (
    dashboard.id !== selectedDashboardId ||
    resolution.dashboardId !== selectedDashboardId ||
    dashboard.schemaVersion !== resolution.schemaVersion ||
    dashboard.revision !== resolution.revision
  ) {
    throw new Error('MOBILE_DASHBOARD_RESPONSE_MISMATCH');
  }
}

function assertWidgetConsistency(
  dashboard: MobileDashboardAggregate,
  widget: MobileResolvedWidget,
  data: MobileWidgetData,
): void {
  if (
    data.dashboardId !== dashboard.id ||
    data.schemaVersion !== dashboard.schemaVersion ||
    data.revision !== dashboard.revision ||
    data.widgetId !== widget.id ||
    data.kind !== widget.kind
  ) {
    throw new Error('MOBILE_WIDGET_RESPONSE_MISMATCH');
  }
}

function unavailableWidgetData(
  dashboard: MobileDashboardAggregate,
  widget: MobileResolvedWidget,
): MobileWidgetData {
  return {
    dashboardId: dashboard.id,
    schemaVersion: dashboard.schemaVersion,
    revision: dashboard.revision,
    widgetId: widget.id,
    kind: widget.kind,
    title: widget.title,
    state: widget.state,
    reasonCode: widget.reasonCode,
    generatedAt: new Date().toISOString(),
    summary: emptySummary(),
    bindings: [],
  };
}

function failedWidgetData(
  dashboard: MobileDashboardAggregate,
  widget: MobileResolvedWidget,
): MobileWidgetData {
  return {
    dashboardId: dashboard.id,
    schemaVersion: dashboard.schemaVersion,
    revision: dashboard.revision,
    widgetId: widget.id,
    kind: widget.kind,
    title: widget.title,
    state: 'ERROR',
    reasonCode: 'MOBILE_WIDGET_FETCH_FAILED',
    generatedAt: new Date().toISOString(),
    summary: { ...emptySummary(), error: 1, total: 1 },
    bindings: [],
  };
}

function emptySummary(): MobileWidgetData['summary'] {
  return {
    total: 0,
    ready: 0,
    empty: 0,
    stale: 0,
    invalid: 0,
    unsupported: 0,
    error: 0,
  };
}

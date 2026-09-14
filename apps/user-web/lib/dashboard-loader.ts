import 'server-only';

import { BackendRequestError, readBackendJson } from './backend';
import type {
  DashboardAggregate,
  DashboardExperiencePayload,
  DashboardResolution,
  DashboardSummary,
  UserProfile,
  WidgetData,
} from './contracts';
import { SessionBackendClient } from './session';

const DASHBOARD_LIMIT = 50;
const WIDGET_QUERY_CONCURRENCY = 4;

interface DashboardListResponse {
  items: DashboardSummary[];
  limit: number;
}

export async function loadDashboardExperience(
  client: SessionBackendClient,
  requestedDashboardId: string | null,
): Promise<DashboardExperiencePayload> {
  const profile = await requestJson<UserProfile>(client, '/users/profile');
  const list = await requestJson<DashboardListResponse>(
    client,
    `/dashboards?limit=${DASHBOARD_LIMIT}`,
  );
  const selectedDashboardId = selectDashboardId(
    list.items,
    requestedDashboardId,
  );

  if (!selectedDashboardId) {
    return {
      profile,
      dashboards: list.items,
      selectedDashboardId: null,
      dashboard: null,
      resolution: null,
      widgetData: {},
    };
  }

  const [dashboard, resolution] = await Promise.all([
    requestJson<DashboardAggregate>(
      client,
      `/dashboards/${encodeURIComponent(selectedDashboardId)}`,
    ),
    requestJson<DashboardResolution>(
      client,
      `/dashboards/${encodeURIComponent(selectedDashboardId)}/resolution`,
    ),
  ]);

  const widgetEntries = await mapWithConcurrency(
    resolution.widgets,
    WIDGET_QUERY_CONCURRENCY,
    async (widget): Promise<[string, WidgetData]> => {
      if (widget.state !== 'READY') {
        return [widget.id, unavailableWidgetData(dashboard, widget)];
      }

      try {
        const data = await requestJson<WidgetData>(
          client,
          `/dashboards/${encodeURIComponent(
            selectedDashboardId,
          )}/widgets/${encodeURIComponent(widget.id)}/data`,
        );
        return [widget.id, data];
      } catch (error) {
        if (
          error instanceof BackendRequestError &&
          (error.status === 401 || error.status === 403)
        ) {
          throw error;
        }
        return [widget.id, failedWidgetData(dashboard, widget)];
      }
    },
  );

  return {
    profile,
    dashboards: list.items,
    selectedDashboardId,
    dashboard,
    resolution,
    widgetData: Object.fromEntries(widgetEntries),
  };
}

async function requestJson<T>(
  client: SessionBackendClient,
  pathname: string,
): Promise<T> {
  return readBackendJson<T>(await client.request(pathname));
}

function selectDashboardId(
  dashboards: DashboardSummary[],
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
      results[currentIndex] = await worker(values[currentIndex]);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, values.length) }, () =>
      runWorker(),
    ),
  );

  return results;
}

function unavailableWidgetData(
  dashboard: DashboardAggregate,
  widget: DashboardResolution['widgets'][number],
): WidgetData {
  return {
    dashboardId: dashboard.id,
    schemaVersion: dashboard.schemaVersion,
    revision: dashboard.revision,
    widgetId: widget.id,
    kind: widget.kind,
    title: widget.title,
    state: widget.state,
    reasonCode: widget.reasonCode,
    message: widget.message,
    generatedAt: new Date().toISOString(),
    summary: emptySummary(),
    bindings: [],
  };
}

function failedWidgetData(
  dashboard: DashboardAggregate,
  widget: DashboardResolution['widgets'][number],
): WidgetData {
  return {
    dashboardId: dashboard.id,
    schemaVersion: dashboard.schemaVersion,
    revision: dashboard.revision,
    widgetId: widget.id,
    kind: widget.kind,
    title: widget.title,
    state: 'ERROR',
    reasonCode: 'USER_WEB_WIDGET_FETCH_FAILED',
    message: 'Widget data could not be loaded',
    generatedAt: new Date().toISOString(),
    summary: { ...emptySummary(), error: 1, total: 1 },
    bindings: [],
  };
}

function emptySummary(): WidgetData['summary'] {
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

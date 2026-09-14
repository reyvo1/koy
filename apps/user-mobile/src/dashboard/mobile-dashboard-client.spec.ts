import { MobileApiError } from '../session/mobile-session-client';
import {
  MobileDashboardGateway,
  loadMobileDashboardExperience,
} from './mobile-dashboard-client';
import { MobileDashboardValidationError } from './mobile-dashboard-model';

const dashboardId = 'dashboard-1';
const widgetId = 'widget-1';

function summary(id = dashboardId) {
  return {
    id,
    name: `Dashboard ${id}`,
    description: null,
    audience: 'PERSONAL',
    schemaVersion: '1.0.0',
    revision: 1,
    createdAt: '2026-07-21T00:00:00.000Z',
    updatedAt: '2026-07-21T00:00:00.000Z',
  };
}

function aggregate(id = dashboardId) {
  return {
    ...summary(id),
    layouts: [
      {
        id: 'layout-1',
        breakpoint: 'MOBILE',
        columns: 1,
        rowHeight: 120,
        gap: 12,
        items: [
          {
            id: 'item-1',
            widgetId,
            x: 0,
            y: 0,
            width: 1,
            height: 1,
            minWidth: null,
            minHeight: null,
          },
        ],
      },
    ],
    widgets: [
      {
        id: widgetId,
        kind: 'CARD',
        title: 'Suhu',
        schemaVersion: '1.0.0',
        presentationConfig: {},
        bindings: [
          {
            id: 'binding-1',
            alias: 'Suhu',
            intent: 'READ',
            mode: 'LATEST',
            deviceId: 'device-1',
            capabilityId: 'capability-1',
            queryConfig: null,
          },
        ],
      },
    ],
  };
}

function resolution(state: 'READY' | 'INVALID' | 'UNSUPPORTED' = 'READY') {
  return {
    dashboardId,
    schemaVersion: '1.0.0',
    revision: 1,
    summary: {
      total: 1,
      ready: state === 'READY' ? 1 : 0,
      invalid: state === 'INVALID' ? 1 : 0,
      unsupported: state === 'UNSUPPORTED' ? 1 : 0,
    },
    widgets: [
      {
        id: widgetId,
        kind: 'CARD',
        title: 'Suhu',
        state,
        reasonCode: state === 'READY' ? null : 'NOT_READY',
        message: state === 'READY' ? null : 'Internal backend message',
        presentation: {},
        supportedStates: ['READY', 'EMPTY', 'STALE', 'ERROR'],
        bindings: [
          {
            id: 'binding-1',
            alias: 'Suhu',
            intent: 'READ',
            mode: 'LATEST',
            device: { id: 'device-1', status: 'ONLINE' },
            capability: {
              id: 'capability-1',
              key: 'temperature',
              semanticType: 'temperature',
              dataType: 'NUMBER',
              unit: '°C',
              constraints: { min: -20, max: 80, precision: 1 },
              access: {
                readable: true,
                writable: false,
                reportable: true,
              },
            },
            query: {},
          },
        ],
      },
    ],
  };
}

function widgetData() {
  return {
    dashboardId,
    schemaVersion: '1.0.0',
    revision: 1,
    widgetId,
    kind: 'CARD',
    title: 'Suhu',
    state: 'READY',
    reasonCode: null,
    message: null,
    generatedAt: '2026-07-21T01:00:00.000Z',
    summary: {
      total: 1,
      ready: 1,
      empty: 0,
      stale: 0,
      invalid: 0,
      unsupported: 0,
      error: 0,
    },
    bindings: [
      {
        id: 'binding-1',
        alias: 'Suhu',
        mode: 'LATEST',
        state: 'READY',
        reasonCode: null,
        message: null,
        observedAt: '2026-07-21T00:59:00.000Z',
        data: { value: 25.4 },
      },
    ],
  };
}

function createGateway(
  responses: Record<string, unknown | Error>,
): MobileDashboardGateway & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    async requestJson<T>(pathname: string): Promise<T> {
      calls.push(pathname);
      const response = responses[pathname];
      if (response instanceof Error) throw response;
      if (response === undefined) {
        throw new Error(`Unexpected path: ${pathname}`);
      }
      return response as T;
    },
  };
}

describe('mobile dashboard client', () => {
  it('loads the bounded dashboard sequence and widget data', async () => {
    const gateway = createGateway({
      '/dashboards?limit=50': { items: [summary()], limit: 50 },
      [`/dashboards/${dashboardId}`]: aggregate(),
      [`/dashboards/${dashboardId}/resolution`]: resolution(),
      [`/dashboards/${dashboardId}/widgets/${widgetId}/data`]: widgetData(),
    });

    await expect(loadMobileDashboardExperience(gateway, null)).resolves.toEqual(
      expect.objectContaining({
        selectedDashboardId: dashboardId,
        widgetData: {
          [widgetId]: expect.objectContaining({
            state: 'READY',
            widgetId,
          }),
        },
      }),
    );

    expect(gateway.calls).toEqual([
      '/dashboards?limit=50',
      `/dashboards/${dashboardId}`,
      `/dashboards/${dashboardId}/resolution`,
      `/dashboards/${dashboardId}/widgets/${widgetId}/data`,
    ]);
  });

  it('keeps a valid requested dashboard selection', async () => {
    const secondId = 'dashboard-2';
    const secondAggregate = aggregate(secondId);
    secondAggregate.layouts[0].items = [];
    secondAggregate.widgets = [];

    const gateway = createGateway({
      '/dashboards?limit=50': {
        items: [summary(), summary(secondId)],
        limit: 50,
      },
      [`/dashboards/${secondId}`]: secondAggregate,
      [`/dashboards/${secondId}/resolution`]: {
        dashboardId: secondId,
        schemaVersion: '1.0.0',
        revision: 1,
        summary: { total: 0, ready: 0, invalid: 0, unsupported: 0 },
        widgets: [],
      },
    });

    const experience = await loadMobileDashboardExperience(gateway, secondId);
    expect(experience.selectedDashboardId).toBe(secondId);
    expect(gateway.calls).not.toContain(`/dashboards/${dashboardId}`);
  });

  it('does not query data for invalid or unsupported widgets', async () => {
    const gateway = createGateway({
      '/dashboards?limit=50': { items: [summary()], limit: 50 },
      [`/dashboards/${dashboardId}`]: aggregate(),
      [`/dashboards/${dashboardId}/resolution`]: resolution('UNSUPPORTED'),
    });

    const experience = await loadMobileDashboardExperience(gateway, null);
    expect(experience.widgetData[widgetId]).toEqual(
      expect.objectContaining({
        state: 'UNSUPPORTED',
        bindings: [],
      }),
    );
    expect(gateway.calls).toHaveLength(3);
  });

  it('isolates a non-auth widget failure as a bounded error card', async () => {
    const gateway = createGateway({
      '/dashboards?limit=50': { items: [summary()], limit: 50 },
      [`/dashboards/${dashboardId}`]: aggregate(),
      [`/dashboards/${dashboardId}/resolution`]: resolution(),
      [`/dashboards/${dashboardId}/widgets/${widgetId}/data`]: new Error(
        'backend details',
      ),
    });

    const experience = await loadMobileDashboardExperience(gateway, null);
    expect(experience.widgetData[widgetId]).toEqual(
      expect.objectContaining({
        state: 'ERROR',
        reasonCode: 'MOBILE_WIDGET_FETCH_FAILED',
      }),
    );
  });

  it('preserves authoritative 401 and rejects oversized responses', async () => {
    const unauthorized = createGateway({
      '/dashboards?limit=50': new MobileApiError(
        401,
        'AUTH_EXPIRED',
        'secret backend message',
        'request-1',
      ),
    });

    await expect(
      loadMobileDashboardExperience(unauthorized, null),
    ).rejects.toEqual(
      expect.objectContaining({
        status: 401,
        requestId: 'request-1',
      }),
    );

    const oversized = createGateway({
      '/dashboards?limit=50': {
        items: Array.from({ length: 51 }, (_, index) =>
          summary(`dashboard-${index}`),
        ),
        limit: 50,
      },
    });

    await expect(
      loadMobileDashboardExperience(oversized, null),
    ).rejects.toBeInstanceOf(MobileDashboardValidationError);
  });
});

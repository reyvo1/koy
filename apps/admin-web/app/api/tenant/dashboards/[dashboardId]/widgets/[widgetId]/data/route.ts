import { proxyBackend } from '@/lib/proxy';

/**
 * GET /api/tenant/dashboards/[dashboardId]/widgets/[widgetId]/data
 *
 * Bounded telemetry query for one resolved widget. The backend has served this since Module
 * 10 (`DashboardController.queryWidgetData`) and `apps/user-web` already consumes it through
 * its own loader, but admin-web had no proxy: the Workspace screen could resolve which
 * widgets exist and then had no way to ask for a single value, so it rendered titles and
 * device ids while never showing a reading. The endpoint was reachable only from the other
 * app.
 *
 * Authorization is not re-implemented here. The session client forwards the caller's own
 * credentials and the backend resolves `dashboard.read` with `allowOwner`, so a caller
 * outside the dashboard's tenant is refused there. This route adds no widening of its own.
 */
export async function GET(
  _request: Request,
  {
    params,
  }: {
    params: Promise<{ dashboardId: string; widgetId: string }>;
  },
) {
  const { dashboardId, widgetId } = await params;
  return proxyBackend(
    (client) =>
      client.request(
        `/dashboards/${encodeURIComponent(
          dashboardId,
        )}/widgets/${encodeURIComponent(widgetId)}/data`,
      ),
    {
      unauthorized: 'Sesi tidak valid.',
      unavailable: 'Data widget tidak dapat dimuat',
    },
  );
}

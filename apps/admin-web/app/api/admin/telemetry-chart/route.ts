import { NextResponse } from 'next/server';
import {
  AdminSessionBackendClient,
  clearSessionCookies,
} from '@/lib/session';

/**
 * GET /api/admin/telemetry-chart?deviceId=&capability=&hours=24
 *
 * Domain-bound proxy: resolves the first device carrying a numeric
 * capability when deviceId is omitted, then reads a bounded aggregation
 * from the backend (Modul 09 read-time aggregate, 1h buckets).
 *
 * The range bound is enforced by clamping `hours` below rather than by a separate
 * constant, so the 31-day ceiling and the value actually used cannot drift apart.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const hours = Math.min(Math.max(Number(url.searchParams.get('hours') ?? 24), 1), 24 * 31);
  const capability = url.searchParams.get('capability') ?? '';

  try {
    const client = await AdminSessionBackendClient.create();

    let deviceId = url.searchParams.get('deviceId');
    if (!deviceId) {
      const listResponse = await client.request('/devices?limit=100');
      const list = (await listResponse.json()) as Array<{
        id: string;
        name?: string;
      }>;
      // Prefer the temperature sensor for a meaningful chart, else first device.
      const preferred =
        list.find((d) => (d.name ?? '').toLowerCase().includes('suhu')) ??
        list[0];
      if (!preferred) {
        return NextResponse.json({ buckets: [] });
      }
      deviceId = preferred.id;
    }

    const effectiveCapability =
      capability || 'temperature.celsius';

    const to = new Date();
    const from = new Date(to.getTime() - hours * 3600 * 1000);
    const query = new URLSearchParams({
      capability: effectiveCapability,
      bucket: '1h',
      from: from.toISOString(),
      to: to.toISOString(),
    });

    const response = await client.request(
      `/devices/${deviceId}/telemetry/aggregate?${query.toString()}`,
    );
    if (!response.ok) {
      // Numeric capability may not exist on chosen device — empty chart.
      return NextResponse.json({ buckets: [] });
    }
    const payload = (await response.json()) as { buckets?: unknown[] };
    return NextResponse.json({ buckets: payload.buckets ?? [] });
  } catch (cause) {
    const status =
      cause instanceof Error && 'status' in cause
        ? Number((cause as { status: number }).status)
        : 502;
    if (status === 401 || status === 403) {
      const response = NextResponse.json(
        { error: { code: 'UNAUTHORIZED', message: 'Sesi admin tidak valid.' } },
        { status: 401 },
      );
      clearSessionCookies(response);
      return response;
    }
    return NextResponse.json(
      { error: { code: 'CHART_UNAVAILABLE', message: String(cause) } },
      { status: status >= 500 ? 502 : status },
    );
  }
}

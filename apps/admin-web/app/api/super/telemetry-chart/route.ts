import { NextResponse } from 'next/server';
import {
  AdminSessionBackendClient,
  clearSessionCookies,
  finalizeAdminSessionResponse,
} from '@/lib/session';

/**
 * GET /api/super/telemetry-chart?deviceId=&capability=&hours=24
 *
 * Platform-admin only proxy. The backend resolves the device's real tenant
 * before executing the tenant-bounded telemetry aggregation service.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const deviceId = url.searchParams.get('deviceId')?.trim();
  const capability = url.searchParams.get('capability')?.trim();
  const rawHours = Number(url.searchParams.get('hours') ?? 24);
  const hours = Number.isFinite(rawHours)
    ? Math.min(Math.max(rawHours, 1), 24 * 31)
    : 24;

  if (!deviceId || !capability) {
    return NextResponse.json(
      {
        error: {
          code: 'INVALID_QUERY',
          message: 'deviceId dan capability wajib diisi.',
        },
      },
      { status: 400 },
    );
  }

  try {
    const client = await AdminSessionBackendClient.create();
    const to = new Date();
    const from = new Date(to.getTime() - hours * 60 * 60 * 1000);
    const query = new URLSearchParams({
      capability,
      bucket: '1h',
      from: from.toISOString(),
      to: to.toISOString(),
    });
    const response = await client.request(
      `/admin/platform-devices/${encodeURIComponent(deviceId)}/telemetry/aggregate?${query.toString()}`,
    );
    const payload = await response.json().catch(() => null);
    if (payload === null) {
      const next = NextResponse.json(
        {
          error: {
            code: 'TELEMETRY_UNAVAILABLE',
            message: 'Backend mengembalikan respons yang tidak dapat dibaca.',
          },
        },
        { status: 502 },
      );
      return finalizeAdminSessionResponse(client, next, response.status);
    }
    const next = NextResponse.json(payload, { status: response.status });
    return finalizeAdminSessionResponse(client, next, response.status);
  } catch (cause) {
    const status =
      cause instanceof Error && 'status' in cause
        ? Number((cause as { status: number }).status)
        : 502;
    if (status === 401) {
      const response = NextResponse.json(
        { error: { code: 'UNAUTHORIZED', message: 'Sesi super admin tidak valid.' } },
        { status: 401 },
      );
      clearSessionCookies(response);
      return response;
    }
    return NextResponse.json(
      {
        error: {
          code: 'PLATFORM_TELEMETRY_UNAVAILABLE',
          message: cause instanceof Error ? cause.message : 'telemetry tidak tersedia',
        },
      },
      { status: status >= 500 ? 502 : status },
    );
  }
}

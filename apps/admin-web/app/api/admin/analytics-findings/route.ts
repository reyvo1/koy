import { NextResponse } from 'next/server';
import {
  AdminSessionBackendClient,
  clearSessionCookies,
  finalizeAdminSessionResponse,
} from '@/lib/session';

/**
 * GET /api/admin/analytics-findings — proxies recent Module 16 findings.
 * Fail-closed: any backend/auth failure returns an explicit error state so the
 * AI Center renders "unavailable" instead of fabricating insight data.
 */
export async function GET(request: Request) {
  const limit = new URL(request.url).searchParams.get('limit') ?? '50';

  try {
    const client = await AdminSessionBackendClient.create();
    const response = await client.request(
      `/admin/analytics-findings?limit=${encodeURIComponent(limit)}`,
    );
    const payload = await response.json();
    const next = NextResponse.json(payload, { status: response.status });
    return finalizeAdminSessionResponse(client, next, response.status);
  } catch (cause) {
    const status =
      cause instanceof Error && 'status' in cause
        ? Number((cause as { status: number }).status)
        : 502;
    if (status === 401) {
      const response = NextResponse.json(
        { error: { code: 'UNAUTHORIZED', message: 'Sesi admin tidak valid.' } },
        { status: 401 },
      );
      clearSessionCookies(response);
      return response;
    }
    return NextResponse.json(
      {
        error: {
          code: 'ANALYTICS_FINDINGS_UNAVAILABLE',
          message:
            cause instanceof Error
              ? cause.message
              : 'temuan analitik tidak tersedia',
        },
      },
      { status: status >= 500 ? 502 : status },
    );
  }
}

import { NextResponse } from 'next/server';
import {
  AdminSessionBackendClient,
  clearSessionCookies,
  finalizeAdminSessionResponse,
} from '@/lib/session';

/** GET /api/super/audit-logs — merged RBAC + share audit proxy (bounded). */
export async function GET() {
  try {
    const client = await AdminSessionBackendClient.create();
    const response = await client.request('/admin/audit-logs');
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
        { error: { code: 'UNAUTHORIZED', message: 'Sesi tidak valid.' } },
        { status: 401 },
      );
      clearSessionCookies(response);
      return response;
    }
    return NextResponse.json(
      {
        error: {
          code: 'AUDIT_UNAVAILABLE',
          message:
            cause instanceof Error ? cause.message : 'log audit tidak tersedia',
        },
      },
      { status: status >= 500 ? 502 : status },
    );
  }
}

import { NextResponse } from 'next/server';
import {
  AdminSessionBackendClient,
  clearSessionCookies,
} from '@/lib/session';

/**
 * GET /api/admin/device-capabilities?deviceId= — capability list proxy.
 */
export async function GET(request: Request) {
  const deviceId = new URL(request.url).searchParams.get('deviceId');
  if (!deviceId) {
    return NextResponse.json(
      { error: { code: 'MISSING_ID', message: 'deviceId wajib' } },
      { status: 400 },
    );
  }
  try {
    const client = await AdminSessionBackendClient.create();
    const response = await client.request(`/devices/${deviceId}/capabilities`);
    const payload = (await response.json()) as
      | { items?: unknown[] }
      | unknown[];
    const capabilities = Array.isArray(payload)
      ? payload
      : payload.items ?? [];
    return NextResponse.json({ capabilities, items: capabilities }, { status: 200 });
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
      { capabilities: [], items: [] },
      { status: status >= 500 ? 502 : status },
    );
  }
}


/** POST /api/admin/device-capabilities?deviceId= — create a tenant device capability. */
export async function POST(request: Request) {
  const deviceId = new URL(request.url).searchParams.get('deviceId');
  if (!deviceId) {
    return NextResponse.json(
      { error: { code: 'MISSING_ID', message: 'deviceId wajib' } },
      { status: 400 },
    );
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json(
      { error: { code: 'INVALID_BODY', message: 'Payload capability tidak valid.' } },
      { status: 400 },
    );
  }

  try {
    const client = await AdminSessionBackendClient.create();
    const response = await client.request(`/devices/${deviceId}/capabilities`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const payload = await response.json().catch(() => null);
    const next = NextResponse.json(payload ?? {}, { status: response.status });
    client.applySessionUpdate(next);
    return next;
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
      {
        error: {
          code: 'CAPABILITY_CREATE_FAILED',
          message: cause instanceof Error ? cause.message : 'Gagal membuat capability.',
        },
      },
      { status: status >= 500 ? 502 : status },
    );
  }
}

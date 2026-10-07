import { NextResponse } from 'next/server';
import {
  SessionBackendClient,
  clearSessionCookies,
} from '../../../../../lib/session';
import {
  BackendRequestError,
  readBackendJson,
} from '../../../../../lib/backend';
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ deviceId: string }> },
) {
  const { deviceId } = await params;
  const client = await SessionBackendClient.create();
  try {
    const upstream = await client.request(
      `/devices/${encodeURIComponent(deviceId)}/location?limit=50`,
    );
    const body = await readBackendJson<unknown>(upstream);
    const response = NextResponse.json(body);
    client.applySessionUpdate(response);
    return response;
  } catch (error) {
    const status = error instanceof BackendRequestError ? error.status : 503;
    const response = NextResponse.json(
      { message: 'Lokasi gagal dibaca.' },
      { status },
    );
    if (status === 401) clearSessionCookies(response);
    return response;
  }
}

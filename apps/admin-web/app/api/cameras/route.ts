import { NextResponse } from 'next/server';
import { proxyBackend } from '@/lib/proxy';
import {
  AdminSessionBackendClient,
  clearSessionCookies,
  finalizeAdminSessionResponse,
} from '../../../lib/session';
import { BackendRequestError } from '../../../lib/backend';

const MAX_NAME_LENGTH = 120;
const MAX_VENDOR_LENGTH = 80;

/**
 * GET /api/cameras — the camera directory.
 *
 * The backend has served `GET /cameras` since the onboarding slice shipped, but this
 * proxy only exported POST. The CCTV screen therefore had no way to learn which cameras
 * existed, and rendered its empty state unconditionally: an operator registered a camera,
 * received a QR code, and the page kept claiming there were none. Read-only, so it carries
 * no input validation.
 */
export async function GET() {
  return proxyBackend(
    (client: AdminSessionBackendClient) => client.request('/cameras'),
    {
      unauthorized: 'Sesi tidak valid.',
      unavailable: 'Daftar kamera tidak dapat dimuat.',
    },
  );
}

/** Proxy camera registration to the IoT API with the admin session token. */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (
    !body ||
    typeof body.name !== 'string' ||
    body.name.trim().length === 0 ||
    body.name.length > MAX_NAME_LENGTH ||
    typeof body.vendor !== 'string' ||
    body.vendor.trim().length === 0 ||
    body.vendor.length > MAX_VENDOR_LENGTH
  ) {
    return NextResponse.json(
      { message: 'Nama dan vendor kamera wajib diisi' },
      { status: 400 },
    );
  }

  try {
    const client = await AdminSessionBackendClient.create();
    const payload = {
      name: body.name.trim(),
      vendor: body.vendor.trim(),
      ...(typeof body.model === 'string' && body.model.trim()
        ? { model: body.model.trim() }
        : {}),
    };
    const upstream = await client.request('/cameras', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const upstreamPayload = await upstream.json().catch(() => null);
    const next = NextResponse.json(
      upstreamPayload ?? { message: upstream.ok ? 'Respons kamera tidak valid' : 'Pendaftaran kamera gagal' },
      { status: upstream.status },
    );
    return finalizeAdminSessionResponse(client, next, upstream.status);
  } catch (error) {
    if (error instanceof BackendRequestError) {
      const response = NextResponse.json(
        { message: error.message },
        { status: error.status },
      );
      if (error.status === 401) clearSessionCookies(response);
      return response;
    }
    return NextResponse.json(
      { message: 'IoT Platform API tidak terjangkau' },
      { status: 503 },
    );
  }
}
import { NextResponse } from 'next/server';
import { BackendRequestError, readBackendJson } from '../../../../lib/backend';
import {
  SessionBackendClient,
  clearSessionCookies,
} from '../../../../lib/session';

// Enumerated domain operations only; the backend repeats tenant and device VIEW/CONTROL checks.
async function handle(
  request: Request,
  context: { params: Promise<{ segments?: string[] }> },
) {
  const { segments = [] } = await context.params;
  const [resource, id, action] = segments;
  const method = request.method;
  const validId = typeof id === 'string' && /^[a-zA-Z0-9-]{1,128}$/.test(id);
  const valid =
    segments.length <= 3 &&
    ['scenes', 'schedules'].includes(resource) &&
    ((segments.length === 1 && ['GET', 'POST'].includes(method)) ||
      (segments.length === 2 &&
        validId &&
        (method === 'DELETE' ||
          (resource === 'scenes' && method === 'PATCH'))) ||
      (segments.length === 3 &&
        validId &&
        ((method === 'GET' &&
          action === (resource === 'scenes' ? 'executions' : 'runs')) ||
          (method === 'POST' &&
            (resource === 'scenes'
              ? action === 'run'
              : ['enable', 'disable'].includes(action))))));
  if (!valid)
    return NextResponse.json(
      { message: 'Aksi tidak tersedia.' },
      { status: 404 },
    );
  let body: unknown;
  if (method === 'POST' || method === 'PATCH') {
    const raw = await request.text();
    if (raw.length > 32768)
      return NextResponse.json(
        { message: 'Permintaan terlalu besar.' },
        { status: 413 },
      );
    try {
      body = raw ? JSON.parse(raw) : {};
    } catch {
      return NextResponse.json(
        { message: 'JSON tidak valid.' },
        { status: 400 },
      );
    }
    if (
      !body ||
      typeof body !== 'object' ||
      Array.isArray(body) ||
      'tenantId' in body
    )
      return NextResponse.json(
        { message: 'Permintaan tidak valid.' },
        { status: 400 },
      );
  }
  const client = await SessionBackendClient.create();
  try {
    const upstream = await client.request(
      `/${segments.map(encodeURIComponent).join('/')}${method === 'GET' && action ? '?limit=20' : ''}`,
      {
        method,
        ...(body
          ? {
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify(body),
            }
          : {}),
      },
    );
    const payload =
      upstream.status === 204
        ? { removed: true }
        : await readBackendJson<unknown>(upstream);
    const response = NextResponse.json(payload);
    client.applySessionUpdate(response);
    return response;
  } catch (error) {
    const status = error instanceof BackendRequestError ? error.status : 503;
    const message =
      status === 403
        ? 'Izin VIEW/CONTROL atas semua perangkat scene diperlukan.'
        : status === 409
          ? 'Scene nonaktif atau masih digunakan jadwal. Periksa relasinya.'
          : status === 503
            ? 'Runtime layanan belum tersedia.'
            : 'Aksi rutinitas gagal.';
    const response = NextResponse.json(
      { message },
      { status: status >= 500 && status !== 503 ? 502 : status },
    );
    if (status === 401) clearSessionCookies(response);
    return response;
  }
}
export const GET = handle;
export const POST = handle;
export const PATCH = handle;
export const DELETE = handle;

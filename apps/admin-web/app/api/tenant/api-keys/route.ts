import { NextResponse } from 'next/server';
import { proxyBackend } from '@/lib/proxy';

const MAX_NAME_LENGTH = 64;
const SCOPES = [
  'TELEMETRY_READ',
  'DEVICE_CONTROL',
  'SCENE_EXECUTE',
  'ANALYTICS_READ',
] as const;

/**
 * GET /api/tenant/api-keys — the tenant's own keys.
 *
 * The backend exposed POST and DELETE for tenant-scoped keys but no GET, so a tenant
 * admin could mint a key, see the plaintext once, and never learn what else existed or
 * what was still active. The platform-scoped list is a different route with different
 * guards and is not a substitute.
 */
export async function GET() {
  return proxyBackend((client) => client.request('/admin/api-keys'), {
    unauthorized: 'Sesi tidak valid.',
    unavailable: 'Daftar API key tidak dapat dimuat',
  });
}

/**
 * POST /api/tenant/api-keys — mint a tenant key.
 *
 * Validated here rather than forwarded blindly so an invalid scope or an empty name
 * fails at the edge with a message the operator can act on, instead of a 400 from the
 * backend whose body they never see.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    name?: unknown;
    scopes?: unknown;
  } | null;

  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  if (!name) {
    return NextResponse.json({ message: 'Nama key wajib diisi' }, { status: 400 });
  }
  if (name.length > MAX_NAME_LENGTH) {
    return NextResponse.json(
      { message: `Nama key maksimal ${MAX_NAME_LENGTH} karakter` },
      { status: 400 },
    );
  }

  const scopes = Array.isArray(body?.scopes)
    ? body.scopes.filter(
        (scope): scope is (typeof SCOPES)[number] =>
          typeof scope === 'string' && (SCOPES as readonly string[]).includes(scope),
      )
    : [];
  if (scopes.length === 0) {
    return NextResponse.json(
      { message: 'Pilih minimal satu scope yang valid' },
      { status: 400 },
    );
  }

  return proxyBackend(
    (client) =>
      client.request('/admin/api-keys', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, scopes }),
      }),
    { unauthorized: 'Sesi tidak valid.', unavailable: 'Gagal membuat API key' },
  );
}

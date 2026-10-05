import { NextResponse } from 'next/server';
import { proxyBackend } from '@/lib/proxy';

const PROVIDERS = ['ALEXA', 'GOOGLE_HOME', 'HOME_ASSISTANT', 'MQTT_BRIDGE'] as const;
const MAX_DISPLAY_NAME = 120;
const MAX_CREDENTIAL_REF = 256;
const SECRET_REF_PREFIX = 'secret://';

/** GET /api/tenant/integrations — tenant integration registry. */
export async function GET() {
  return proxyBackend(
    (client) => client.request('/admin/integrations'),
    { unauthorized: 'Sesi tidak valid.', unavailable: 'Registry integrasi tidak dapat dimuat' },
  );
}

/** POST /api/tenant/integrations — register a secret reference, never a raw credential. */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const provider = typeof body?.provider === 'string' ? body.provider : '';
  const displayName = typeof body?.displayName === 'string' ? body.displayName.trim() : '';
  const credentialRef = typeof body?.credentialRef === 'string' ? body.credentialRef.trim() : '';

  if (!(PROVIDERS as readonly string[]).includes(provider)) {
    return NextResponse.json({ message: 'Provider integrasi tidak valid' }, { status: 400 });
  }
  if (!displayName || displayName.length > MAX_DISPLAY_NAME) {
    return NextResponse.json(
      { message: `Nama integrasi wajib diisi dan maksimal ${MAX_DISPLAY_NAME} karakter` },
      { status: 400 },
    );
  }
  if (
    !credentialRef.startsWith(SECRET_REF_PREFIX) ||
    credentialRef.length <= SECRET_REF_PREFIX.length ||
    credentialRef.length > MAX_CREDENTIAL_REF
  ) {
    return NextResponse.json(
      { message: `Gunakan referensi secret://... (maksimal ${MAX_CREDENTIAL_REF} karakter), bukan credential mentah` },
      { status: 400 },
    );
  }

  return proxyBackend(
    (client) =>
      client.request('/admin/integrations', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ provider, displayName, credentialRef }),
      }),
    { unauthorized: 'Sesi tidak valid.', unavailable: 'Gagal mendaftarkan integrasi' },
  );
}

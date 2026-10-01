import { NextResponse } from 'next/server';
import { proxyBackend } from '@/lib/proxy';

const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const VERSION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,63}$/;

/**
 * POST /api/ota/firmware-artifacts — register a firmware artifact.
 *
 * The backend `OtaController` had no BFF route and no console form, so the rollout state
 * machine was only reachable by curl. Validation is repeated at the edge deliberately: a
 * lowercase sha256 rejected by the edge arrives with a message the operator can act on,
 * instead of a backend 400 whose body the console never renders.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;

  const version = typeof body?.version === 'string' ? body.version.trim() : '';
  if (!VERSION_PATTERN.test(version)) {
    return NextResponse.json(
      { message: 'Versi firmware tidak valid (huruf/angka, lalu . _ + -)' },
      { status: 400 },
    );
  }

  const artifactUrl = typeof body?.artifactUrl === 'string' ? body.artifactUrl.trim() : '';
  if (!/^https:\/\/.+/.test(artifactUrl) || artifactUrl.length > 512) {
    return NextResponse.json(
      { message: 'URL artefak harus HTTPS dan maksimal 512 karakter' },
      { status: 400 },
    );
  }

  const sha256 = typeof body?.sha256 === 'string' ? body.sha256 : '';
  if (!SHA256_PATTERN.test(sha256)) {
    return NextResponse.json(
      { message: 'SHA-256 harus 64 karakter heksadesimal huruf kecil' },
      { status: 400 },
    );
  }

  const sizeBytes = Number(body?.sizeBytes);
  if (!Number.isInteger(sizeBytes) || sizeBytes <= 0) {
    return NextResponse.json(
      { message: 'Ukuran harus bilangan bulat positif' },
      { status: 400 },
    );
  }

  const compatibleModels = Array.isArray(body?.compatibleModels)
    ? body.compatibleModels.filter(
        (m): m is string => typeof m === 'string' && m.length > 0 && m.length <= 64,
      )
    : [];
  if (compatibleModels.length === 0) {
    return NextResponse.json(
      { message: 'Sebutkan minimal satu model perangkat yang kompatibel' },
      { status: 400 },
    );
  }

  return proxyBackend(
    (client) =>
      client.request('/ota/firmware-artifacts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          version,
          artifactUrl,
          sha256,
          sizeBytes,
          compatibleModels,
          releaseNotes: typeof body?.releaseNotes === 'string' ? body.releaseNotes : undefined,
        }),
      }),
    { unauthorized: 'Sesi tidak valid.', unavailable: 'Gagal mendaftarkan artefak firmware' },
  );
}

import { NextResponse } from 'next/server';
import {
  AdminSessionBackendClient,
  clearSessionCookies,
  finalizeAdminSessionResponse,
} from '@/lib/session';

/** POST /api/tenant/scenes/[sceneId]/run — runs a scene (Modul 12). */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ sceneId: string }> },
) {
  const { sceneId } = await params;
  try {
    const client = await AdminSessionBackendClient.create();
    const response = await client.request(`/scenes/${sceneId}/run`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ requestId: crypto.randomUUID() }),
    });
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
      { error: { code: 'SCENE_RUN_FAILED', message: String(cause) } },
      { status: status >= 500 ? 502 : status },
    );
  }
}

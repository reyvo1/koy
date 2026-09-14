import { NextResponse } from 'next/server';
import { BackendRequestError, readBackendJson } from '../../../lib/backend';
import type { UserWorkspacePayload } from '../../../lib/contracts';
import {
  clearSessionCookies,
  SessionBackendClient,
} from '../../../lib/session';

export async function GET() {
  const client = await SessionBackendClient.create();

  try {
    const backendResponse = await client.request('/spaces/accessible');
    const payload = await readBackendJson<UserWorkspacePayload>(backendResponse);
    const response = NextResponse.json(payload);
    client.applySessionUpdate(response);
    return response;
  } catch (error) {
    if (error instanceof BackendRequestError) {
      const status = error.status >= 500 ? 502 : error.status;
      const response = NextResponse.json(
        {
          message:
            error.status === 401 || error.status === 403
              ? 'Sesi tidak tersedia atau tidak lagi memiliki akses tenant.'
              : 'Workspace ruangan/perangkat tidak dapat dimuat.',
          code: error.code,
          requestId: error.requestId,
        },
        { status },
      );
      if (error.status === 401) clearSessionCookies(response);
      return response;
    }

    return NextResponse.json(
      { message: 'IoT Platform API tidak dapat dihubungi.' },
      { status: 503 },
    );
  }
}

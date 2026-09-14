import { NextResponse } from 'next/server';
import { BackendRequestError } from '../../../lib/backend';
import { loadOperationalSummary } from '../../../lib/operational-summary-loader';
import {
  AdminSessionBackendClient,
  clearSessionCookies,
} from '../../../lib/session';

export async function GET() {
  const client = await AdminSessionBackendClient.create();

  try {
    const payload = await loadOperationalSummary(client);
    const response = NextResponse.json(payload);
    client.applySessionUpdate(response);
    return response;
  } catch (error) {
    if (error instanceof BackendRequestError) {
      if (error.status === 401 || error.status === 403) {
        const response = NextResponse.json(
          {
            state: 'unauthorized',
            message: 'Sesi admin tidak tersedia atau tidak lagi diotorisasi.',
            requestId: error.requestId,
          },
          { status: 401 },
        );
        clearSessionCookies(response);
        return response;
      }

      return NextResponse.json(
        {
          state: 'error',
          message: 'Ringkasan operasional tidak dapat diproses.',
          requestId: error.requestId,
        },
        { status: error.status >= 500 ? 502 : error.status },
      );
    }

    return NextResponse.json(
      {
        state: 'offline',
        message: 'IoT Platform API saat ini tidak dapat dijangkau.',
        requestId: null,
      },
      { status: 503 },
    );
  }
}

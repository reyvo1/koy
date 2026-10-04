import { NextRequest, NextResponse } from 'next/server';
import { BackendRequestError } from '../../../lib/backend';
import { loadDashboardExperience } from '../../../lib/dashboard-loader';
import {
  clearSessionCookies,
  SessionBackendClient,
} from '../../../lib/session';

export async function GET(request: NextRequest) {
  const client = await SessionBackendClient.create();

  try {
    const payload = await loadDashboardExperience(
      client,
      request.nextUrl.searchParams.get('dashboardId'),
    );
    const response = NextResponse.json(payload);
    client.applySessionUpdate(response);
    return response;
  } catch (error) {
    if (error instanceof BackendRequestError) {
      if (error.status === 401) {
        const response = NextResponse.json(
          {
            state: 'unauthorized',
            message: 'Your session is unavailable or expired',
            requestId: error.requestId,
          },
          { status: 401 },
        );
        clearSessionCookies(response);
        return response;
      }

      if (error.status === 403) {
        // A valid session without dashboard.read is forbidden, not logged out. Clearing cookies
        // here used to turn a permission denial into a fake authentication failure.
        const response = NextResponse.json(
          {
            state: 'error',
            message: 'Your account is signed in but is not allowed to read this dashboard',
            requestId: error.requestId,
          },
          { status: 403 },
        );
        client.applySessionUpdate(response);
        return response;
      }

      return NextResponse.json(
        {
          state: 'error',
          message: 'The dashboard service could not complete the request',
          requestId: error.requestId,
        },
        { status: error.status >= 500 ? 502 : error.status },
      );
    }

    return NextResponse.json(
      {
        state: 'offline',
        message: 'The IoT Platform API is currently unreachable',
        requestId: null,
      },
      { status: 503 },
    );
  }
}

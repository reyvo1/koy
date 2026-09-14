import { NextResponse } from 'next/server';
import {
  AdminSessionBackendClient,
  clearSessionCookies,
} from '../../../../lib/session';

export async function POST() {
  const response = NextResponse.json({ authenticated: false });

  try {
    const client = await AdminSessionBackendClient.create();
    await client.request('/auth/logout', { method: 'POST' });
  } catch {
    // Local cleanup must remain available when the backend is unavailable.
  }

  clearSessionCookies(response);
  return response;
}

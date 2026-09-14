import { NextResponse } from 'next/server';
import {
  clearSessionCookies,
  SessionBackendClient,
} from '../../../../lib/session';

export async function POST() {
  const response = NextResponse.json({ authenticated: false });

  try {
    const client = await SessionBackendClient.create();
    await client.request('/auth/logout', { method: 'POST' });
  } catch {
    // Session cleanup must remain available when the backend is offline.
  }

  clearSessionCookies(response);
  return response;
}

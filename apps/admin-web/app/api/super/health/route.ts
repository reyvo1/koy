import { NextResponse } from 'next/server';
import { backendFetch } from '@/lib/backend';

/**
 * GET /api/super/health — public liveness/readiness proxy for the
 * Monitoring screen (blueprint §1). Read-only, no session mutation.
 */
export async function GET() {
  try {
    const response = await backendFetch('/health/ready', { method: 'GET' });
    const payload = await response.json().catch(() => ({}));
    return NextResponse.json(payload, { status: response.status });
  } catch (cause) {
    return NextResponse.json(
      {
        status: 'unreachable',
        error:
          cause instanceof Error ? cause.message : 'backend tidak dapat dihubungi',
      },
      { status: 502 },
    );
  }
}

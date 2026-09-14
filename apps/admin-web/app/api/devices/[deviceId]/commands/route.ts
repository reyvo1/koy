import { NextResponse } from 'next/server';
import {
  AdminSessionBackendClient,
  clearSessionCookies,
} from '@/lib/session';
import { sendDeviceCommand } from '@/lib/device-control';

interface CommandHistoryRow {
  id?: string;
  correlationId?: string;
  payload?: Record<string, unknown>;
  status?: string;
  createdAt?: string;
  acknowledgedAt?: string | null;
}

function statusOf(cause: unknown): number {
  return cause instanceof Error && 'status' in cause
    ? Number((cause as { status: number }).status)
    : 502;
}

function unauthorizedResponse() {
  const response = NextResponse.json(
    {
      error: {
        code: 'UNAUTHORIZED',
        message: 'Sesi admin tidak tersedia atau tidak lagi diotorisasi.',
      },
    },
    { status: 401 },
  );
  clearSessionCookies(response);
  return response;
}

/** GET /api/devices/[deviceId]/commands — authenticated device command history. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ deviceId: string }> },
) {
  const { deviceId } = await params;
  try {
    const client = await AdminSessionBackendClient.create();
    const backend = await client.request(
      `/devices/${encodeURIComponent(deviceId)}/commands?limit=50`,
    );
    if (!backend.ok) {
      const error = Object.assign(new Error(`HTTP ${backend.status}`), {
        status: backend.status,
      });
      throw error;
    }
    const payload = (await backend.json()) as CommandHistoryRow[] | { items?: CommandHistoryRow[] };
    const rows = Array.isArray(payload) ? payload : (payload.items ?? []);
    const response = NextResponse.json({
      items: rows.map((row) => ({
        id: row.id ?? row.correlationId ?? '',
        commandId: row.correlationId ?? row.id ?? '',
        capabilityKey:
          row.payload && typeof row.payload === 'object'
            ? Object.keys(row.payload).join(', ') || '—'
            : '—',
        status: row.status ?? 'PENDING',
        createdAt: row.createdAt ?? null,
        acknowledgedAt: row.acknowledgedAt ?? null,
      })),
    });
    client.applySessionUpdate(response);
    return response;
  } catch (cause) {
    const status = statusOf(cause);
    if (status === 401 || status === 403) return unauthorizedResponse();
    return NextResponse.json(
      {
        error: {
          code: 'COMMAND_HISTORY_FAILED',
          message:
            cause instanceof Error
              ? cause.message
              : 'riwayat perintah tidak tersedia',
        },
      },
      { status: status >= 500 ? 502 : status },
    );
  }
}

/**
 * POST /api/devices/[deviceId]/commands — translates the UI's single
 * capability command into the backend's canonical payload + idempotency key.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ deviceId: string }> },
) {
  const { deviceId } = await params;
  const body = (await request.json().catch(() => null)) as
    | { capabilityKey?: string; value?: unknown }
    | null;

  if (!body?.capabilityKey || body.value === undefined) {
    return NextResponse.json(
      {
        error: {
          code: 'INVALID_BODY',
          message: 'capabilityKey dan value wajib diisi',
        },
      },
      { status: 400 },
    );
  }

  try {
    const client = await AdminSessionBackendClient.create();
    const result = await sendDeviceCommand(
      client,
      deviceId,
      body.capabilityKey,
      body.value,
    );
    const response = NextResponse.json(result, { status: 201 });
    client.applySessionUpdate(response);
    return response;
  } catch (cause) {
    const status = statusOf(cause);
    if (status === 401 || status === 403) return unauthorizedResponse();
    return NextResponse.json(
      {
        error: {
          code: 'COMMAND_FAILED',
          message:
            cause instanceof Error ? cause.message : 'perintah gagal dikirim',
        },
      },
      { status: status >= 500 ? 502 : status },
    );
  }
}

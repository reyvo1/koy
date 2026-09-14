import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { BackendRequestError, readBackendJson } from '../../../lib/backend';
import {
  clearSessionCookies,
  SessionBackendClient,
} from '../../../lib/session';

interface CommandBody {
  deviceId: string;
  capabilityKey: string;
  value: boolean;
}

interface CommandResult {
  id?: string;
  correlationId?: string;
  status?: string;
}


interface CommandStatusResult {
  correlationId?: string;
  status?: string;
  sentAt?: string | null;
  acknowledgedAt?: string | null;
  updatedAt?: string;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const deviceId = url.searchParams.get('deviceId')?.trim() ?? '';
  const commandId = url.searchParams.get('commandId')?.trim() ?? '';
  if (
    !deviceId ||
    deviceId.length > 128 ||
    !commandId ||
    commandId.length > 128
  ) {
    return NextResponse.json(
      { message: 'Identitas command tidak valid' },
      { status: 400 },
    );
  }

  const client = await SessionBackendClient.create();

  try {
    const backendResponse = await client.request(
      `/devices/${encodeURIComponent(deviceId)}/commands/${encodeURIComponent(commandId)}`,
      { method: 'GET' },
    );
    const command = await readBackendJson<CommandStatusResult>(backendResponse);
    const response = NextResponse.json({
      commandId: command.correlationId ?? commandId,
      status: command.status ?? 'UNKNOWN',
      sentAt: command.sentAt ?? null,
      acknowledgedAt: command.acknowledgedAt ?? null,
      updatedAt: command.updatedAt ?? null,
    });
    client.applySessionUpdate(response);
    return response;
  } catch (error) {
    if (error instanceof BackendRequestError) {
      const response = NextResponse.json(
        {
          message:
            error.status === 403
              ? 'Akun ini tidak memiliki izin melihat command perangkat tersebut.'
              : error.status === 404
                ? 'Command tidak ditemukan.'
                : 'Status command gagal dibaca.',
          code: error.code,
          requestId: error.requestId,
        },
        { status: error.status >= 500 ? 502 : error.status },
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

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!isCommandBody(body)) {
    return NextResponse.json(
      { message: 'Perintah perangkat tidak valid' },
      { status: 400 },
    );
  }

  const client = await SessionBackendClient.create();

  try {
    const backendResponse = await client.request(
      `/devices/${encodeURIComponent(body.deviceId)}/commands`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          payload: { [body.capabilityKey]: body.value },
          idempotencyKey: `user-web-${randomUUID()}`,
        }),
      },
    );
    const command = await readBackendJson<CommandResult>(backendResponse);
    const response = NextResponse.json({
      commandId: command.correlationId ?? command.id ?? null,
      status: command.status ?? 'UNKNOWN',
    });
    client.applySessionUpdate(response);
    return response;
  } catch (error) {
    if (error instanceof BackendRequestError) {
      const response = NextResponse.json(
        {
          message:
            error.status === 403
              ? 'Akun ini tidak memiliki izin CONTROL untuk perangkat tersebut.'
              : 'Perintah perangkat gagal dikirim.',
          code: error.code,
          requestId: error.requestId,
        },
        { status: error.status >= 500 ? 502 : error.status },
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

function isCommandBody(value: unknown): value is CommandBody {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const body = value as Record<string, unknown>;
  return (
    typeof body.deviceId === 'string' &&
    body.deviceId.trim().length > 0 &&
    body.deviceId.length <= 128 &&
    typeof body.capabilityKey === 'string' &&
    /^[a-zA-Z0-9._:-]{1,128}$/.test(body.capabilityKey) &&
    typeof body.value === 'boolean'
  );
}

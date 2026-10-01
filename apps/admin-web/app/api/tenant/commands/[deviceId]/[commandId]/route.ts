import { NextResponse } from 'next/server';
import { proxyBackend } from '@/lib/proxy';

/**
 * GET /api/tenant/commands/[deviceId]/[commandId] — one command's full record.
 *
 * `CommandController.getCommand` has been implemented, device-access-guarded and
 * tenant-checked on the backend since the command module shipped, but admin-web had no
 * route to it, so a row in the command history could not be opened. The history list was
 * the only view of a command: an operator could see that a command was SENT or ACKED but
 * not when it was sent, when it was acknowledged, how long it took, or what payload the
 * device actually received.
 *
 * The path parameter is the command's **correlationId**, not its primary key. The two are
 * separate UUIDs in the Prisma model and only `correlationId` is what
 * `CommandService.getByCorrelationId` looks up. Both are encoded here; authorization is
 * not re-implemented — the session client forwards the caller's credentials and the
 * backend refuses a command belonging to another tenant or device with a 404.
 */
export async function GET(
  _request: Request,
  {
    params,
  }: {
    params: Promise<{ deviceId: string; commandId: string }>;
  },
) {
  const { deviceId, commandId } = await params;

  if (!deviceId.trim() || !commandId.trim()) {
    return NextResponse.json(
      { message: 'Identitas perangkat atau perintah tidak lengkap' },
      { status: 400 },
    );
  }

  return proxyBackend(
    (client) =>
      client.request(
        `/devices/${encodeURIComponent(
          deviceId,
        )}/commands/${encodeURIComponent(commandId)}`,
      ),
    {
      unauthorized: 'Sesi tidak valid.',
      unavailable: 'Detail perintah tidak dapat dimuat',
    },
  );
}

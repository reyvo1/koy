import { NextResponse } from 'next/server';
import {
  AdminSessionBackendClient,
  clearSessionCookies,
} from '@/lib/session';

/**
 * GET /api/tenant/commands — recent device commands for the tenant.
 * Bounded: iterates the tenant's devices and reads their command history
 * (latest first, capped). Fail-closed per device.
 */
export async function GET() {
  try {
    const client = await AdminSessionBackendClient.create();
    const listResponse = await client.request('/devices?limit=100');
    const list = (await listResponse.json()) as
      | Array<{ id: string; name?: string }>
      | { items?: Array<{ id: string; name?: string }> };
    const deviceItems = Array.isArray(list) ? list : (list.items ?? []);
    const devices = deviceItems.slice(0, 20);

    const byId = new Map(devices.map((d) => [d.id, d.name ?? d.id.slice(0, 8)] as const));
    const histories = await Promise.all(
      devices.slice(0, 10).map(async (device) => {
        try {
          const response = await client.request(
            `/devices/${device.id}/commands`,
          );
          if (!response.ok) return [];
          const payload = (await response.json()) as unknown;
          const items = Array.isArray(payload)
            ? payload
            : ((payload as { items?: unknown[] }).items ?? []);
          return items
            .slice(0, 10)
            .map((raw) => {
              const row = raw as {
                id?: string;
                correlationId?: string;
                capabilityKey?: string;
                payload?: { capabilityKey?: string };
                status?: string;
                createdAt?: string;
                acknowledgedAt?: string | null;
              };
              return {
                id: row.id ?? `${device.id}-${row.createdAt ?? ''}`,
                // The detail endpoint `GET /devices/:id/commands/:commandId` resolves on
                // `correlationId`, not on the row's primary `id` — the two are distinct UUIDs
                // in the Prisma model. A drill-down built from `id` alone would 404 on every
                // click, so both identities are carried through and the UI uses the right one.
                commandId: row.correlationId ?? row.id ?? '',
                deviceId: device.id,
                deviceName: byId.get(device.id) ?? device.id,
                capabilityKey:
                  row.capabilityKey ??
                  ((typeof row.payload === 'object' && row.payload !== null
                    ? Object.keys(row.payload).join(', ')
                    : '') ||
                    '—'),
                status: row.status ?? 'PENDING',
                createdAt: row.createdAt ?? null,
                acknowledgedAt: row.acknowledgedAt ?? null,
              };
            });
        } catch {
          return [];
        }
      }),
    );

    const rows = histories
      .flat()
      .sort((a, b) =>
        (b.createdAt ?? '').localeCompare(a.createdAt ?? ''),
      )
      .slice(0, 50);

    return NextResponse.json({ total: rows.length, items: rows });
  } catch (cause) {
    const status =
      cause instanceof Error && 'status' in cause
        ? Number((cause as { status: number }).status)
        : 502;
    if (status === 401 || status === 403) {
      const response = NextResponse.json(
        { error: { code: 'UNAUTHORIZED', message: 'Sesi tidak valid.' } },
        { status: 401 },
      );
      clearSessionCookies(response);
      return response;
    }
    return NextResponse.json(
      {
        error: {
          code: 'COMMANDS_UNAVAILABLE',
          message:
            cause instanceof Error ? cause.message : 'riwayat perintah tidak tersedia',
        },
      },
      { status: status >= 500 ? 502 : status },
    );
  }
}

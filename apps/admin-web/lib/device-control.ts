import 'server-only';
import {
  AdminSessionBackendClient,
} from './session';

export interface AdminDeviceListItem {
  id: string;
  name: string;
  status: string;
  /**
   * Device.lastHeartbeatAt, which is what the device list actually returns —
   * deviceService.findAll returns the raw Prisma row and the model has no
   * `lastSeenAt`. Declaring that name made this interface describe a response
   * shape the backend cannot send, so any future consumer of it would have
   * rendered a permanently blank timestamp.
   */
  lastHeartbeatAt: string | null;
}

export interface DeviceCommandResult {
  commandId: string;
  status: string;
}

interface DeviceListResponse {
  items?: AdminDeviceListItem[];
}

/**
 * Lists devices for the admin's tenant via the backend REST API using the
 * authenticated session client (handles token refresh transparently).
 */
export async function listDevices(
  client: AdminSessionBackendClient,
): Promise<AdminDeviceListItem[]> {
  const response = await client.request('/devices?limit=100');
  if (!response.ok) {
    throw Object.assign(new Error(`HTTP ${response.status}`), {
      status: response.status,
    });
  }
  const body = (await response.json()) as
    | DeviceListResponse
    | AdminDeviceListItem[];
  if (Array.isArray(body)) return body;
  return body.items ?? [];
}

/**
 * Sends a device control command (e.g. power toggle) through the backend.
 */
export async function sendDeviceCommand(
  client: AdminSessionBackendClient,
  deviceId: string,
  capabilityKey: string,
  value: unknown,
): Promise<DeviceCommandResult> {
  const response = await client.request(`/devices/${deviceId}/commands`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      payload: { [capabilityKey]: value },
      idempotencyKey: crypto.randomUUID(),
    }),
  });
  if (!response.ok && response.status !== 201) {
    throw Object.assign(new Error(`HTTP ${response.status}`), {
      status: response.status,
    });
  }
  const body = (await response.json()) as {
    id?: string;
    correlationId?: string;
    status?: string;
  };
  return {
    commandId: body.correlationId ?? body.id ?? '',
    status: body.status ?? 'UNKNOWN',
  };
}

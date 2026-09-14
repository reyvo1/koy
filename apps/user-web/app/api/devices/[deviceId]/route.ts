import { NextResponse } from 'next/server';
import { BackendRequestError, readBackendJson } from '../../../../lib/backend';
import type {
  UserDeviceCapability,
  UserDeviceCommandHistoryItem,
  UserDeviceDetailPayload,
  UserDeviceTechnicalHistory,
  UserWorkspacePayload,
} from '../../../../lib/contracts';
import {
  clearSessionCookies,
  SessionBackendClient,
} from '../../../../lib/session';

interface BackendDevice {
  id: string;
  name: string;
  type: string;
  status: string;
  lastHeartbeatAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

interface BackendTelemetry {
  id: string;
  eventId: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ deviceId: string }> },
) {
  const { deviceId } = await context.params;
  if (!deviceId || deviceId.length > 128) {
    return NextResponse.json({ message: 'Identitas perangkat tidak valid.' }, { status: 400 });
  }

  const client = await SessionBackendClient.create();
  const encoded = encodeURIComponent(deviceId);

  try {
    const [deviceResponse, capabilityResponse, telemetryResponse, commandResponse, workspaceResponse, technicalResponse] =
      await Promise.all([
        client.request(`/devices/${encoded}`),
        client.request(`/devices/${encoded}/capabilities`),
        client.request(`/devices/${encoded}/telemetry/latest`),
        client.request(`/devices/${encoded}/commands?limit=20&offset=0`),
        client.request('/spaces/accessible'),
        client.request(`/devices/${encoded}/technical-history`),
      ]);

    const [device, capabilities, latestTelemetry, commandHistory, workspace, technicalHistory] =
      await Promise.all([
        readBackendJson<BackendDevice>(deviceResponse),
        readBackendJson<UserDeviceCapability[]>(capabilityResponse),
        readBackendJson<BackendTelemetry | null>(telemetryResponse),
        readBackendJson<UserDeviceCommandHistoryItem[]>(commandResponse),
        readBackendJson<UserWorkspacePayload>(workspaceResponse),
        readBackendJson<UserDeviceTechnicalHistory>(technicalResponse),
      ]);

    const workspaceDevice = workspace.devices.find((item) => item.id === device.id);
    if (!workspaceDevice) {
      return NextResponse.json(
        { message: 'Perangkat tidak tersedia pada workspace user aktif.' },
        { status: 404 },
      );
    }

    const payload: UserDeviceDetailPayload = {
      device: {
        id: device.id,
        name: device.name,
        type: device.type,
        status: device.status,
        lastHeartbeatAt: device.lastHeartbeatAt ?? null,
        createdAt: device.createdAt,
        updatedAt: device.updatedAt,
        canControl: workspaceDevice.canControl,
        roomId: workspaceDevice.roomId,
        roomName: workspaceDevice.roomName,
        roomPath: workspaceDevice.roomPath,
      },
      capabilities: capabilities.map((capability) => ({
        id: capability.id,
        key: capability.key,
        semanticType: capability.semanticType,
        dataType: capability.dataType,
        unit: capability.unit ?? null,
        constraints:
          capability.constraints && typeof capability.constraints === 'object' && !Array.isArray(capability.constraints)
            ? capability.constraints
            : null,
        isReadable: capability.isReadable === true,
        isWritable: capability.isWritable === true,
        isReportable: capability.isReportable === true,
        schemaVersion: capability.schemaVersion,
      })),
      latestTelemetry: latestTelemetry
        ? {
            id: latestTelemetry.id,
            eventId: latestTelemetry.eventId,
            payload: latestTelemetry.payload,
            createdAt: latestTelemetry.createdAt,
          }
        : null,
      commandHistory: commandHistory.map((command) => ({
        id: command.id,
        correlationId: command.correlationId,
        payload: command.payload,
        status: command.status,
        createdAt: command.createdAt,
        sentAt: command.sentAt ?? null,
        acknowledgedAt: command.acknowledgedAt ?? null,
        updatedAt: command.updatedAt,
      })),
      technicalHistory,
    };

    const response = NextResponse.json(payload);
    client.applySessionUpdate(response);
    return response;
  } catch (error) {
    if (error instanceof BackendRequestError) {
      const status = error.status >= 500 ? 502 : error.status;
      const response = NextResponse.json(
        {
          message:
            error.status === 403
              ? 'Akun ini tidak memiliki izin VIEW untuk perangkat tersebut.'
              : error.status === 404
                ? 'Perangkat tidak ditemukan.'
                : error.status === 401
                  ? 'Sesi user tidak tersedia.'
                  : 'Detail perangkat gagal dimuat dari backend.',
          code: error.code,
          requestId: error.requestId,
        },
        { status },
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

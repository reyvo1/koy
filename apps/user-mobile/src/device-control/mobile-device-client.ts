/**
 * Mobile device client. End-user inventory is room/access aware through the
 * canonical /spaces/accessible read model; detail data remains device-scoped
 * and guarded by backend VIEW/CONTROL policy.
 */
import { MobileApiError } from '../session/mobile-session-client';

export interface MobileDeviceSummary {
  id: string;
  name: string;
  type?: string;
  status: string;
  lastHeartbeatAt: string | null;
  canControl: boolean;
  roomName: string | null;
  roomPath: string | null;
}

export interface MobileTelemetryPoint {
  capabilityKey: string;
  value: string | number | boolean;
  recordedAt: string;
}

export interface MobileDeviceCapability {
  id: string;
  key: string;
  semanticType: string;
  dataType: string;
  unit: string | null;
  isReadable: boolean;
  isWritable: boolean;
  isReportable: boolean;
}

export interface MobileCommandHistoryItem {
  id: string;
  correlationId: string;
  payload: Record<string, unknown>;
  status: string;
  createdAt: string;
  sentAt: string | null;
  acknowledgedAt: string | null;
}

export interface MobileTechnicalHistory {
  firmware: {
    currentVersion: string | null;
    availability: string;
    reason: string;
  };
  protocol: {
    name: string | null;
    availability: string;
    reason: string;
  };
  updateHistory: Array<{
    rolloutId: string;
    rolloutStatus: string;
    evidenceState: string;
    firmware: { version: string; sha256Metadata: string };
    updatedAt: string;
  }>;
  analyticsFindings: MobileAnalyticsFinding[];
  alertDeliveryHistory: { available: false; reason: string };
}

export interface MobileDeviceDetail {
  device: MobileDeviceSummary & {
    createdAt: string | null;
    updatedAt: string | null;
  };
  capabilities: MobileDeviceCapability[];
  telemetry: MobileTelemetryPoint[];
  commandHistory: MobileCommandHistoryItem[];
  technicalHistory: MobileTechnicalHistory;
}

export interface MobileAnalyticsFinding {
  id: string;
  deviceId?: string;
  deviceName?: string;
  capabilityKey: string;
  kind: string;
  severity: string;
  summary: string;
  confidence: number;
  detectorVersion: string;
  createdAt: string;
}

export interface MobileAlertsPayload {
  source: 'ANALYTICS_FINDINGS';
  notificationDeliveryHistory: false;
  deviceScopeTruncated: boolean;
  maxDeviceScope: number;
  limit: number;
  items: MobileAnalyticsFinding[];
}

export interface MobileDeviceGateway {
  requestJson<T>(pathname: string, init?: RequestInit): Promise<T>;
}

interface WorkspaceResponse {
  devices?: unknown;
}

export async function loadMobileDevices(
  gateway: MobileDeviceGateway,
): Promise<MobileDeviceSummary[]> {
  try {
    const payload = await gateway.requestJson<unknown>('/spaces/accessible');
    const body = payload as WorkspaceResponse;
    const rows = Array.isArray(body?.devices) ? body.devices : [];

    return rows
      .map((raw) => raw as Record<string, unknown>)
      .filter(
        (row) =>
          typeof row.id === 'string' &&
          typeof row.name === 'string' &&
          typeof row.status === 'string',
      )
      .map((row) => ({
        id: row.id as string,
        name: row.name as string,
        type: typeof row.type === 'string' ? row.type : undefined,
        status: row.status as string,
        lastHeartbeatAt:
          typeof row.lastHeartbeatAt === 'string' ? row.lastHeartbeatAt : null,
        canControl: row.canControl === true,
        roomName: typeof row.roomName === 'string' ? row.roomName : null,
        roomPath: typeof row.roomPath === 'string' ? row.roomPath : null,
      }));
  } catch (cause) {
    if (cause instanceof MobileApiError) throw cause;
    throw new MobileApiError(502, 'DEVICE_LIST_FAILED', 'gagal memuat perangkat', null);
  }
}

export async function loadMobileDeviceDetail(
  gateway: MobileDeviceGateway,
  summary: MobileDeviceSummary,
): Promise<MobileDeviceDetail> {
  const id = encodeURIComponent(summary.id);
  try {
    const [device, rawCapabilities, rawTelemetry, rawCommands, technicalHistory] =
      await Promise.all([
        gateway.requestJson<Record<string, unknown>>(`/devices/${id}`),
        gateway.requestJson<unknown>(`/devices/${id}/capabilities`),
        gateway.requestJson<unknown>(`/devices/${id}/telemetry/latest`),
        gateway.requestJson<unknown>(`/devices/${id}/commands?limit=20&offset=0`),
        gateway.requestJson<MobileTechnicalHistory>(`/devices/${id}/technical-history`),
      ]);

    const capabilities = Array.isArray(rawCapabilities)
      ? rawCapabilities.map(parseCapability).filter(isPresent)
      : [];
    const commandRows = Array.isArray(rawCommands)
      ? rawCommands
      : Array.isArray((rawCommands as { items?: unknown })?.items)
        ? ((rawCommands as { items: unknown[] }).items)
        : [];

    return {
      device: {
        ...summary,
        createdAt: typeof device.createdAt === 'string' ? device.createdAt : null,
        updatedAt: typeof device.updatedAt === 'string' ? device.updatedAt : null,
      },
      capabilities,
      telemetry: parseTelemetryRow(rawTelemetry),
      commandHistory: commandRows.map(parseCommand).filter(isPresent),
      technicalHistory,
    };
  } catch (cause) {
    if (cause instanceof MobileApiError) throw cause;
    throw new MobileApiError(
      502,
      'DEVICE_DETAIL_FAILED',
      'detail perangkat gagal dimuat',
      null,
    );
  }
}

export async function loadMobileAlerts(
  gateway: MobileDeviceGateway,
): Promise<MobileAlertsPayload> {
  try {
    const payload = await gateway.requestJson<MobileAlertsPayload>(
      '/analytics/alerts/accessible?limit=50',
    );
    return {
      source: 'ANALYTICS_FINDINGS',
      notificationDeliveryHistory: false,
      deviceScopeTruncated: payload.deviceScopeTruncated === true,
      maxDeviceScope: Number(payload.maxDeviceScope) || 1000,
      limit: Number(payload.limit) || 50,
      items: Array.isArray(payload.items) ? payload.items : [],
    };
  } catch (cause) {
    if (cause instanceof MobileApiError) throw cause;
    throw new MobileApiError(502, 'ALERTS_LOAD_FAILED', 'alerts analitik gagal dimuat', null);
  }
}

export async function sendBooleanCapabilityCommand(
  gateway: MobileDeviceGateway,
  deviceId: string,
  capabilityKey: string,
  value: boolean,
): Promise<{ commandId: string; status: string }> {
  if (!/^[a-zA-Z0-9._:-]{1,128}$/.test(capabilityKey)) {
    throw new MobileApiError(
      400,
      'DEVICE_CAPABILITY_INVALID',
      'capability perangkat tidak valid',
      null,
    );
  }

  try {
    const result = await gateway.requestJson<{
      id?: string;
      correlationId?: string;
      status?: string;
    }>(`/devices/${encodeURIComponent(deviceId)}/commands`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        payload: { [capabilityKey]: value },
        idempotencyKey: `mobile-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      }),
    });

    return {
      commandId: result.correlationId ?? result.id ?? '',
      status: result.status ?? 'UNKNOWN',
    };
  } catch (cause) {
    if (cause instanceof MobileApiError) throw cause;
    throw new MobileApiError(
      502,
      'DEVICE_COMMAND_FAILED',
      'perintah perangkat gagal dikirim',
      null,
    );
  }
}

export interface MobileCommandStatus {
  commandId: string;
  status: string;
  terminal: boolean;
}

const TERMINAL_COMMAND_STATES = new Set([
  'ACKNOWLEDGED',
  'FAILED',
  'TIMED_OUT',
]);

export async function loadMobileCommandStatus(
  gateway: MobileDeviceGateway,
  deviceId: string,
  commandId: string,
): Promise<MobileCommandStatus> {
  try {
    const result = await gateway.requestJson<{
      correlationId?: string;
      status?: string;
    }>(`/devices/${encodeURIComponent(deviceId)}/commands/${encodeURIComponent(commandId)}`);
    const status = result.status ?? 'UNKNOWN';
    return {
      commandId: result.correlationId ?? commandId,
      status,
      terminal: TERMINAL_COMMAND_STATES.has(status),
    };
  } catch (cause) {
    if (cause instanceof MobileApiError) throw cause;
    throw new MobileApiError(
      502,
      'DEVICE_COMMAND_STATUS_FAILED',
      'status perintah perangkat gagal dibaca',
      null,
    );
  }
}

export async function reconcileMobileCommand(
  gateway: MobileDeviceGateway,
  deviceId: string,
  commandId: string,
  attempts = 6,
  intervalMs = 500,
): Promise<MobileCommandStatus> {
  let current: MobileCommandStatus = {
    commandId,
    status: 'UNKNOWN',
    terminal: false,
  };

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (attempt > 0) await delay(intervalMs);
    current = await loadMobileCommandStatus(gateway, deviceId, commandId);
    if (current.terminal) return current;
  }

  return current;
}

export async function sendPowerToggle(
  gateway: MobileDeviceGateway,
  deviceId: string,
  turnOn: boolean,
): Promise<{ commandId: string; status: string }> {
  return sendBooleanCapabilityCommand(
    gateway,
    deviceId,
    'switch.power',
    turnOn,
  );
}

export async function loadLatestTelemetry(
  gateway: MobileDeviceGateway,
  deviceId: string,
): Promise<MobileTelemetryPoint[]> {
  try {
    const response = await gateway.requestJson<unknown>(
      `/devices/${encodeURIComponent(deviceId)}/telemetry/latest`,
    );
    return parseTelemetryRow(response);
  } catch (cause) {
    if (cause instanceof MobileApiError) throw cause;
    throw new MobileApiError(
      502,
      'TELEMETRY_LOAD_FAILED',
      'gagal memuat telemetry terbaru',
      null,
    );
  }
}

function parseTelemetryRow(response: unknown): MobileTelemetryPoint[] {
  if (!response || typeof response !== 'object' || Array.isArray(response)) {
    return [];
  }

  const row = response as Record<string, unknown>;
  const payload = row.payload;
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return [];
  }

  const recordedAt = typeof row.createdAt === 'string' ? row.createdAt : '';
  return Object.entries(payload as Record<string, unknown>)
    .filter(([, value]) => ['string', 'number', 'boolean'].includes(typeof value))
    .map(([capabilityKey, value]) => ({
      capabilityKey,
      value: value as string | number | boolean,
      recordedAt,
    }));
}

function parseCapability(raw: unknown): MobileDeviceCapability | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;
  if (
    typeof row.id !== 'string' ||
    typeof row.key !== 'string' ||
    typeof row.semanticType !== 'string' ||
    typeof row.dataType !== 'string'
  ) {
    return null;
  }
  return {
    id: row.id,
    key: row.key,
    semanticType: row.semanticType,
    dataType: row.dataType,
    unit: typeof row.unit === 'string' ? row.unit : null,
    isReadable: row.isReadable === true,
    isWritable: row.isWritable === true,
    isReportable: row.isReportable === true,
  };
}

function parseCommand(raw: unknown): MobileCommandHistoryItem | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;
  if (
    typeof row.id !== 'string' ||
    typeof row.correlationId !== 'string' ||
    typeof row.status !== 'string' ||
    typeof row.createdAt !== 'string'
  ) {
    return null;
  }
  return {
    id: row.id,
    correlationId: row.correlationId,
    payload:
      row.payload && typeof row.payload === 'object' && !Array.isArray(row.payload)
        ? (row.payload as Record<string, unknown>)
        : {},
    status: row.status,
    createdAt: row.createdAt,
    sentAt: typeof row.sentAt === 'string' ? row.sentAt : null,
    acknowledgedAt:
      typeof row.acknowledgedAt === 'string' ? row.acknowledgedAt : null,
  };
}

function isPresent<T>(value: T | null): value is T {
  return value !== null;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

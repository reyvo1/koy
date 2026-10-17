/**
 * The offline read half for the directory surfaces.
 *
 * The dashboard bridge proved the pattern; this module extends it to the two list surfaces an
 * operator actually works from in the field: the device directory and the analytics alerts. Both
 * follow the same rules as the dashboard cache:
 *
 *  - only a payload that the network loader already validated is remembered;
 *  - a cached payload is only served for a connectivity outage (`isMobileOfflineError`) — a
 *    rejected session or a permission answer is an answer, not an outage;
 *  - reads re-check the shape and the order-of-magnitude bounds, so a corrupted file reads as
 *    "no cache" instead of rendering a foreign payload.
 *
 * Realtime telemetry is deliberately not cached: a chart of stale samples invites reading the past
 * as the present, and the lists here carry their own timestamps inline.
 */
import type {
  MobileAlertsPayload,
  MobileDeviceDetail,
  MobileDeviceSummary,
} from '../device-control/mobile-device-client';
import {
  surfaceSnapshotKey,
  type MobileSnapshotCache,
} from './mobile-snapshot-cache';

const CACHED_MAX_DEVICES = 500;
const CACHED_MAX_ALERT_ITEMS = 200;
const CACHED_MAX_CAPABILITIES = 100;
const CACHED_MAX_TELEMETRY_POINTS = 500;
const CACHED_MAX_COMMAND_HISTORY = 100;
const CACHED_MAX_UPDATE_HISTORY = 100;
const CACHED_MAX_DETAIL_FINDINGS = 200;

export const DEVICES_OFFLINE_SURFACE = 'devices';
export const ALERTS_OFFLINE_SURFACE = 'alerts';
export const DEVICE_DETAIL_OFFLINE_SURFACE = 'device-detail';

/** Device details are cached per device so one open detail cannot overwrite another. */
export function deviceDetailOfflineKey(deviceId: string): string {
  return `${DEVICE_DETAIL_OFFLINE_SURFACE}:${deviceId}`;
}

export interface MobileOfflineDevices {
  read(
    tenantId: string,
  ): Promise<{ cachedAt: string; devices: MobileDeviceSummary[] } | null>;
  remember(
    tenantId: string,
    devices: MobileDeviceSummary[],
  ): Promise<boolean>;
}

export interface MobileOfflineAlerts {
  read(
    tenantId: string,
  ): Promise<{ alerts: MobileAlertsPayload; cachedAt: string } | null>;
  remember(tenantId: string, alerts: MobileAlertsPayload): Promise<boolean>;
}

export interface MobileOfflineDeviceDetails {
  read(
    tenantId: string,
    deviceId: string,
  ): Promise<{ cachedAt: string; detail: MobileDeviceDetail } | null>;
  remember(
    tenantId: string,
    deviceId: string,
    detail: MobileDeviceDetail,
  ): Promise<boolean>;
}

export function connectMobileOfflineDevices(deps: {
  apiOrigin: string;
  cache: MobileSnapshotCache;
}): MobileOfflineDevices {
  const key = (tenantId: string) =>
    surfaceSnapshotKey(deps.apiOrigin, tenantId, DEVICES_OFFLINE_SURFACE);

  return {
    async read(tenantId) {
      const snapshot = await deps.cache.read(key(tenantId));
      if (!snapshot || !isCachedDeviceList(snapshot.payload)) return null;
      return { cachedAt: snapshot.cachedAt, devices: snapshot.payload };
    },
    async remember(tenantId, devices) {
      if (!isCachedDeviceList(devices)) return false;
      return deps.cache.write(key(tenantId), devices, new Date().toISOString());
    },
  };
}

export function connectMobileOfflineAlerts(deps: {
  apiOrigin: string;
  cache: MobileSnapshotCache;
}): MobileOfflineAlerts {
  const key = (tenantId: string) =>
    surfaceSnapshotKey(deps.apiOrigin, tenantId, ALERTS_OFFLINE_SURFACE);

  return {
    async read(tenantId) {
      const snapshot = await deps.cache.read(key(tenantId));
      if (!snapshot || !isCachedAlertsPayload(snapshot.payload)) return null;
      return { alerts: snapshot.payload, cachedAt: snapshot.cachedAt };
    },
    async remember(tenantId, alerts) {
      if (!isCachedAlertsPayload(alerts)) return false;
      return deps.cache.write(key(tenantId), alerts, new Date().toISOString());
    },
  };
}

export function connectMobileOfflineDeviceDetails(deps: {
  apiOrigin: string;
  cache: MobileSnapshotCache;
}): MobileOfflineDeviceDetails {
  const key = (tenantId: string, deviceId: string) =>
    surfaceSnapshotKey(
      deps.apiOrigin,
      tenantId,
      deviceDetailOfflineKey(deviceId),
    );

  return {
    async read(tenantId, deviceId) {
      const snapshot = await deps.cache.read(key(tenantId, deviceId));
      if (!snapshot || !isCachedDeviceDetail(snapshot.payload)) return null;
      return { cachedAt: snapshot.cachedAt, detail: snapshot.payload };
    },
    async remember(tenantId, deviceId, detail) {
      if (!isCachedDeviceDetail(detail)) return false;
      return deps.cache.write(
        key(tenantId, deviceId),
        detail,
        new Date().toISOString(),
      );
    },
  };
}

/**
 * Structural guards for the cached payloads. All were produced by the bounded network loader,
 * so the read re-checks the shape and the same order-of-magnitude bounds instead of trusting the
 * file.
 */
export function isCachedDeviceList(
  value: unknown,
): value is MobileDeviceSummary[] {
  if (!Array.isArray(value) || value.length > CACHED_MAX_DEVICES) return false;
  return value.every((row) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) return false;
    const device = row as Record<string, unknown>;
    return (
      typeof device.id === 'string' &&
      typeof device.name === 'string' &&
      typeof device.status === 'string' &&
      typeof device.canControl === 'boolean' &&
      (device.lastHeartbeatAt === null ||
        typeof device.lastHeartbeatAt === 'string') &&
      (device.roomName === null || typeof device.roomName === 'string') &&
      (device.roomPath === null || typeof device.roomPath === 'string') &&
      (device.type === undefined || typeof device.type === 'string')
    );
  });
}

export function isCachedAlertsPayload(
  value: unknown,
): value is MobileAlertsPayload {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const payload = value as Record<string, unknown>;
  if (
    payload.source !== 'ANALYTICS_FINDINGS' ||
    payload.notificationDeliveryHistory !== false ||
    typeof payload.deviceScopeTruncated !== 'boolean' ||
    typeof payload.maxDeviceScope !== 'number' ||
    typeof payload.limit !== 'number'
  ) {
    return false;
  }
  if (
    !Array.isArray(payload.items) ||
    payload.items.length > CACHED_MAX_ALERT_ITEMS
  ) {
    return false;
  }
  return payload.items.every((row) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) return false;
    const finding = row as Record<string, unknown>;
    return (
      typeof finding.id === 'string' &&
      typeof finding.capabilityKey === 'string' &&
      typeof finding.kind === 'string' &&
      typeof finding.severity === 'string' &&
      typeof finding.summary === 'string' &&
      typeof finding.confidence === 'number' &&
      typeof finding.detectorVersion === 'string' &&
      typeof finding.createdAt === 'string' &&
      (finding.deviceId === undefined || typeof finding.deviceId === 'string') &&
      (finding.deviceName === undefined ||
        typeof finding.deviceName === 'string')
    );
  });
}

function isCachedAnalyticsFinding(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const finding = value as Record<string, unknown>;
  return (
    typeof finding.id === 'string' &&
    typeof finding.capabilityKey === 'string' &&
    typeof finding.kind === 'string' &&
    typeof finding.severity === 'string' &&
    typeof finding.summary === 'string' &&
    typeof finding.confidence === 'number' &&
    typeof finding.detectorVersion === 'string' &&
    typeof finding.createdAt === 'string'
  );
}

export function isCachedDeviceDetail(
  value: unknown,
): value is MobileDeviceDetail {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const detail = value as Record<string, unknown>;
  const device = detail.device as Record<string, unknown> | undefined;
  if (!device || !isCachedDeviceList([device])) return false;
  if (
    !(device.createdAt === null || typeof device.createdAt === 'string') ||
    !(device.updatedAt === null || typeof device.updatedAt === 'string')
  ) {
    return false;
  }
  if (
    !Array.isArray(detail.capabilities) ||
    detail.capabilities.length > CACHED_MAX_CAPABILITIES
  ) {
    return false;
  }
  const capabilitiesOk = detail.capabilities.every((row) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) return false;
    const capability = row as Record<string, unknown>;
    return (
      typeof capability.id === 'string' &&
      typeof capability.key === 'string' &&
      typeof capability.semanticType === 'string' &&
      typeof capability.dataType === 'string' &&
      (capability.unit === null || typeof capability.unit === 'string') &&
      typeof capability.isReadable === 'boolean' &&
      typeof capability.isWritable === 'boolean' &&
      typeof capability.isReportable === 'boolean'
    );
  });
  if (!capabilitiesOk) return false;
  if (
    !Array.isArray(detail.telemetry) ||
    detail.telemetry.length > CACHED_MAX_TELEMETRY_POINTS
  ) {
    return false;
  }
  const telemetryOk = detail.telemetry.every((row) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) return false;
    const point = row as Record<string, unknown>;
    return (
      typeof point.capabilityKey === 'string' &&
      (typeof point.value === 'string' ||
        typeof point.value === 'number' ||
        typeof point.value === 'boolean') &&
      typeof point.recordedAt === 'string'
    );
  });
  if (!telemetryOk) return false;
  if (
    !Array.isArray(detail.commandHistory) ||
    detail.commandHistory.length > CACHED_MAX_COMMAND_HISTORY
  ) {
    return false;
  }
  const historyOk = detail.commandHistory.every((row) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) return false;
    const command = row as Record<string, unknown>;
    return (
      typeof command.id === 'string' &&
      typeof command.correlationId === 'string' &&
      typeof command.status === 'string' &&
      typeof command.createdAt === 'string' &&
      (command.sentAt === null || typeof command.sentAt === 'string') &&
      (command.acknowledgedAt === null ||
        typeof command.acknowledgedAt === 'string')
    );
  });
  if (!historyOk) return false;
  const technical = detail.technicalHistory as
    | Record<string, unknown>
    | undefined;
  if (!technical || typeof technical !== 'object' || Array.isArray(technical)) {
    return false;
  }
  const firmware = technical.firmware as Record<string, unknown> | undefined;
  const protocol = technical.protocol as Record<string, unknown> | undefined;
  if (
    !firmware ||
    !(firmware.currentVersion === null ||
      typeof firmware.currentVersion === 'string') ||
    typeof firmware.availability !== 'string' ||
    typeof firmware.reason !== 'string' ||
    !protocol ||
    !(protocol.name === null || typeof protocol.name === 'string') ||
    typeof protocol.availability !== 'string' ||
    typeof protocol.reason !== 'string'
  ) {
    return false;
  }
  if (
    !Array.isArray(technical.updateHistory) ||
    technical.updateHistory.length > CACHED_MAX_UPDATE_HISTORY
  ) {
    return false;
  }
  const updatesOk = technical.updateHistory.every((row) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) return false;
    const update = row as Record<string, unknown>;
    const fw = update.firmware as Record<string, unknown> | undefined;
    return (
      typeof update.rolloutId === 'string' &&
      typeof update.rolloutStatus === 'string' &&
      typeof update.evidenceState === 'string' &&
      typeof update.updatedAt === 'string' &&
      !!fw &&
      typeof fw.version === 'string' &&
      typeof fw.sha256Metadata === 'string'
    );
  });
  if (!updatesOk) return false;
  if (
    !Array.isArray(technical.analyticsFindings) ||
    technical.analyticsFindings.length > CACHED_MAX_DETAIL_FINDINGS ||
    !technical.analyticsFindings.every(isCachedAnalyticsFinding)
  ) {
    return false;
  }
  const delivery = technical.alertDeliveryHistory as
    | Record<string, unknown>
    | undefined;
  return (
    !!delivery &&
    delivery.available === false &&
    typeof delivery.reason === 'string'
  );
}

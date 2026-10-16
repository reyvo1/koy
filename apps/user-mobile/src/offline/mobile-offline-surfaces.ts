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
  MobileDeviceSummary,
} from '../device-control/mobile-device-client';
import {
  surfaceSnapshotKey,
  type MobileSnapshotCache,
} from './mobile-snapshot-cache';

const CACHED_MAX_DEVICES = 500;
const CACHED_MAX_ALERT_ITEMS = 200;

export const DEVICES_OFFLINE_SURFACE = 'devices';
export const ALERTS_OFFLINE_SURFACE = 'alerts';

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

/**
 * Structural guards for the two cached payloads. Both were produced by the bounded network loader,
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

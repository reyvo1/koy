import 'server-only';

import { BackendRequestError, readBackendJson } from './backend';
import {
  COMMAND_STATUSES,
  DEVICE_STATUSES,
  type AdminOperationalSummary,
  type CommandStatus,
  type DeviceStatus,
} from './contracts';
import { AdminSessionBackendClient } from './session';

const MAX_STALE_THRESHOLD_SECONDS = 24 * 60 * 60;

export async function loadOperationalSummary(
  client: AdminSessionBackendClient,
): Promise<AdminOperationalSummary> {
  const payload = await readBackendJson<unknown>(
    await client.request('/admin/operational-summary'),
  );

  return parseOperationalSummary(payload);
}

export function parseOperationalSummary(
  value: unknown,
): AdminOperationalSummary {
  const root = record(value, 'root');
  const devices = record(root.devices, 'devices');
  const capabilities = record(root.capabilities, 'capabilities');
  const telemetry = record(root.telemetry, 'telemetry');
  const commands = record(root.commands, 'commands');

  const deviceTotal = count(devices.total, 'devices.total');
  const devicesByStatus = statusCounts<DeviceStatus>(
    devices.byStatus,
    DEVICE_STATUSES,
    'devices.byStatus',
  );
  const staleHeartbeat = count(
    devices.staleHeartbeat,
    'devices.staleHeartbeat',
  );
  const neverReportedHeartbeat = count(
    devices.neverReportedHeartbeat,
    'devices.neverReportedHeartbeat',
  );
  const commandTotal = count(commands.total, 'commands.total');
  const commandsByStatus = statusCounts<CommandStatus>(
    commands.byStatus,
    COMMAND_STATUSES,
    'commands.byStatus',
  );

  consistentTotal(deviceTotal, devicesByStatus, 'devices');
  consistentTotal(commandTotal, commandsByStatus, 'commands');
  if (
    staleHeartbeat > deviceTotal ||
    neverReportedHeartbeat > deviceTotal ||
    staleHeartbeat + neverReportedHeartbeat > deviceTotal
  ) {
    invalid('devices.heartbeatCounts');
  }

  return {
    generatedAt: isoTimestamp(root.generatedAt, 'generatedAt'),
    staleThresholdSeconds: boundedInteger(
      root.staleThresholdSeconds,
      'staleThresholdSeconds',
      1,
      MAX_STALE_THRESHOLD_SECONDS,
    ),
    devices: {
      total: deviceTotal,
      byStatus: devicesByStatus,
      staleHeartbeat,
      neverReportedHeartbeat,
    },
    capabilities: {
      readable: count(capabilities.readable, 'capabilities.readable'),
      reportable: count(capabilities.reportable, 'capabilities.reportable'),
      writable: count(capabilities.writable, 'capabilities.writable'),
    },
    telemetry: {
      latestObservedAt:
        telemetry.latestObservedAt === null
          ? null
          : isoTimestamp(
              telemetry.latestObservedAt,
              'telemetry.latestObservedAt',
            ),
    },
    commands: {
      total: commandTotal,
      byStatus: commandsByStatus,
    },
  };
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    invalid(path);
  }

  return value as Record<string, unknown>;
}

function count(value: unknown, path: string): number {
  return boundedInteger(value, path, 0, Number.MAX_SAFE_INTEGER);
}

function boundedInteger(
  value: unknown,
  path: string,
  minimum: number,
  maximum: number,
): number {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < minimum ||
    value > maximum
  ) {
    invalid(path);
  }

  return value;
}

function isoTimestamp(value: unknown, path: string): string {
  if (
    typeof value !== 'string' ||
    value.length > 64 ||
    Number.isNaN(Date.parse(value))
  ) {
    invalid(path);
  }

  return value;
}

function statusCounts<T extends string>(
  value: unknown,
  statuses: readonly T[],
  path: string,
): Record<T, number> {
  const source = record(value, path);
  return Object.fromEntries(
    statuses.map((status) => [
      status,
      count(source[status], `${path}.${status}`),
    ]),
  ) as Record<T, number>;
}

function consistentTotal<T extends string>(
  total: number,
  counts: Record<T, number>,
  path: string,
): void {
  const sum = Object.values<number>(counts).reduce(
    (current, value) => current + value,
    0,
  );
  if (sum !== total) {
    invalid(`${path}.total`);
  }
}

function invalid(path: string): never {
  throw new BackendRequestError(
    502,
    'ADMIN_WEB_OPERATIONAL_SUMMARY_INVALID',
    `Operational summary field is invalid: ${path}`,
    null,
  );
}

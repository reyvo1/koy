export const DEVICE_STATUSES = [
  'PROVISIONING',
  'PAIRED',
  'ACTIVE',
  'INACTIVE',
  'REVOKED',
] as const;

export const COMMAND_STATUSES = [
  'PENDING',
  'SENT',
  'ACKNOWLEDGED',
  'FAILED',
  'TIMED_OUT',
] as const;

/**
 * Command statuses that are still in flight: the command has not reached a decision yet.
 *
 * Everything else is terminal, derived rather than listed. Deriving matters because these
 * clients poll a submitted command until it settles: an explicit terminal list would treat
 * any status added to the enum later as non-terminal, so the poll would never stop and the
 * user would watch a spinner forever with no result. Deriving defaults a new status to
 * terminal, which is the safe direction to fail.
 */
export const IN_FLIGHT_COMMAND_STATUSES = ['PENDING', 'SENT'] as const;

export const TERMINAL_COMMAND_STATUSES: readonly CommandStatus[] =
  COMMAND_STATUSES.filter(
    (status) =>
      !(IN_FLIGHT_COMMAND_STATUSES as readonly string[]).includes(status),
  );

export type DeviceStatus = (typeof DEVICE_STATUSES)[number];
export type CommandStatus = (typeof COMMAND_STATUSES)[number];

export interface AdminOperationalSummary {
  generatedAt: string;
  staleThresholdSeconds: number;
  devices: {
    total: number;
    byStatus: Record<DeviceStatus, number>;
    staleHeartbeat: number;
    neverReportedHeartbeat: number;
  };
  capabilities: {
    readable: number;
    reportable: number;
    writable: number;
  };
  telemetry: {
    latestObservedAt: string | null;
  };
  commands: {
    total: number;
    byStatus: Record<CommandStatus, number>;
  };
}

export interface ClientErrorPayload {
  state: 'unauthorized' | 'offline' | 'error';
  message: string;
  requestId: string | null;
}

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

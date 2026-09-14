import { CommandStatus, DeviceStatus } from '@prisma/client';

export const ADMIN_OPERATIONAL_SUMMARY_STALE_THRESHOLD_SECONDS = 300;

export interface AdminTenantContext {
  tenantId: string;
  membershipId: string;
  role: string;
}

export interface AdminOperationsRequest {
  user: {
    userId: string;
    tenantContext: AdminTenantContext;
  };
}

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

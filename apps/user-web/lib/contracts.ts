export type DashboardWidgetKind =
  'CARD' | 'SWITCH' | 'GAUGE' | 'CHART' | 'MAP' | 'TABLE' | 'STATUS';

export type DashboardBreakpoint = 'MOBILE' | 'TABLET' | 'DESKTOP';
export type DashboardResolutionState = 'READY' | 'INVALID' | 'UNSUPPORTED';
export type DashboardDataState =
  'READY' | 'EMPTY' | 'STALE' | 'INVALID' | 'UNSUPPORTED' | 'ERROR';

export interface UserMembership {
  tenantId: string;
  role: string;
  status: string;
}

export interface UserProfile {
  id: string;
  email: string;
  name: string | null;
  tenantId: string;
  isVerified: boolean;
  memberships: UserMembership[];
}

export interface DashboardSummary {
  id: string;
  name: string;
  description: string | null;
  audience: 'PERSONAL' | 'TENANT_SHARED';
  schemaVersion: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
}

export interface DashboardLayoutItem {
  id: string;
  widgetId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  minWidth: number | null;
  minHeight: number | null;
}

export interface DashboardLayout {
  id: string;
  breakpoint: DashboardBreakpoint;
  columns: number;
  rowHeight: number;
  gap: number;
  items: DashboardLayoutItem[];
}

export interface DashboardWidgetBinding {
  id: string;
  alias: string;
  intent: 'READ' | 'REPORT' | 'WRITE';
  mode: 'DEVICE_STATUS' | 'LATEST' | 'HISTORY' | 'AGGREGATE' | 'COMMAND';
  deviceId: string;
  capabilityId: string | null;
  queryConfig: Record<string, unknown> | null;
}

export interface DashboardWidget {
  id: string;
  kind: DashboardWidgetKind;
  title: string;
  schemaVersion: string;
  presentationConfig: Record<string, unknown> | null;
  bindings: DashboardWidgetBinding[];
}

export interface DashboardAggregate extends DashboardSummary {
  layouts: DashboardLayout[];
  widgets: DashboardWidget[];
}

export interface ResolvedBinding {
  id: string;
  alias: string;
  intent: 'READ' | 'REPORT' | 'WRITE';
  mode: 'DEVICE_STATUS' | 'LATEST' | 'HISTORY' | 'AGGREGATE' | 'COMMAND';
  device: { id: string; status: string } | null;
  capability: {
    id: string;
    key: string;
    semanticType: string;
    dataType: string;
    unit: string | null;
    constraints: {
      min?: number;
      max?: number;
      precision?: number;
      enumValues?: string[];
    };
    access: {
      readable: boolean;
      writable: boolean;
      reportable: boolean;
    };
  } | null;
  query: Record<string, unknown>;
}

export interface ResolvedWidget {
  id: string;
  kind: DashboardWidgetKind;
  title: string;
  state: DashboardResolutionState;
  reasonCode: string | null;
  message: string | null;
  presentation: Record<string, unknown>;
  supportedStates: readonly string[];
  bindings: ResolvedBinding[];
}

export interface DashboardResolution {
  dashboardId: string;
  schemaVersion: string;
  revision: number;
  summary: {
    total: number;
    ready: number;
    invalid: number;
    unsupported: number;
  };
  widgets: ResolvedWidget[];
}

export interface WidgetBindingData {
  id: string;
  alias: string;
  mode: ResolvedBinding['mode'];
  state: DashboardDataState;
  reasonCode: string | null;
  message: string | null;
  observedAt: string | null;
  data: Record<string, unknown> | null;
}

export interface WidgetData {
  dashboardId: string;
  schemaVersion: string;
  revision: number;
  widgetId: string;
  kind: DashboardWidgetKind;
  title: string;
  state: DashboardDataState;
  reasonCode: string | null;
  message: string | null;
  generatedAt: string;
  summary: {
    total: number;
    ready: number;
    empty: number;
    stale: number;
    invalid: number;
    unsupported: number;
    error: number;
  };
  bindings: WidgetBindingData[];
}

export interface DashboardExperiencePayload {
  profile: UserProfile;
  dashboards: DashboardSummary[];
  selectedDashboardId: string | null;
  dashboard: DashboardAggregate | null;
  resolution: DashboardResolution | null;
  widgetData: Record<string, WidgetData>;
}

export interface ClientErrorPayload {
  state: 'unauthorized' | 'offline' | 'error';
  message: string;
  requestId: string | null;
}

export interface UserWorkspaceDevice {
  id: string;
  name: string;
  type: string;
  status: string;
  lastHeartbeatAt: string | null;
  canControl: boolean;
  roomId: string | null;
  roomName: string | null;
  roomPath: string | null;
}

export interface UserWorkspaceRoom {
  id: string;
  name: string;
  path: string;
  devices: UserWorkspaceDevice[];
}

export interface UserWorkspacePayload {
  totalAccessibleDevices: number;
  visibleDeviceCount: number;
  truncated: boolean;
  maxVisibleDevices: number;
  rooms: UserWorkspaceRoom[];
  unassignedDevices: UserWorkspaceDevice[];
  devices: UserWorkspaceDevice[];
}

export interface UserDeviceCapability {
  id: string;
  key: string;
  semanticType: string;
  dataType: string;
  unit: string | null;
  constraints: Record<string, unknown> | null;
  isReadable: boolean;
  isWritable: boolean;
  isReportable: boolean;
  schemaVersion: string;
}

export interface UserDeviceCommandHistoryItem {
  id: string;
  correlationId: string;
  payload: Record<string, unknown>;
  status: string;
  createdAt: string;
  sentAt: string | null;
  acknowledgedAt: string | null;
  updatedAt: string;
}


export interface UserDeviceTechnicalHistory {
  deviceId: string;
  deviceType: string;
  firmware: {
    currentVersion: string | null;
    availability: 'UNAVAILABLE_BY_CONTRACT';
    reason: string;
  };
  protocol: {
    name: string | null;
    availability: 'UNAVAILABLE_BY_CONTRACT';
    reason: string;
  };
  updateHistory: Array<{
    rolloutId: string;
    rolloutStatus: string;
    evidenceState: 'COMPLETED_RECORDED' | 'FAILED_RECORDED' | 'TARGETED_NO_DEVICE_RESULT';
    firmware: {
      id: string;
      version: string;
      sha256Metadata: string;
      sizeBytes: string;
      releaseNotes: string | null;
      createdAt: string;
    };
    targeted: true;
    completedRecorded: boolean;
    failedRecorded: boolean;
    artifactBytesVerifiedByPlatform: false;
    physicalInstallProven: false;
    createdAt: string;
    updatedAt: string;
  }>;
  updateHistoryBounded: boolean;
  updateHistoryLimit: number;
  rolloutScanLimit: number;
  rolloutScanSaturated: boolean;
  analyticsFindings: Array<{
    id: string;
    capabilityKey: string;
    kind: string;
    severity: string;
    summary: string;
    confidence: number;
    detectorVersion: string;
    evidenceTelemetryId: string | null;
    createdAt: string;
  }>;
  analyticsFindingLimit: number;
  alertDeliveryHistory: { available: false; reason: string };
}

export interface UserDeviceDetailPayload {
  device: {
    id: string;
    name: string;
    type: string;
    status: string;
    lastHeartbeatAt: string | null;
    createdAt: string;
    updatedAt: string;
    canControl: boolean;
    roomId: string | null;
    roomName: string | null;
    roomPath: string | null;
  };
  capabilities: UserDeviceCapability[];
  latestTelemetry: {
    id: string;
    eventId: string;
    payload: Record<string, unknown>;
    createdAt: string;
  } | null;
  commandHistory: UserDeviceCommandHistoryItem[];
  technicalHistory: UserDeviceTechnicalHistory;
}

/**
 * Full `CommandStatus` vocabulary, mirrored from the Prisma enum.
 *
 * The mobile and user-web clients poll a submitted command until it settles, so the terminal
 * set is derived from this list rather than written out. An explicit terminal list would
 * treat any status added to the enum later as non-terminal, and the poll would never stop.
 * Deriving defaults a new status to terminal, which fails safe.
 *
 * `scripts/validate-rescue-baseline.mjs` pins this list against the Prisma enum, so drift
 * between the app and the backend is a gate failure rather than a stuck spinner.
 */
export const COMMAND_STATUSES = [
  'PENDING',
  'SENT',
  'ACKNOWLEDGED',
  'FAILED',
  'TIMED_OUT',
] as const;

export type CommandStatus = (typeof COMMAND_STATUSES)[number];

export const IN_FLIGHT_COMMAND_STATUSES = ['PENDING', 'SENT'] as const;

export const TERMINAL_COMMAND_STATUSES: ReadonlySet<string> = new Set(
  COMMAND_STATUSES.filter(
    (status) =>
      !(IN_FLIGHT_COMMAND_STATUSES as readonly string[]).includes(status),
  ),
);

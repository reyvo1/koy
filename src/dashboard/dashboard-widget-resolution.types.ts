import {
  DashboardBindingIntent,
  DashboardBindingMode,
  DashboardWidgetKind,
  DeviceStatus,
  Prisma,
} from '@prisma/client';

export type DashboardWidgetResolutionState =
  'READY' | 'INVALID' | 'UNSUPPORTED';

export interface DashboardResolutionCapability {
  id: string;
  deviceId: string;
  key: string;
  semanticType: string;
  dataType: string;
  unit: string | null;
  constraints: Prisma.JsonValue | null;
  isReadable: boolean;
  isWritable: boolean;
  isReportable: boolean;
  schemaVersion: string;
}

export interface DashboardResolutionDevice {
  id: string;
  status: DeviceStatus;
}

export interface DashboardResolutionBindingInput {
  id: string;
  alias: string;
  intent: DashboardBindingIntent;
  mode: DashboardBindingMode;
  deviceId: string;
  capabilityId: string | null;
  queryConfig: Prisma.JsonValue | null;
  device: DashboardResolutionDevice | null;
  capability: DashboardResolutionCapability | null;
}

export interface DashboardResolutionWidgetInput {
  id: string;
  kind: DashboardWidgetKind;
  title: string;
  schemaVersion: string;
  presentationConfig: Prisma.JsonValue | null;
  bindings: DashboardResolutionBindingInput[];
}

export interface DashboardResolvedCapability {
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
}

export interface DashboardResolvedBinding {
  id: string;
  alias: string;
  intent: DashboardBindingIntent;
  mode: DashboardBindingMode;
  device: {
    id: string;
    status: DeviceStatus;
  } | null;
  capability: DashboardResolvedCapability | null;
  query: Record<string, unknown>;
}

export interface DashboardResolvedWidget {
  id: string;
  kind: DashboardWidgetKind;
  title: string;
  state: DashboardWidgetResolutionState;
  reasonCode: string | null;
  message: string | null;
  presentation: Record<string, unknown>;
  supportedStates: readonly [
    'LOADING',
    'EMPTY',
    'STALE',
    'UNAUTHORIZED',
    'OFFLINE',
    'ERROR',
  ];
  bindings: DashboardResolvedBinding[];
}

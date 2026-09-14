export const AUTOMATION_SCHEMA_VERSION = '1.0.0' as const;

export const AUTOMATION_DOMAIN_LIMITS = {
  maxNameLength: 120,
  maxIdentifierLength: 128,
  maxActionIdLength: 64,
  maxStringValueLength: 1024,
  maxConditionDepth: 5,
  maxConditionNodes: 32,
  maxConditionChildren: 8,
  maxActions: 16,
} as const;

export type AutomationPrimitive = string | number | boolean;

export type AutomationComparisonOperator =
  | 'EQUALS'
  | 'NOT_EQUALS'
  | 'GREATER_THAN'
  | 'GREATER_THAN_OR_EQUAL'
  | 'LESS_THAN'
  | 'LESS_THAN_OR_EQUAL';

export interface CapabilityReportedTrigger {
  readonly kind: 'CAPABILITY_REPORTED';
  readonly deviceId: string;
  readonly capabilityKey: string;
}

export type AutomationTrigger = CapabilityReportedTrigger;

export interface TriggerValueSource {
  readonly source: 'TRIGGER_VALUE';
}

export interface LatestCapabilityValueSource {
  readonly source: 'LATEST_CAPABILITY_VALUE';
  readonly deviceId: string;
  readonly capabilityKey: string;
}

export type AutomationValueSource =
  TriggerValueSource | LatestCapabilityValueSource;

export interface AlwaysCondition {
  readonly kind: 'ALWAYS';
}

export interface AllCondition {
  readonly kind: 'ALL';
  readonly conditions: readonly AutomationCondition[];
}

export interface AnyCondition {
  readonly kind: 'ANY';
  readonly conditions: readonly AutomationCondition[];
}

export interface NotCondition {
  readonly kind: 'NOT';
  readonly condition: AutomationCondition;
}

export interface CompareCondition {
  readonly kind: 'COMPARE';
  readonly left: AutomationValueSource;
  readonly operator: AutomationComparisonOperator;
  readonly right: AutomationPrimitive;
}

export type AutomationCondition =
  | AlwaysCondition
  | AllCondition
  | AnyCondition
  | NotCondition
  | CompareCondition;

export interface DeviceCommandAction {
  readonly actionId: string;
  readonly kind: 'DEVICE_COMMAND';
  readonly deviceId: string;
  readonly capabilityKey: string;
  readonly value: AutomationPrimitive;
}

export type AutomationAction = DeviceCommandAction;

export interface AutomationDefinitionContract {
  readonly schemaVersion: typeof AUTOMATION_SCHEMA_VERSION;
  readonly name: string;
  readonly trigger: AutomationTrigger;
  readonly condition: AutomationCondition;
  readonly actions: readonly AutomationAction[];
}

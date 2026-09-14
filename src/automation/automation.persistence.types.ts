import { AutomationDefinitionContract } from './automation-domain.types';

export interface AutomationPersistenceInput {
  tenantId: string;
  ownerMembershipId: string;
  definition: AutomationDefinitionContract;
  enabled?: boolean;
}

export interface ReplaceAutomationPersistenceInput extends AutomationPersistenceInput {
  automationId: string;
  expectedRevision: number;
}

export interface SetAutomationEnabledPersistenceInput {
  tenantId: string;
  ownerMembershipId: string;
  automationId: string;
  expectedRevision: number;
  enabled: boolean;
}

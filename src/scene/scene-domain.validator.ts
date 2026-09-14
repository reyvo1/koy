import {
  AUTOMATION_DOMAIN_LIMITS,
  AutomationPrimitive,
} from '../automation/automation-domain.types';

export const SCENE_DOMAIN_LIMITS = {
  maxNameLength: AUTOMATION_DOMAIN_LIMITS.maxNameLength,
  maxActionIdLength: AUTOMATION_DOMAIN_LIMITS.maxActionIdLength,
  maxActions: AUTOMATION_DOMAIN_LIMITS.maxActions,
  minActions: 1,
} as const;

const SCENE_ACTION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

export interface SceneActionIntent {
  readonly actionId: string;
  readonly deviceId: string;
  readonly capabilityId: string;
  readonly capabilityKey: string;
  readonly value: AutomationPrimitive;
}

export interface CreateSceneInput {
  readonly name: string;
  readonly actions: readonly SceneActionIntent[];
}

export type SceneDomainErrorCode =
  | 'SCENE_NAME_INVALID'
  | 'SCENE_ACTIONS_COUNT_INVALID'
  | 'SCENE_ACTION_ID_INVALID'
  | 'SCENE_ACTION_ID_DUPLICATE'
  | 'SCENE_DEVICE_ID_INVALID'
  | 'SCENE_CAPABILITY_ID_INVALID'
  | 'SCENE_CAPABILITY_KEY_INVALID'
  | 'SCENE_VALUE_NOT_PRIMITIVE';

export class SceneDomainError extends Error {
  constructor(
    public readonly code: SceneDomainErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'SceneDomainError';
  }
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CAPABILITY_KEY_PATTERN = /^[A-Za-z][A-Za-z0-9_.-]{0,127}$/;

/**
 * Module 12 Slice 12.1 — bounded scene creation validation. Mirrors the
 * automation domain contract: no scripts, topics, templates, or arbitrary
 * nested payloads; primitive values only; tenant context stays server-derived.
 */
export function validateCreateSceneInput(input: unknown): CreateSceneInput {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new SceneDomainError('SCENE_NAME_INVALID', 'Scene input must be an object');
  }
  const record = input as Record<string, unknown>;
  const name =
    typeof record.name === 'string' ? record.name.trim() : '';
  if (!name || name.length > SCENE_DOMAIN_LIMITS.maxNameLength) {
    throw new SceneDomainError(
      'SCENE_NAME_INVALID',
      `Scene name must be 1..${SCENE_DOMAIN_LIMITS.maxNameLength} characters`,
    );
  }

  const rawActions = record.actions;
  if (
    !Array.isArray(rawActions) ||
    rawActions.length < SCENE_DOMAIN_LIMITS.minActions ||
    rawActions.length > SCENE_DOMAIN_LIMITS.maxActions
  ) {
    throw new SceneDomainError(
      'SCENE_ACTIONS_COUNT_INVALID',
      `Scene requires 1..${SCENE_DOMAIN_LIMITS.maxActions} actions`,
    );
  }

  const seen = new Set<string>();
  const actions = rawActions.map((raw): SceneActionIntent => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new SceneDomainError(
        'SCENE_ACTION_ID_INVALID',
        'Each scene action must be an object',
      );
    }
    const action = raw as Record<string, unknown>;
    const actionId =
      typeof action.actionId === 'string' ? action.actionId : '';
    if (
      !actionId ||
      actionId.length > SCENE_DOMAIN_LIMITS.maxActionIdLength ||
      !SCENE_ACTION_ID_PATTERN.test(actionId)
    ) {
      throw new SceneDomainError(
        'SCENE_ACTION_ID_INVALID',
        `Scene actionId must match ${SCENE_ACTION_ID_PATTERN.source}`,
      );
    }
    if (seen.has(actionId)) {
      throw new SceneDomainError(
        'SCENE_ACTION_ID_DUPLICATE',
        `Duplicate scene actionId: ${actionId}`,
      );
    }
    seen.add(actionId);

    const deviceId =
      typeof action.deviceId === 'string' ? action.deviceId : '';
    if (!UUID_PATTERN.test(deviceId)) {
      throw new SceneDomainError('SCENE_DEVICE_ID_INVALID', 'Invalid deviceId');
    }
    const capabilityId =
      typeof action.capabilityId === 'string' ? action.capabilityId : '';
    if (!UUID_PATTERN.test(capabilityId)) {
      throw new SceneDomainError(
        'SCENE_CAPABILITY_ID_INVALID',
        'Invalid capabilityId',
      );
    }
    const capabilityKey =
      typeof action.capabilityKey === 'string' ? action.capabilityKey : '';
    if (!CAPABILITY_KEY_PATTERN.test(capabilityKey)) {
      throw new SceneDomainError(
        'SCENE_CAPABILITY_KEY_INVALID',
        'Invalid capabilityKey',
      );
    }
    const value = action.value;
    if (
      typeof value !== 'string' &&
      typeof value !== 'number' &&
      typeof value !== 'boolean'
    ) {
      throw new SceneDomainError(
        'SCENE_VALUE_NOT_PRIMITIVE',
        'Scene action values must be string, number, or boolean',
      );
    }

    return { actionId, deviceId, capabilityId, capabilityKey, value };
  });

  return { name, actions };
}

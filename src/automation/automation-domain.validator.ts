import { ERROR_CODES } from '../common/errors/error-code';
import { DomainBadRequestException } from '../common/errors/domain-exceptions';
import {
  AUTOMATION_DOMAIN_LIMITS,
  AUTOMATION_SCHEMA_VERSION,
  AutomationComparisonOperator,
  AutomationCondition,
  AutomationDefinitionContract,
  AutomationPrimitive,
  AutomationTrigger,
  AutomationValueSource,
  DeviceCommandAction,
} from './automation-domain.types';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CAPABILITY_KEY_PATTERN = /^[A-Za-z][A-Za-z0-9_.-]{0,127}$/;
const ACTION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

const COMPARISON_OPERATORS = new Set<AutomationComparisonOperator>([
  'EQUALS',
  'NOT_EQUALS',
  'GREATER_THAN',
  'GREATER_THAN_OR_EQUAL',
  'LESS_THAN',
  'LESS_THAN_OR_EQUAL',
]);

const NUMERIC_COMPARISON_OPERATORS = new Set<AutomationComparisonOperator>([
  'GREATER_THAN',
  'GREATER_THAN_OR_EQUAL',
  'LESS_THAN',
  'LESS_THAN_OR_EQUAL',
]);

interface ConditionCounter {
  nodes: number;
}

export class AutomationDomainValidator {
  validateDefinition(input: unknown): AutomationDefinitionContract {
    const definition = this.assertRecord(input, 'automation');
    this.assertExactKeys(
      definition,
      ['schemaVersion', 'name', 'trigger', 'condition', 'actions'],
      'automation',
    );

    if (definition.schemaVersion !== AUTOMATION_SCHEMA_VERSION) {
      this.fail('automation.schemaVersion is unsupported');
    }

    this.assertBoundedTrimmedString(
      definition.name,
      'automation.name',
      AUTOMATION_DOMAIN_LIMITS.maxNameLength,
    );

    const trigger = this.validateTrigger(definition.trigger);
    this.validateCondition(definition.condition, 1, { nodes: 0 });
    this.validateActions(definition.actions, trigger);

    return definition as unknown as AutomationDefinitionContract;
  }

  private validateTrigger(input: unknown): AutomationTrigger {
    const trigger = this.assertRecord(input, 'automation.trigger');
    this.assertExactKeys(
      trigger,
      ['kind', 'deviceId', 'capabilityKey'],
      'automation.trigger',
    );

    if (trigger.kind !== 'CAPABILITY_REPORTED') {
      this.fail('automation.trigger.kind is unsupported');
    }

    this.assertUuid(trigger.deviceId, 'automation.trigger.deviceId');
    this.assertCapabilityKey(
      trigger.capabilityKey,
      'automation.trigger.capabilityKey',
    );

    return trigger as unknown as AutomationTrigger;
  }

  private validateCondition(
    input: unknown,
    depth: number,
    counter: ConditionCounter,
  ): AutomationCondition {
    if (depth > AUTOMATION_DOMAIN_LIMITS.maxConditionDepth) {
      this.fail('automation.condition exceeds maximum depth');
    }

    counter.nodes += 1;
    if (counter.nodes > AUTOMATION_DOMAIN_LIMITS.maxConditionNodes) {
      this.fail('automation.condition exceeds maximum node count');
    }

    const condition = this.assertRecord(input, 'automation.condition');
    const kind = condition.kind;

    switch (kind) {
      case 'ALWAYS':
        this.assertExactKeys(condition, ['kind'], 'automation.condition');
        break;
      case 'ALL':
      case 'ANY':
        this.assertExactKeys(
          condition,
          ['kind', 'conditions'],
          'automation.condition',
        );
        this.validateConditionChildren(condition.conditions, depth, counter);
        break;
      case 'NOT':
        this.assertExactKeys(
          condition,
          ['kind', 'condition'],
          'automation.condition',
        );
        this.validateCondition(condition.condition, depth + 1, counter);
        break;
      case 'COMPARE':
        this.assertExactKeys(
          condition,
          ['kind', 'left', 'operator', 'right'],
          'automation.condition',
        );
        this.validateValueSource(condition.left);
        this.validateComparisonOperator(condition.operator);
        this.validatePrimitive(condition.right, 'automation.condition.right');
        if (
          NUMERIC_COMPARISON_OPERATORS.has(
            condition.operator as AutomationComparisonOperator,
          ) &&
          typeof condition.right !== 'number'
        ) {
          this.fail('numeric comparison requires a numeric right operand');
        }
        break;
      default:
        this.fail('automation.condition.kind is unsupported');
    }

    return condition as unknown as AutomationCondition;
  }

  private validateConditionChildren(
    input: unknown,
    depth: number,
    counter: ConditionCounter,
  ): void {
    if (!Array.isArray(input)) {
      this.fail('automation.condition.conditions must be an array');
    }
    if (
      input.length === 0 ||
      input.length > AUTOMATION_DOMAIN_LIMITS.maxConditionChildren
    ) {
      this.fail('automation.condition.conditions has an invalid size');
    }

    for (const child of input) {
      this.validateCondition(child, depth + 1, counter);
    }
  }

  private validateValueSource(input: unknown): AutomationValueSource {
    const source = this.assertRecord(input, 'automation.condition.left');

    switch (source.source) {
      case 'TRIGGER_VALUE':
        this.assertExactKeys(source, ['source'], 'automation.condition.left');
        break;
      case 'LATEST_CAPABILITY_VALUE':
        this.assertExactKeys(
          source,
          ['source', 'deviceId', 'capabilityKey'],
          'automation.condition.left',
        );
        this.assertUuid(source.deviceId, 'automation.condition.left.deviceId');
        this.assertCapabilityKey(
          source.capabilityKey,
          'automation.condition.left.capabilityKey',
        );
        break;
      default:
        this.fail('automation.condition.left.source is unsupported');
    }

    return source as unknown as AutomationValueSource;
  }

  private validateComparisonOperator(input: unknown): void {
    if (
      typeof input !== 'string' ||
      !COMPARISON_OPERATORS.has(input as AutomationComparisonOperator)
    ) {
      this.fail('automation.condition.operator is unsupported');
    }
  }

  private validateActions(input: unknown, trigger: AutomationTrigger): void {
    if (!Array.isArray(input)) {
      this.fail('automation.actions must be an array');
    }
    if (
      input.length === 0 ||
      input.length > AUTOMATION_DOMAIN_LIMITS.maxActions
    ) {
      this.fail('automation.actions has an invalid size');
    }

    const actionIds = new Set<string>();
    const targets = new Set<string>();

    for (const [index, candidate] of input.entries()) {
      const action = this.validateAction(candidate, index);

      if (actionIds.has(action.actionId)) {
        this.fail('automation.actions contains duplicate actionId values');
      }
      actionIds.add(action.actionId);

      const target = `${action.deviceId}:${action.capabilityKey}`;
      if (targets.has(target)) {
        this.fail('automation.actions contains duplicate device targets');
      }
      targets.add(target);

      if (
        action.deviceId === trigger.deviceId &&
        action.capabilityKey === trigger.capabilityKey
      ) {
        this.fail(
          'automation action cannot directly target its trigger source',
        );
      }
    }
  }

  private validateAction(input: unknown, index: number): DeviceCommandAction {
    const path = `automation.actions[${index}]`;
    const action = this.assertRecord(input, path);
    this.assertExactKeys(
      action,
      ['actionId', 'kind', 'deviceId', 'capabilityKey', 'value'],
      path,
    );

    if (action.kind !== 'DEVICE_COMMAND') {
      this.fail(`${path}.kind is unsupported`);
    }
    if (
      typeof action.actionId !== 'string' ||
      action.actionId.length > AUTOMATION_DOMAIN_LIMITS.maxActionIdLength ||
      !ACTION_ID_PATTERN.test(action.actionId)
    ) {
      this.fail(`${path}.actionId is invalid`);
    }

    this.assertUuid(action.deviceId, `${path}.deviceId`);
    this.assertCapabilityKey(action.capabilityKey, `${path}.capabilityKey`);
    this.validatePrimitive(action.value, `${path}.value`);

    return action as unknown as DeviceCommandAction;
  }

  private validatePrimitive(
    input: unknown,
    path: string,
  ): asserts input is AutomationPrimitive {
    if (typeof input === 'number') {
      if (!Number.isFinite(input)) {
        this.fail(`${path} must be a finite number`);
      }
      return;
    }
    if (typeof input === 'boolean') {
      return;
    }
    if (typeof input === 'string') {
      if (input.length > AUTOMATION_DOMAIN_LIMITS.maxStringValueLength) {
        this.fail(`${path} exceeds maximum string length`);
      }
      return;
    }
    this.fail(`${path} must be a string, number, or boolean`);
  }

  private assertUuid(input: unknown, path: string): asserts input is string {
    if (typeof input !== 'string' || !UUID_PATTERN.test(input)) {
      this.fail(`${path} must be a UUID`);
    }
  }

  private assertCapabilityKey(
    input: unknown,
    path: string,
  ): asserts input is string {
    if (
      typeof input !== 'string' ||
      input.length > AUTOMATION_DOMAIN_LIMITS.maxIdentifierLength ||
      !CAPABILITY_KEY_PATTERN.test(input)
    ) {
      this.fail(`${path} is invalid`);
    }
  }

  private assertBoundedTrimmedString(
    input: unknown,
    path: string,
    maximumLength: number,
  ): asserts input is string {
    if (
      typeof input !== 'string' ||
      input.length === 0 ||
      input.length > maximumLength ||
      input.trim() !== input
    ) {
      this.fail(`${path} is invalid`);
    }
  }

  private assertRecord(input: unknown, path: string): Record<string, unknown> {
    if (typeof input !== 'object' || input === null || Array.isArray(input)) {
      this.fail(`${path} must be an object`);
    }
    return input as Record<string, unknown>;
  }

  private assertExactKeys(
    input: Record<string, unknown>,
    keys: readonly string[],
    path: string,
  ): void {
    const actual = Object.keys(input).sort();
    const expected = [...keys].sort();

    if (
      actual.length !== expected.length ||
      actual.some((key, index) => key !== expected[index])
    ) {
      this.fail(`${path} contains missing or unsupported fields`);
    }
  }

  private fail(message: string): never {
    throw new DomainBadRequestException(
      ERROR_CODES.AutomationContractInvalid,
      message,
    );
  }
}

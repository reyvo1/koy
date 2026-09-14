import { Injectable } from '@nestjs/common';
import {
  AUTOMATION_DOMAIN_LIMITS,
  AutomationComparisonOperator,
  AutomationCondition,
  AutomationDefinitionContract,
  AutomationPrimitive,
  AutomationValueSource,
} from './automation-domain.types';
import { AutomationDomainValidator } from './automation-domain.validator';
import {
  AUTOMATION_EVALUATION_LIMITS,
  AutomationActionIntent,
  AutomationEvaluationMode,
  AutomationEvaluationReasonCode,
  AutomationEvaluationRequest,
  AutomationEvaluationResult,
  NormalizedLatestCapabilityValue,
} from './automation-evaluation.types';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CAPABILITY_KEY_PATTERN = /^[A-Za-z][A-Za-z0-9_.-]{0,127}$/;

type ConditionState = 'TRUE' | 'FALSE' | 'UNKNOWN';
type UnknownReason = Extract<
  AutomationEvaluationReasonCode,
  'VALUE_UNAVAILABLE' | 'TYPE_MISMATCH'
>;

interface ConditionResult {
  state: ConditionState;
  reason?: UnknownReason;
}

@Injectable()
export class AutomationEvaluator {
  private readonly validator = new AutomationDomainValidator();

  // Stable preview entrypoint contract: evaluate(input: unknown)
  evaluate(
    input: unknown,
    mode: AutomationEvaluationMode = 'DISABLED_DEFINITION_PREVIEW',
  ): AutomationEvaluationResult {
    if (mode !== 'DISABLED_DEFINITION_PREVIEW' && mode !== 'APPROVED_RUNTIME') {
      return this.invalidResult();
    }

    const envelope = this.validateEnvelope(input);
    if (envelope.ok === false) return envelope.result;

    const { request } = envelope;
    const { candidate, report } = request;

    if (
      (mode === 'DISABLED_DEFINITION_PREVIEW' && candidate.enabled) ||
      (mode === 'APPROVED_RUNTIME' && !candidate.enabled)
    ) {
      return this.result(
        candidate.automationId,
        candidate.revision,
        'REJECTED',
        'ACTIVATION_NOT_APPROVED',
      );
    }

    if (
      report.tenantId !== candidate.tenantId ||
      request.latestValues.some(
        (latestValue) => latestValue.tenantId !== candidate.tenantId,
      )
    ) {
      return this.result(
        candidate.automationId,
        candidate.revision,
        'REJECTED',
        'TENANT_MISMATCH',
      );
    }

    const trigger = candidate.definition.trigger;
    if (
      report.deviceId !== trigger.deviceId ||
      report.capabilityKey !== trigger.capabilityKey
    ) {
      return this.result(
        candidate.automationId,
        candidate.revision,
        'NOT_APPLICABLE',
        'TRIGGER_MISMATCH',
      );
    }

    const latestValues = new Map<string, AutomationPrimitive>();
    for (const latestValue of request.latestValues) {
      latestValues.set(this.targetKey(latestValue), latestValue.value);
    }

    const condition = this.evaluateCondition(
      candidate.definition.condition,
      report.value,
      latestValues,
    );

    if (condition.state === 'UNKNOWN') {
      return this.result(
        candidate.automationId,
        candidate.revision,
        'NOT_MATCHED',
        condition.reason ?? 'VALUE_UNAVAILABLE',
      );
    }

    if (condition.state === 'FALSE') {
      return this.result(
        candidate.automationId,
        candidate.revision,
        'NOT_MATCHED',
        'CONDITION_FALSE',
      );
    }

    return Object.freeze({
      automationId: candidate.automationId,
      revision: candidate.revision,
      outcome: 'MATCHED',
      reasonCode: 'CONDITION_MATCHED',
      matched: true,
      actionIntents: this.cloneActionIntents(candidate.definition),
    });
  }

  private validateEnvelope(
    input: unknown,
  ):
    | { ok: true; request: AutomationEvaluationRequest }
    | { ok: false; result: AutomationEvaluationResult } {
    if (
      !this.isRecord(input) ||
      !this.hasExactKeys(input, ['candidate', 'report', 'latestValues'])
    ) {
      return { ok: false, result: this.invalidResult() };
    }

    const candidate = input.candidate;
    const report = input.report;
    const latestValues = input.latestValues;

    if (
      !this.isRecord(candidate) ||
      !this.hasExactKeys(candidate, [
        'automationId',
        'tenantId',
        'enabled',
        'revision',
        'definition',
      ]) ||
      !this.isUuid(candidate.automationId) ||
      !this.isUuid(candidate.tenantId) ||
      typeof candidate.enabled !== 'boolean' ||
      !Number.isInteger(candidate.revision) ||
      (candidate.revision as number) < 1
    ) {
      return { ok: false, result: this.invalidResult() };
    }

    let definition: AutomationDefinitionContract;
    try {
      definition = this.validator.validateDefinition(candidate.definition);
    } catch {
      return {
        ok: false,
        result: this.result(
          candidate.automationId as string,
          candidate.revision as number,
          'REJECTED',
          'INVALID_DEFINITION',
        ),
      };
    }

    if (!this.isNormalizedValue(report)) {
      return {
        ok: false,
        result: this.result(
          candidate.automationId as string,
          candidate.revision as number,
          'REJECTED',
          'INVALID_INPUT',
        ),
      };
    }

    if (
      !Array.isArray(latestValues) ||
      latestValues.length > AUTOMATION_EVALUATION_LIMITS.maxLatestValues
    ) {
      return {
        ok: false,
        result: this.result(
          candidate.automationId as string,
          candidate.revision as number,
          'REJECTED',
          'INVALID_INPUT',
        ),
      };
    }

    const normalizedLatestValues: NormalizedLatestCapabilityValue[] = [];
    const targets = new Set<string>();
    for (const latestValue of latestValues) {
      if (!this.isNormalizedValue(latestValue)) {
        return {
          ok: false,
          result: this.result(
            candidate.automationId as string,
            candidate.revision as number,
            'REJECTED',
            'INVALID_INPUT',
          ),
        };
      }
      const target = this.targetKey(latestValue);
      if (targets.has(target)) {
        return {
          ok: false,
          result: this.result(
            candidate.automationId as string,
            candidate.revision as number,
            'REJECTED',
            'INVALID_INPUT',
          ),
        };
      }
      targets.add(target);
      normalizedLatestValues.push(latestValue);
    }

    return {
      ok: true,
      request: {
        candidate: {
          automationId: candidate.automationId as string,
          tenantId: candidate.tenantId as string,
          enabled: candidate.enabled as boolean,
          revision: candidate.revision as number,
          definition,
        },
        report,
        latestValues: normalizedLatestValues,
      },
    };
  }

  private evaluateCondition(
    condition: AutomationCondition,
    triggerValue: AutomationPrimitive,
    latestValues: ReadonlyMap<string, AutomationPrimitive>,
  ): ConditionResult {
    switch (condition.kind) {
      case 'ALWAYS':
        return { state: 'TRUE' };
      case 'ALL':
        return this.evaluateAll(
          condition.conditions,
          triggerValue,
          latestValues,
        );
      case 'ANY':
        return this.evaluateAny(
          condition.conditions,
          triggerValue,
          latestValues,
        );
      case 'NOT': {
        const child = this.evaluateCondition(
          condition.condition,
          triggerValue,
          latestValues,
        );
        if (child.state === 'UNKNOWN') return child;
        return { state: child.state === 'TRUE' ? 'FALSE' : 'TRUE' };
      }
      case 'COMPARE': {
        const left = this.resolveValueSource(
          condition.left,
          triggerValue,
          latestValues,
        );
        if (!left.available) {
          return { state: 'UNKNOWN', reason: 'VALUE_UNAVAILABLE' };
        }
        if (!this.typesMatch(left.value, condition.right)) {
          return { state: 'UNKNOWN', reason: 'TYPE_MISMATCH' };
        }
        return {
          state: this.compare(left.value, condition.operator, condition.right)
            ? 'TRUE'
            : 'FALSE',
        };
      }
    }
  }

  private evaluateAll(
    conditions: readonly AutomationCondition[],
    triggerValue: AutomationPrimitive,
    latestValues: ReadonlyMap<string, AutomationPrimitive>,
  ): ConditionResult {
    let unknown: ConditionResult | undefined;
    for (const condition of conditions) {
      const result = this.evaluateCondition(
        condition,
        triggerValue,
        latestValues,
      );
      if (result.state === 'FALSE') return result;
      if (result.state === 'UNKNOWN' && !unknown) unknown = result;
    }
    return unknown ?? { state: 'TRUE' };
  }

  private evaluateAny(
    conditions: readonly AutomationCondition[],
    triggerValue: AutomationPrimitive,
    latestValues: ReadonlyMap<string, AutomationPrimitive>,
  ): ConditionResult {
    let unknown: ConditionResult | undefined;
    for (const condition of conditions) {
      const result = this.evaluateCondition(
        condition,
        triggerValue,
        latestValues,
      );
      if (result.state === 'TRUE') return result;
      if (result.state === 'UNKNOWN' && !unknown) unknown = result;
    }
    return unknown ?? { state: 'FALSE' };
  }

  private resolveValueSource(
    source: AutomationValueSource,
    triggerValue: AutomationPrimitive,
    latestValues: ReadonlyMap<string, AutomationPrimitive>,
  ): { available: true; value: AutomationPrimitive } | { available: false } {
    if (source.source === 'TRIGGER_VALUE') {
      return { available: true, value: triggerValue };
    }
    const key = this.targetKey(source);
    if (!latestValues.has(key)) return { available: false };
    return { available: true, value: latestValues.get(key)! };
  }

  private compare(
    left: AutomationPrimitive,
    operator: AutomationComparisonOperator,
    right: AutomationPrimitive,
  ): boolean {
    switch (operator) {
      case 'EQUALS':
        return left === right;
      case 'NOT_EQUALS':
        return left !== right;
      case 'GREATER_THAN':
        return (left as number) > (right as number);
      case 'GREATER_THAN_OR_EQUAL':
        return (left as number) >= (right as number);
      case 'LESS_THAN':
        return (left as number) < (right as number);
      case 'LESS_THAN_OR_EQUAL':
        return (left as number) <= (right as number);
    }
  }

  private cloneActionIntents(
    definition: AutomationDefinitionContract,
  ): readonly AutomationActionIntent[] {
    return Object.freeze(
      definition.actions.map((action) =>
        Object.freeze({
          actionId: action.actionId,
          kind: action.kind,
          deviceId: action.deviceId,
          capabilityKey: action.capabilityKey,
          value: action.value,
        }),
      ),
    );
  }

  private typesMatch(
    left: AutomationPrimitive,
    right: AutomationPrimitive,
  ): boolean {
    return typeof left === typeof right;
  }

  private isNormalizedValue(
    input: unknown,
  ): input is NormalizedLatestCapabilityValue {
    return (
      this.isRecord(input) &&
      this.hasExactKeys(input, [
        'tenantId',
        'deviceId',
        'capabilityKey',
        'value',
      ]) &&
      this.isUuid(input.tenantId) &&
      this.isUuid(input.deviceId) &&
      this.isCapabilityKey(input.capabilityKey) &&
      this.isPrimitive(input.value)
    );
  }

  private isPrimitive(input: unknown): input is AutomationPrimitive {
    if (typeof input === 'number') return Number.isFinite(input);
    if (typeof input === 'boolean') return true;
    return (
      typeof input === 'string' &&
      input.length <= AUTOMATION_DOMAIN_LIMITS.maxStringValueLength
    );
  }

  private isUuid(input: unknown): input is string {
    return typeof input === 'string' && UUID_PATTERN.test(input);
  }

  private isCapabilityKey(input: unknown): input is string {
    return (
      typeof input === 'string' &&
      input.length <= AUTOMATION_DOMAIN_LIMITS.maxIdentifierLength &&
      CAPABILITY_KEY_PATTERN.test(input)
    );
  }

  private isRecord(input: unknown): input is Record<string, unknown> {
    return typeof input === 'object' && input !== null && !Array.isArray(input);
  }

  private hasExactKeys(
    input: Record<string, unknown>,
    expected: readonly string[],
  ): boolean {
    const actual = Object.keys(input).sort();
    const sortedExpected = [...expected].sort();
    return (
      actual.length === sortedExpected.length &&
      actual.every((key, index) => key === sortedExpected[index])
    );
  }

  private targetKey(input: {
    deviceId: string;
    capabilityKey: string;
  }): string {
    return `${input.deviceId}:${input.capabilityKey}`;
  }

  private invalidResult(): AutomationEvaluationResult {
    return this.result(null, null, 'REJECTED', 'INVALID_INPUT');
  }

  private result(
    automationId: string | null,
    revision: number | null,
    outcome: AutomationEvaluationResult['outcome'],
    reasonCode: AutomationEvaluationReasonCode,
  ): AutomationEvaluationResult {
    return Object.freeze({
      automationId,
      revision,
      outcome,
      reasonCode,
      matched: false,
      actionIntents: Object.freeze([]),
    });
  }
}

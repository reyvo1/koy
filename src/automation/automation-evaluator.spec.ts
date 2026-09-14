import { AutomationDefinitionContract } from './automation-domain.types';
import { AutomationEvaluator } from './automation-evaluator';
import { AutomationEvaluationRequest } from './automation-evaluation.types';

const TENANT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const AUTOMATION_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const TRIGGER_DEVICE_ID = '11111111-1111-4111-8111-111111111111';
const ACTION_DEVICE_ID = '22222222-2222-4222-8222-222222222222';
const CONDITION_DEVICE_ID = '33333333-3333-4333-8333-333333333333';

function definition(
  condition: AutomationDefinitionContract['condition'] = { kind: 'ALWAYS' },
): AutomationDefinitionContract {
  return {
    schemaVersion: '1.0.0',
    name: 'Evaluation fixture',
    trigger: {
      kind: 'CAPABILITY_REPORTED',
      deviceId: TRIGGER_DEVICE_ID,
      capabilityKey: 'temperature',
    },
    condition,
    actions: [
      {
        actionId: 'fan-on',
        kind: 'DEVICE_COMMAND',
        deviceId: ACTION_DEVICE_ID,
        capabilityKey: 'power',
        value: true,
      },
    ],
  };
}

function request(
  condition?: AutomationDefinitionContract['condition'],
): AutomationEvaluationRequest {
  return {
    candidate: {
      automationId: AUTOMATION_ID,
      tenantId: TENANT_ID,
      enabled: false,
      revision: 3,
      definition: definition(condition),
    },
    report: {
      tenantId: TENANT_ID,
      deviceId: TRIGGER_DEVICE_ID,
      capabilityKey: 'temperature',
      value: 31,
    },
    latestValues: [],
  };
}

describe('AutomationEvaluator', () => {
  const evaluator = new AutomationEvaluator();

  it('returns immutable action intents for a deterministic match', () => {
    const input = request({
      kind: 'COMPARE',
      left: { source: 'TRIGGER_VALUE' },
      operator: 'GREATER_THAN',
      right: 30,
    });

    const first = evaluator.evaluate(input);
    const second = evaluator.evaluate(input);

    expect(first).toEqual(second);
    expect(first).toEqual({
      automationId: AUTOMATION_ID,
      revision: 3,
      outcome: 'MATCHED',
      reasonCode: 'CONDITION_MATCHED',
      matched: true,
      actionIntents: [input.candidate.definition.actions[0]],
    });
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.actionIntents)).toBe(true);
    expect(Object.isFrozen(first.actionIntents[0])).toBe(true);
  });

  it('returns not applicable for a different normalized trigger source', () => {
    const base = request();
    const input: AutomationEvaluationRequest = {
      ...base,
      report: { ...base.report, capabilityKey: 'humidity' },
    };

    expect(evaluator.evaluate(input)).toMatchObject({
      outcome: 'NOT_APPLICABLE',
      reasonCode: 'TRIGGER_MISMATCH',
      matched: false,
      actionIntents: [],
    });
  });

  it('evaluates ALL, ANY, and NOT using latest capability values', () => {
    const input = request({
      kind: 'ALL',
      conditions: [
        {
          kind: 'COMPARE',
          left: { source: 'TRIGGER_VALUE' },
          operator: 'GREATER_THAN_OR_EQUAL',
          right: 31,
        },
        {
          kind: 'ANY',
          conditions: [
            {
              kind: 'COMPARE',
              left: {
                source: 'LATEST_CAPABILITY_VALUE',
                deviceId: CONDITION_DEVICE_ID,
                capabilityKey: 'occupancy',
              },
              operator: 'EQUALS',
              right: true,
            },
            {
              kind: 'NOT',
              condition: {
                kind: 'COMPARE',
                left: { source: 'TRIGGER_VALUE' },
                operator: 'LESS_THAN',
                right: 10,
              },
            },
          ],
        },
      ],
    });
    const withLatest: AutomationEvaluationRequest = {
      ...input,
      latestValues: [
        {
          tenantId: TENANT_ID,
          deviceId: CONDITION_DEVICE_ID,
          capabilityKey: 'occupancy',
          value: true,
        },
      ],
    };

    expect(evaluator.evaluate(withLatest)).toMatchObject({
      outcome: 'MATCHED',
      matched: true,
    });
  });

  it('keeps missing values unknown through NOT instead of turning them true', () => {
    const input = request({
      kind: 'NOT',
      condition: {
        kind: 'COMPARE',
        left: {
          source: 'LATEST_CAPABILITY_VALUE',
          deviceId: CONDITION_DEVICE_ID,
          capabilityKey: 'occupancy',
        },
        operator: 'EQUALS',
        right: true,
      },
    });

    expect(evaluator.evaluate(input)).toMatchObject({
      outcome: 'NOT_MATCHED',
      reasonCode: 'VALUE_UNAVAILABLE',
      matched: false,
      actionIntents: [],
    });
  });

  it('allows ANY to match when another branch is unknown', () => {
    const input = request({
      kind: 'ANY',
      conditions: [
        {
          kind: 'COMPARE',
          left: {
            source: 'LATEST_CAPABILITY_VALUE',
            deviceId: CONDITION_DEVICE_ID,
            capabilityKey: 'occupancy',
          },
          operator: 'EQUALS',
          right: true,
        },
        { kind: 'ALWAYS' },
      ],
    });

    expect(evaluator.evaluate(input)).toMatchObject({
      outcome: 'MATCHED',
      matched: true,
    });
  });

  it('fails closed on comparison type mismatch', () => {
    const input = request({
      kind: 'COMPARE',
      left: { source: 'TRIGGER_VALUE' },
      operator: 'EQUALS',
      right: '31',
    });

    expect(evaluator.evaluate(input)).toMatchObject({
      outcome: 'NOT_MATCHED',
      reasonCode: 'TYPE_MISMATCH',
      matched: false,
    });
  });

  it('rejects enabled candidates because activation is not approved', () => {
    const base = request();
    const input: AutomationEvaluationRequest = {
      ...base,
      candidate: { ...base.candidate, enabled: true },
    };

    expect(evaluator.evaluate(input)).toMatchObject({
      outcome: 'REJECTED',
      reasonCode: 'ACTIVATION_NOT_APPROVED',
      matched: false,
    });
  });

  it('evaluates only explicitly enabled candidates in approved runtime mode', () => {
    const base = request();
    const enabled: AutomationEvaluationRequest = {
      ...base,
      candidate: { ...base.candidate, enabled: true },
    };

    expect(evaluator.evaluate(enabled, 'APPROVED_RUNTIME')).toMatchObject({
      outcome: 'MATCHED',
      reasonCode: 'CONDITION_MATCHED',
      matched: true,
    });
    expect(evaluator.evaluate(base, 'APPROVED_RUNTIME')).toMatchObject({
      outcome: 'REJECTED',
      reasonCode: 'ACTIVATION_NOT_APPROVED',
      matched: false,
    });
  });

  it('rejects cross-tenant reports and latest values', () => {
    const reportBase = request();
    const reportMismatch: AutomationEvaluationRequest = {
      ...reportBase,
      report: {
        ...reportBase.report,
        tenantId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      },
    };
    expect(evaluator.evaluate(reportMismatch)).toMatchObject({
      outcome: 'REJECTED',
      reasonCode: 'TENANT_MISMATCH',
    });

    const latestBase = request();
    const latestMismatch: AutomationEvaluationRequest = {
      ...latestBase,
      latestValues: [
        {
          tenantId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
          deviceId: CONDITION_DEVICE_ID,
          capabilityKey: 'occupancy',
          value: true,
        },
      ],
    };
    expect(evaluator.evaluate(latestMismatch)).toMatchObject({
      outcome: 'REJECTED',
      reasonCode: 'TENANT_MISMATCH',
    });
  });

  it('rejects duplicate latest targets and hidden fields', () => {
    const duplicateBase = request();
    const value = {
      tenantId: TENANT_ID,
      deviceId: CONDITION_DEVICE_ID,
      capabilityKey: 'occupancy',
      value: true,
    };
    const duplicate: AutomationEvaluationRequest = {
      ...duplicateBase,
      latestValues: [value, value],
    };
    expect(evaluator.evaluate(duplicate)).toMatchObject({
      outcome: 'REJECTED',
      reasonCode: 'INVALID_INPUT',
    });

    expect(
      evaluator.evaluate({ ...request(), commandService: 'forbidden' }),
    ).toMatchObject({
      outcome: 'REJECTED',
      reasonCode: 'INVALID_INPUT',
    });
  });

  it('rejects invalid definitions without throwing', () => {
    const input = request() as unknown as Record<string, unknown>;
    input.candidate = {
      ...(input.candidate as Record<string, unknown>),
      definition: { schemaVersion: '2.0.0' },
    };

    expect(() => evaluator.evaluate(input)).not.toThrow();
    expect(evaluator.evaluate(input)).toMatchObject({
      outcome: 'REJECTED',
      reasonCode: 'INVALID_DEFINITION',
      matched: false,
    });
  });
});

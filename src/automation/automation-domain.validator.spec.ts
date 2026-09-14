import { BadRequestException } from '@nestjs/common';
import { ERROR_CODES } from '../common/errors/error-code';
import {
  AUTOMATION_DOMAIN_LIMITS,
  AutomationDefinitionContract,
} from './automation-domain.types';
import { AutomationDomainValidator } from './automation-domain.validator';

const TRIGGER_DEVICE_ID = '11111111-1111-4111-8111-111111111111';
const ACTION_DEVICE_ID = '22222222-2222-4222-8222-222222222222';
const CONDITION_DEVICE_ID = '33333333-3333-4333-8333-333333333333';

const validDefinition = (): AutomationDefinitionContract => ({
  schemaVersion: '1.0.0',
  name: 'Turn on ventilation when temperature is high',
  trigger: {
    kind: 'CAPABILITY_REPORTED',
    deviceId: TRIGGER_DEVICE_ID,
    capabilityKey: 'temperature',
  },
  condition: {
    kind: 'ALL',
    conditions: [
      {
        kind: 'COMPARE',
        left: { source: 'TRIGGER_VALUE' },
        operator: 'GREATER_THAN',
        right: 30,
      },
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
    ],
  },
  actions: [
    {
      actionId: 'ventilation-on',
      kind: 'DEVICE_COMMAND',
      deviceId: ACTION_DEVICE_ID,
      capabilityKey: 'power',
      value: true,
    },
  ],
});

describe('AutomationDomainValidator', () => {
  const validator = new AutomationDomainValidator();

  it('accepts the bounded versioned trigger-condition-action contract', () => {
    const definition = validDefinition();

    expect(validator.validateDefinition(definition)).toBe(definition);
  });

  it('accepts ALWAYS, ANY, and NOT condition nodes', () => {
    const definition = validDefinition() as unknown as Record<string, unknown>;
    definition.condition = {
      kind: 'ANY',
      conditions: [
        { kind: 'ALWAYS' },
        {
          kind: 'NOT',
          condition: {
            kind: 'COMPARE',
            left: { source: 'TRIGGER_VALUE' },
            operator: 'EQUALS',
            right: false,
          },
        },
      ],
    };

    expect(() => validator.validateDefinition(definition)).not.toThrow();
  });

  it('rejects unsupported trigger kinds and hidden trigger fields', () => {
    const unsupported = validDefinition() as unknown as Record<string, unknown>;
    unsupported.trigger = {
      kind: 'SCHEDULE',
      deviceId: TRIGGER_DEVICE_ID,
      capabilityKey: 'temperature',
    };

    expect(() => validator.validateDefinition(unsupported)).toThrow(
      BadRequestException,
    );

    const hidden = validDefinition() as unknown as Record<string, unknown>;
    hidden.trigger = {
      kind: 'CAPABILITY_REPORTED',
      deviceId: TRIGGER_DEVICE_ID,
      capabilityKey: 'temperature',
      mqttTopic: 'tenant/secret/device',
    };

    expect(() => validator.validateDefinition(hidden)).toThrow(
      BadRequestException,
    );
  });

  it('rejects unsupported schema versions and untrimmed names', () => {
    const version = validDefinition() as unknown as Record<string, unknown>;
    version.schemaVersion = '2.0.0';
    expect(() => validator.validateDefinition(version)).toThrow(
      BadRequestException,
    );

    const name = validDefinition() as unknown as Record<string, unknown>;
    name.name = ' invalid ';
    expect(() => validator.validateDefinition(name)).toThrow(
      BadRequestException,
    );
  });

  it('rejects condition trees deeper than the approved bound', () => {
    let condition: Record<string, unknown> = { kind: 'ALWAYS' };
    for (
      let index = 0;
      index < AUTOMATION_DOMAIN_LIMITS.maxConditionDepth;
      index += 1
    ) {
      condition = { kind: 'NOT', condition };
    }

    const definition = validDefinition() as unknown as Record<string, unknown>;
    definition.condition = condition;

    expect(() => validator.validateDefinition(definition)).toThrow(
      BadRequestException,
    );
  });

  it('rejects oversized condition trees and empty boolean groups', () => {
    const oversized = validDefinition() as unknown as Record<string, unknown>;
    oversized.condition = {
      kind: 'ALL',
      conditions: Array.from(
        { length: AUTOMATION_DOMAIN_LIMITS.maxConditionChildren + 1 },
        () => ({ kind: 'ALWAYS' }),
      ),
    };
    expect(() => validator.validateDefinition(oversized)).toThrow(
      BadRequestException,
    );

    const empty = validDefinition() as unknown as Record<string, unknown>;
    empty.condition = { kind: 'ANY', conditions: [] };
    expect(() => validator.validateDefinition(empty)).toThrow(
      BadRequestException,
    );
  });

  it('rejects condition trees above the total node bound', () => {
    const definition = validDefinition() as unknown as Record<string, unknown>;
    definition.condition = {
      kind: 'ALL',
      conditions: Array.from({ length: 8 }, () => ({
        kind: 'ANY',
        conditions: Array.from({ length: 4 }, () => ({ kind: 'ALWAYS' })),
      })),
    };

    expect(() => validator.validateDefinition(definition)).toThrow(
      BadRequestException,
    );
  });

  it('rejects nonnumeric operands for ordered comparisons', () => {
    const definition = validDefinition() as unknown as Record<string, unknown>;
    definition.condition = {
      kind: 'COMPARE',
      left: { source: 'TRIGGER_VALUE' },
      operator: 'GREATER_THAN',
      right: '30',
    };

    expect(() => validator.validateDefinition(definition)).toThrow(
      BadRequestException,
    );
  });

  it('rejects nonfinite values and structured command payloads', () => {
    const nonfinite = validDefinition() as unknown as Record<string, unknown>;
    nonfinite.actions = [
      {
        actionId: 'ventilation-on',
        kind: 'DEVICE_COMMAND',
        deviceId: ACTION_DEVICE_ID,
        capabilityKey: 'power',
        value: Number.POSITIVE_INFINITY,
      },
    ];
    expect(() => validator.validateDefinition(nonfinite)).toThrow(
      BadRequestException,
    );

    const structured = validDefinition() as unknown as Record<string, unknown>;
    structured.actions = [
      {
        actionId: 'ventilation-on',
        kind: 'DEVICE_COMMAND',
        deviceId: ACTION_DEVICE_ID,
        capabilityKey: 'power',
        value: { arbitrary: true },
      },
    ];
    expect(() => validator.validateDefinition(structured)).toThrow(
      BadRequestException,
    );
  });

  it('rejects duplicate action identities and duplicate targets', () => {
    const duplicateId = validDefinition() as unknown as Record<string, unknown>;
    duplicateId.actions = [
      ...validDefinition().actions,
      {
        actionId: 'ventilation-on',
        kind: 'DEVICE_COMMAND',
        deviceId: CONDITION_DEVICE_ID,
        capabilityKey: 'alarm',
        value: true,
      },
    ];
    expect(() => validator.validateDefinition(duplicateId)).toThrow(
      BadRequestException,
    );

    const duplicateTarget = validDefinition() as unknown as Record<
      string,
      unknown
    >;
    duplicateTarget.actions = [
      ...validDefinition().actions,
      {
        actionId: 'ventilation-off',
        kind: 'DEVICE_COMMAND',
        deviceId: ACTION_DEVICE_ID,
        capabilityKey: 'power',
        value: false,
      },
    ];
    expect(() => validator.validateDefinition(duplicateTarget)).toThrow(
      BadRequestException,
    );
  });

  it('rejects a direct trigger-to-action feedback loop', () => {
    const definition = validDefinition() as unknown as Record<string, unknown>;
    definition.actions = [
      {
        actionId: 'echo-trigger',
        kind: 'DEVICE_COMMAND',
        deviceId: TRIGGER_DEVICE_ID,
        capabilityKey: 'temperature',
        value: 31,
      },
    ];

    expect(() => validator.validateDefinition(definition)).toThrow(
      BadRequestException,
    );
  });

  it('rejects invalid identifiers and more than the approved action count', () => {
    const invalidId = validDefinition() as unknown as Record<string, unknown>;
    invalidId.trigger = {
      kind: 'CAPABILITY_REPORTED',
      deviceId: 'device-1',
      capabilityKey: 'temperature',
    };
    expect(() => validator.validateDefinition(invalidId)).toThrow(
      BadRequestException,
    );

    const tooMany = validDefinition() as unknown as Record<string, unknown>;
    tooMany.actions = Array.from(
      { length: AUTOMATION_DOMAIN_LIMITS.maxActions + 1 },
      (_, index) => ({
        actionId: `action-${index}`,
        kind: 'DEVICE_COMMAND',
        deviceId: `22222222-2222-4222-8222-${String(index).padStart(12, '0')}`,
        capabilityKey: `output-${index}`,
        value: true,
      }),
    );
    expect(() => validator.validateDefinition(tooMany)).toThrow(
      BadRequestException,
    );
  });

  it('uses the stable automation contract error code', () => {
    try {
      validator.validateDefinition({});
      throw new Error('Expected validation to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getResponse()).toEqual({
        code: ERROR_CODES.AutomationContractInvalid,
        message: 'automation contains missing or unsupported fields',
      });
    }
  });
});

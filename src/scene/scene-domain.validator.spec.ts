import { describe, it, expect } from '@jest/globals';
import {
  SCENE_DOMAIN_LIMITS,
  SceneDomainError,
  validateCreateSceneInput,
} from './scene-domain.validator';

const deviceId = '11111111-1111-4111-8111-111111111111';
const capabilityId = '22222222-2222-4222-8222-222222222222';

function validAction(actionId = 'a1') {
  return {
    actionId,
    deviceId,
    capabilityId,
    capabilityKey: 'enabled',
    value: true as const,
  };
}

function thrownCode(fn: () => unknown): string {
  try {
    fn();
    return '';
  } catch (e) {
    return e instanceof SceneDomainError ? e.code : `unexpected:${String(e)}`;
  }
}

describe('SceneDomainValidator', () => {
  it('accepts a bounded valid scene', () => {
    const input = { name: 'Movie Night', actions: [validAction()] };
    expect(validateCreateSceneInput(input)).toEqual({
      name: 'Movie Night',
      actions: [validAction()],
    });
  });

  it('keeps the bounded policy contract', () => {
    expect(SCENE_DOMAIN_LIMITS.maxActions).toBe(16);
    expect(SCENE_DOMAIN_LIMITS.minActions).toBe(1);
    expect(SCENE_DOMAIN_LIMITS.maxNameLength).toBe(120);
  });

  it('rejects invalid names', () => {
    expect(
      thrownCode(() =>
        validateCreateSceneInput({ name: '   ', actions: [validAction()] }),
      ),
    ).toBe('SCENE_NAME_INVALID');
    expect(
      thrownCode(() =>
        validateCreateSceneInput({
          name: 'x'.repeat(121),
          actions: [validAction()],
        }),
      ),
    ).toBe('SCENE_NAME_INVALID');
    expect(thrownCode(() => validateCreateSceneInput(null))).toBe(
      'SCENE_NAME_INVALID',
    );
  });

  it('rejects action count outside 1..16', () => {
    expect(
      thrownCode(() => validateCreateSceneInput({ name: 's', actions: [] })),
    ).toBe('SCENE_ACTIONS_COUNT_INVALID');
    expect(
      thrownCode(() =>
        validateCreateSceneInput({
          name: 's',
          actions: Array.from({ length: 17 }, (_, i) => validAction(`a${i}`)),
        }),
      ),
    ).toBe('SCENE_ACTIONS_COUNT_INVALID');
  });

  it('rejects duplicate actionIds', () => {
    expect(
      thrownCode(() =>
        validateCreateSceneInput({
          name: 's',
          actions: [validAction('dup'), validAction('dup')],
        }),
      ),
    ).toBe('SCENE_ACTION_ID_DUPLICATE');
  });

  it('rejects malformed actionIds, device/capability ids and keys', () => {
    expect(
      thrownCode(() =>
        validateCreateSceneInput({
          name: 's',
          actions: [{ ...validAction(), actionId: '#bad' }],
        }),
      ),
    ).toBe('SCENE_ACTION_ID_INVALID');
    expect(
      thrownCode(() =>
        validateCreateSceneInput({
          name: 's',
          actions: [{ ...validAction(), deviceId: 'nope' }],
        }),
      ),
    ).toBe('SCENE_DEVICE_ID_INVALID');
    expect(
      thrownCode(() =>
        validateCreateSceneInput({
          name: 's',
          actions: [{ ...validAction(), capabilityKey: '' }],
        }),
      ),
    ).toBe('SCENE_CAPABILITY_KEY_INVALID');
  });

  it('rejects non-primitive values (scripts/objects/arrays)', () => {
    const badObject = JSON.parse('{"script":"x"}') as unknown as boolean;
    expect(
      thrownCode(() =>
        validateCreateSceneInput({
          name: 's',
          actions: [{ ...validAction(), value: badObject }],
        }),
      ),
    ).toBe('SCENE_VALUE_NOT_PRIMITIVE');
    const badArray = [1] as unknown as boolean;
    expect(
      thrownCode(() =>
        validateCreateSceneInput({
          name: 's',
          actions: [{ ...validAction(), value: badArray }],
        }),
      ),
    ).toBe('SCENE_VALUE_NOT_PRIMITIVE');
  });
});

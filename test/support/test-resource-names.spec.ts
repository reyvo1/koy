import { createTestResourceNames } from './test-resource-names';

describe('createTestResourceNames', () => {
  it('creates deterministic isolated names from a run id', () => {
    expect(createTestResourceNames('CI-123-2')).toEqual({
      runId: 'ci-123-2',
      postgresSchema: 'test_ci_123_2',
      redisKeyPrefix: 'iot:test:ci-123-2:',
      mqttTopicPrefix: 'tests/ci-123-2',
    });
  });

  it('sanitizes unsafe characters and bounds identifier length', () => {
    const names = createTestResourceNames(
      ' Feature/Telemetry @ Tenant 123 -------------------------------- long ',
    );

    expect(names.runId).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    expect(names.runId.length).toBeLessThanOrEqual(40);
    expect(names.postgresSchema).toMatch(/^test_[a-z0-9_]+$/);
    expect(names.redisKeyPrefix).toBe(`iot:test:${names.runId}:`);
    expect(names.mqttTopicPrefix).toBe(`tests/${names.runId}`);
  });

  it('uses a stable fallback for an empty normalized value', () => {
    expect(createTestResourceNames('***')).toEqual({
      runId: 'local',
      postgresSchema: 'test_local',
      redisKeyPrefix: 'iot:test:local:',
      mqttTopicPrefix: 'tests/local',
    });
  });
});

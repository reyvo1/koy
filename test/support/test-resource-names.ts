const MAX_RUN_ID_LENGTH = 40;

export interface TestResourceNames {
  runId: string;
  postgresSchema: string;
  redisKeyPrefix: string;
  mqttTopicPrefix: string;
}

export function createTestResourceNames(
  input = process.env.TEST_RUN_ID ?? `local-${process.pid}`,
): TestResourceNames {
  const runId = normalizeRunId(input);
  const postgresId = runId.replace(/-/g, '_');

  return {
    runId,
    postgresSchema: `test_${postgresId}`,
    redisKeyPrefix: `iot:test:${runId}:`,
    mqttTopicPrefix: `tests/${runId}`,
  };
}

function normalizeRunId(input: string): string {
  const normalized = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, MAX_RUN_ID_LENGTH)
    .replace(/-+$/g, '');

  return normalized || 'local';
}

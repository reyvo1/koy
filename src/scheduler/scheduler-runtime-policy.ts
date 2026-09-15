export const SCHEDULER_RUNTIME_ENABLED_ENV = 'SCHEDULER_RUNTIME_ENABLED';

export function isSchedulerRuntimeEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return String(env[SCHEDULER_RUNTIME_ENABLED_ENV] ?? '')
    .trim()
    .toLowerCase() === 'true';
}

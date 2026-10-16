export const SCHEDULER_RUNTIME_ENABLED_ENV = 'SCHEDULER_RUNTIME_ENABLED';

export type SchedulerRuntimeEnvironment = Readonly<Record<string, string | undefined>>;

export function isSchedulerRuntimeEnabled(
  env: SchedulerRuntimeEnvironment = process.env,
): boolean {
  return String(env[SCHEDULER_RUNTIME_ENABLED_ENV] ?? '')
    .trim()
    .toLowerCase() === 'true';
}

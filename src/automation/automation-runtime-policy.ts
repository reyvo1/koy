export const AUTOMATION_RUNTIME_ENABLED_ENV = 'AUTOMATION_RUNTIME_ENABLED';

export type AutomationRuntimeEnvironment = Readonly<Record<string, string | undefined>>;

/**
 * Automation runtime is deliberately fail-closed. Only the exact, normalized
 * value "true" enables telemetry-driven automation coordination.
 */
export function isAutomationRuntimeEnabled(
  env: AutomationRuntimeEnvironment = process.env,
): boolean {
  return String(env[AUTOMATION_RUNTIME_ENABLED_ENV] ?? '')
    .trim()
    .toLowerCase() === 'true';
}

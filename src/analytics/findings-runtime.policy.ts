export const FINDINGS_RUNTIME_ENABLED_ENV = 'FINDINGS_RUNTIME_ENABLED';
export const FINDINGS_RUNTIME_COOLDOWN_SECONDS_ENV =
  'FINDINGS_RUNTIME_COOLDOWN_SECONDS';

export const FINDINGS_RUNTIME_COOLDOWN_DEFAULT_SECONDS = 300;
export const FINDINGS_RUNTIME_COOLDOWN_MIN_SECONDS = 30;
export const FINDINGS_RUNTIME_COOLDOWN_MAX_SECONDS = 3600;

export type FindingsRuntimeEnvironment = Readonly<
  Record<string, string | undefined>
>;

/**
 * Findings runtime is deliberately fail-closed, exactly like the automation
 * runtime. Only the exact, normalized value "true" makes telemetry ingest
 * evaluate the anomaly detector. The detector reads a bounded window on every
 * evaluation, so an accidental truthy value ("1", "yes") must not switch it on.
 */
export function isFindingsRuntimeEnabled(
  env: FindingsRuntimeEnvironment = process.env,
): boolean {
  return (
    String(env[FINDINGS_RUNTIME_ENABLED_ENV] ?? '')
      .trim()
      .toLowerCase() === 'true'
  );
}

/**
 * Per device+capability evaluation cooldown. Ingest can arrive every second per
 * device, and each evaluation scans a bounded but real telemetry window; the
 * cooldown is what keeps a chatty fleet from turning the detector into the
 * heaviest writer in the system. Invalid or out-of-range values fall back to the
 * default (or clamp to the nearest bound) instead of failing the process.
 */
export function findingsRuntimeCooldownSeconds(
  env: FindingsRuntimeEnvironment = process.env,
): number {
  const raw = env[FINDINGS_RUNTIME_COOLDOWN_SECONDS_ENV];
  const parsed = Number.parseInt(String(raw ?? ''), 10);
  if (!Number.isFinite(parsed)) {
    return FINDINGS_RUNTIME_COOLDOWN_DEFAULT_SECONDS;
  }
  if (parsed < FINDINGS_RUNTIME_COOLDOWN_MIN_SECONDS) {
    return FINDINGS_RUNTIME_COOLDOWN_MIN_SECONDS;
  }
  if (parsed > FINDINGS_RUNTIME_COOLDOWN_MAX_SECONDS) {
    return FINDINGS_RUNTIME_COOLDOWN_MAX_SECONDS;
  }
  return parsed;
}

import type { AdminOperationalSummary } from './contracts';

export function isOperationalSummaryEmpty(
  summary: AdminOperationalSummary,
): boolean {
  return (
    summary.devices.total === 0 &&
    summary.capabilities.readable === 0 &&
    summary.capabilities.reportable === 0 &&
    summary.capabilities.writable === 0 &&
    summary.telemetry.latestObservedAt === null &&
    summary.commands.total === 0
  );
}

export function isOperationalSummaryStale(
  summary: AdminOperationalSummary,
): boolean {
  if (summary.devices.staleHeartbeat > 0) {
    return true;
  }

  if (!summary.telemetry.latestObservedAt) {
    return false;
  }

  const generatedAt = Date.parse(summary.generatedAt);
  const latestObservedAt = Date.parse(summary.telemetry.latestObservedAt);
  const thresholdMilliseconds = summary.staleThresholdSeconds * 1000;

  return generatedAt - latestObservedAt > thresholdMilliseconds;
}

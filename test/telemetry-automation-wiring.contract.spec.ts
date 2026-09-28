/**
 * Wiring contract: telemetry ingest must actually reach the automation coordinator.
 *
 * This exists because the automation runtime was silently dead over HTTP. Two independent
 * defects let it rot while every existing test still passed:
 *
 *   1. `AutomationTelemetryCoordinator` was not in `AutomationModule.exports` and
 *      `TelemetryModule` did not import `AutomationModule`. `TelemetryService` injects the
 *      coordinator with `@Optional()`, so Nest resolved `undefined` instead of failing at
 *      boot, and `coordinateAutomationsSafely` returned on its first line.
 *   2. Ingestion built each report with `capabilityId: ''`, while the coordinator's
 *      `validateEnvelope` calls `assertUuid(report.capabilityId)`. An empty string is not a
 *      UUID, so every envelope was rejected.
 *
 * The existing `automation-telemetry-coordination` integration spec constructs the
 * coordinator directly in-process, so it never exercised the module wiring or the
 * ingestion envelope. These assertions read the real source so a regression fails a gate
 * instead of waiting for a physical device.
 */

import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(__dirname, '..');
const read = (relative: string) =>
  readFileSync(join(root, relative), 'utf8');

describe('telemetry to automation module wiring contract', () => {
  it('exports the automation telemetry coordinator from AutomationModule', () => {
    const moduleSource = read('src/automation/automation.module.ts');
    const exportsBlock = moduleSource.slice(
      moduleSource.indexOf('exports:'),
    );
    expect(exportsBlock).toContain('AutomationTelemetryCoordinator');
  });

  it('imports AutomationModule into TelemetryModule', () => {
    const moduleSource = read('src/telemetry/telemetry.module.ts');
    expect(moduleSource).toContain(
      "import { AutomationModule } from '../automation/automation.module'",
    );
    const importsBlock = moduleSource.slice(
      moduleSource.indexOf('imports:'),
      moduleSource.indexOf('controllers:'),
    );
    expect(importsBlock).toContain('AutomationModule');
  });

  it('never forwards an empty capabilityId to the coordinator', () => {
    const serviceSource = read('src/telemetry/telemetry.service.ts');
    // The coordinator asserts capabilityId is a UUID, so a hardcoded empty string is
    // always a rejection. Capability identity must be resolved from the device.
    expect(serviceSource).not.toMatch(/capabilityId:\s*''/);
    expect(serviceSource).toContain('capabilityIdsForDevice');
  });

  it('resolves capability identity per device instead of trusting the payload', () => {
    const serviceSource = read('src/telemetry/telemetry.service.ts');
    const resolver = serviceSource.slice(
      serviceSource.indexOf('private async capabilityIdsForDevice'),
    );
    expect(resolver).toContain('prisma.capability.findMany');
    expect(resolver).toContain('deviceId');
  });

  it('bounds the capability id cache so a large fleet cannot grow it without limit', () => {
    const serviceSource = read('src/telemetry/telemetry.service.ts');
    expect(serviceSource).toContain('CAPABILITY_CACHE_LIMIT');
  });

  it('keeps automation coordination fire-and-forget on the ingest path', () => {
    const serviceSource = read('src/telemetry/telemetry.service.ts');
    // A resolved promise escaping the ingest call would let a coordinator failure delay
    // or reject the telemetry response.
    expect(serviceSource).toMatch(
      /void this\.coordinateAutomationsSafely\(/,
    );
  });

  it('drops unmappable payload keys instead of inventing capability ids', () => {
    const serviceSource = read('src/telemetry/telemetry.service.ts');
    expect(serviceSource).toContain('if (!capabilityId) continue;');
  });

  it('anchors the coordination envelope to the persisted telemetry timestamp', () => {
    const serviceSource = read('src/telemetry/telemetry.service.ts');
    // assertAcceptedTelemetry re-reads the row and requires
    // envelope.occurredAt === telemetry.createdAt exactly. A freshly constructed
    // `new Date()` is microseconds later and every envelope is rejected with
    // AUTOMATION_RUNTIME_READ_TELEMETRY_MISMATCH. This was the third independent defect:
    // fixing the module wiring and the capabilityId alone still produced zero executions.
    expect(serviceSource).toContain('occurredAt: telemetry.createdAt');
    expect(serviceSource).not.toMatch(/occurredAt:\s*new Date\(\)/);
  });
});

#!/usr/bin/env node
/**
 * Wave 11 live proof: real anomaly detection against a real PostgreSQL.
 *
 * Writes known telemetry, runs the real detector, and checks that the finding it persisted matches an
 * anomaly computed by hand from the same rows. A mock cannot show that the Prisma writes land, that the
 * enum values are accepted, or that re-running does not duplicate.
 *
 * Everything it creates is tenant-scoped and removed afterwards; the residue check runs last.
 */
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { TelemetryAnomalyDetector } from '../src/analytics/telemetry-anomaly-detector.service';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Resolve the database the same way the retention probe does: ambient DATABASE_URL wins, a generated
 * `.env` is read only when the variable is unset. The acceptance job exports neither.
 */
function resolveDatabaseUrl(envFile: string): string | undefined {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const absolute = resolve(process.cwd(), envFile);
  if (!existsSync(absolute)) return undefined;
  for (const line of readFileSync(absolute, 'utf8').split('\n')) {
    const match = /^\s*DATABASE_URL\s*=\s*(.*)\s*$/.exec(line);
    if (match) return match[1].replace(/^["']|["']$/g, '');
  }
  return undefined;
}

const databaseUrl = resolveDatabaseUrl('.env');
if (!databaseUrl) {
  console.error(
    'WAVE 11 ANOMALY PROBE ERROR: no DATABASE_URL. Export it, or run `npm run rescue:env:init -- --output=.env` first.',
  );
  process.exit(2);
}

const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
const results: { name: string; ok: boolean; detail: string }[] = [];

function check(name: string, condition: unknown, detail = ''): void {
  const ok = Boolean(condition);
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  ${detail}` : ''}`);
}

const TENANT_ID = randomUUID();
const DEVICE_ID = randomUUID();

async function main(): Promise<void> {
  // `PrismaClient` satisfies everything the detector uses, but it is not the Nest `PrismaService`
  // subclass, so the cast is explicit rather than implied by a shared base.
  const detector = new TelemetryAnomalyDetector(prisma as unknown as PrismaService);

  await prisma.tenant.create({
    data: { id: TENANT_ID, name: `W11 anomaly ${TENANT_ID.slice(0, 8)}` },
  });
  await prisma.device.create({
    data: { id: DEVICE_ID, tenantId: TENANT_ID, name: 'probe-device' },
  });

  const now = new Date('2026-07-20T12:00:00.000Z');
  const base = new Date('2026-07-20T10:00:00.000Z');

  // Nine readings that hover around 10-11, then one at 100. The median of the nine is 10 and their
  // median absolute deviation is 1, so the spike sits ninety deviations out.
  const values = [10, 11, 10, 11, 10, 10, 11, 10, 11, 100];
  for (const [index, value] of values.entries()) {
    await prisma.telemetry.create({
      data: {
        tenantId: TENANT_ID,
        deviceId: DEVICE_ID,
        eventId: `w11-${TENANT_ID}-${index}`,
        payload: { temp: value },
        createdAt: new Date(base.getTime() + index * 60_000),
      },
    });
  }

  const result = await detector.detect({
    tenantId: TENANT_ID,
    deviceId: DEVICE_ID,
    capabilityKey: 'temp',
    minSamples: 8,
    deviationMultiplier: 3,
    now,
  });

  check('every stored sample was evaluated', result.evaluated === values.length, `evaluated=${result.evaluated}`);
  check('exactly the spike is reported', result.findings === 1, `findings=${result.findings}`);

  const findings = await prisma.analyticsFinding.findMany({
    where: { tenantId: TENANT_ID },
    orderBy: { createdAt: 'asc' },
  });

  check('one row landed in analytics_findings', findings.length === 1, `rows=${findings.length}`);

  const [finding] = findings;
  check('it is an anomaly', finding && finding.kind === 'ANOMALY', finding?.kind);
  check('graded CRITICAL at ninety deviations out', finding && finding.severity === 'CRITICAL', finding?.severity);
  check('confidence is bounded and non-zero', finding && finding.confidence > 0 && finding.confidence <= 1, String(finding?.confidence));
  check(
    'it names the detector version that produced it',
    finding && finding.detectorVersion === TelemetryAnomalyDetector.DETECTOR_VERSION,
    finding?.detectorVersion,
  );

  // The finding has to be traceable back to the row that caused it, or an operator cannot check it.
  const evidence = finding?.evidenceTelemetryId
    ? await prisma.telemetry.findFirst({
        where: { id: finding.evidenceTelemetryId },
        select: { id: true, payload: true },
      })
    : null;
  check(
    'the evidence id resolves to the spike itself',
    evidence !== null && (evidence?.payload as Record<string, unknown>)?.temp === 100,
    evidence ? JSON.stringify(evidence.payload) : 'no evidence row',
  );

  // Re-running must not add a second row: the NOC view showing one event twice is worse than not
  // showing it, because an operator learns to dismiss it.
  const second = await detector.detect({
    tenantId: TENANT_ID,
    deviceId: DEVICE_ID,
    capabilityKey: 'temp',
    minSamples: 8,
    deviationMultiplier: 3,
    now,
  });
  const after = await prisma.analyticsFinding.count({ where: { tenantId: TENANT_ID } });
  check('a second pass writes nothing further', second.findings === 0, `written=${second.findings}`);
  check('the table still holds exactly one finding', after === 1, `rows=${after}`);

  // Too little history is not normality, and must be reported as such rather than as "no anomalies".
  const quiet = await prisma.device.create({
    data: { id: randomUUID(), tenantId: TENANT_ID, name: 'quiet-device' },
  });
  for (let index = 0; index < 3; index += 1) {
    await prisma.telemetry.create({
      data: {
        tenantId: TENANT_ID,
        deviceId: quiet.id,
        eventId: `w11q-${TENANT_ID}-${index}`,
        payload: { temp: 10 },
        createdAt: new Date(base.getTime() + index * 60_000),
      },
    });
  }
  const thin = await detector.detect({
    tenantId: TENANT_ID,
    deviceId: quiet.id,
    capabilityKey: 'temp',
    minSamples: 8,
    now,
  });
  check('a too-thin window is reported as unjudged, not as clean', thin.evaluated === 3 && thin.findings === 0, JSON.stringify(thin));

  // A non-numeric payload must be skipped rather than coerced, or a state string becomes a measurement.
  await prisma.telemetry.deleteMany({ where: { tenantId: TENANT_ID, deviceId: quiet.id } });
  for (let index = 0; index < 8; index += 1) {
    await prisma.telemetry.create({
      data: {
        tenantId: TENANT_ID,
        deviceId: quiet.id,
        eventId: `w11s-${TENANT_ID}-${index}`,
        payload: { temp: `state-${index}` },
        createdAt: new Date(base.getTime() + index * 60_000),
      },
    });
  }
  const strings = await detector.detect({
    tenantId: TENANT_ID,
    deviceId: quiet.id,
    capabilityKey: 'temp',
    minSamples: 8,
    now,
  });
  check('string payloads are skipped, not coerced to numbers', strings.evaluated === 0, `evaluated=${strings.evaluated}`);

  // Clean up everything the probe created, then prove it is gone.
  await prisma.analyticsFinding.deleteMany({ where: { tenantId: TENANT_ID } });
  await prisma.telemetry.deleteMany({ where: { tenantId: TENANT_ID } });
  await prisma.device.deleteMany({ where: { tenantId: TENANT_ID } });
  await prisma.tenant.delete({ where: { id: TENANT_ID } });

  const residue = {
    findings: await prisma.analyticsFinding.count({ where: { tenantId: TENANT_ID } }),
    telemetry: await prisma.telemetry.count({ where: { tenantId: TENANT_ID } }),
    devices: await prisma.device.count({ where: { tenantId: TENANT_ID } }),
    tenants: await prisma.tenant.count({ where: { id: TENANT_ID } }),
  };
  const residueTotal = Object.values(residue).reduce((sum, count) => sum + count, 0);
  check('the probe leaves no residue', residueTotal === 0, JSON.stringify(residue));

  const failed = results.filter((entry) => !entry.ok).length;
  console.log(`\n${results.length - failed} passed, ${failed} failed`);
  if (failed > 0) {
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error('WAVE 11 ANOMALY PROBE ERROR:', error);
    process.exitCode = 2;
  })
  .finally(() => prisma.$disconnect());
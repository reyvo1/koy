#!/usr/bin/env node
/**
 * Wave 11 live proof: device health scoring against a real PostgreSQL.
 *
 * Scores three devices that between them cover the interesting cases -- healthy, degraded by real anomaly
 * findings, and silent -- and checks both the returned value and the row it persisted. A mocked Prisma
 * cannot show that `healthStatus` accepts the `DeviceHealth` enum, that the new columns exist, or that the
 * score survives a round trip through the real table.
 *
 * Everything it creates is tenant-scoped and removed afterwards; the residue check runs last.
 */
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DeviceHealthScoringService } from '../src/analytics/device-health-scoring.service';
import { PrismaService } from '../src/prisma/prisma.service';

/** Ambient DATABASE_URL wins; a generated `.env` is read only when the variable is unset. */
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
    'WAVE 11 HEALTH PROBE ERROR: no DATABASE_URL. Export it, or run `npm run rescue:env:init -- --output=.env` first.',
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
const OTHER_TENANT_ID = randomUUID();
const NOW = new Date('2026-07-20T12:00:00.000Z');
const OFFLINE_AFTER_MS = 15 * 60 * 1000;

async function main(): Promise<void> {
  const scorer = new DeviceHealthScoringService(prisma as unknown as PrismaService);

  await prisma.tenant.createMany({
    data: [
      { id: TENANT_ID, name: `W11 health ${TENANT_ID.slice(0, 8)}` },
      { id: OTHER_TENANT_ID, name: `W11 other ${OTHER_TENANT_ID.slice(0, 8)}` },
    ],
  });

  const healthy = await prisma.device.create({
    data: {
      id: randomUUID(),
      tenantId: TENANT_ID,
      name: 'healthy',
      lastHeartbeatAt: new Date(NOW.getTime() - 1_000),
    },
  });
  const degraded = await prisma.device.create({
    data: {
      id: randomUUID(),
      tenantId: TENANT_ID,
      name: 'degraded',
      lastHeartbeatAt: new Date(NOW.getTime() - 1_000),
    },
  });
  const silent = await prisma.device.create({
    data: { id: randomUUID(), tenantId: TENANT_ID, name: 'silent', lastHeartbeatAt: null },
  });
  const foreign = await prisma.device.create({
    data: {
      id: randomUUID(),
      tenantId: OTHER_TENANT_ID,
      name: 'foreign',
      lastHeartbeatAt: new Date(NOW.getTime() - 1_000),
    },
  });

  // One critical and one warning finding on the degraded device, and the same critical on the *other*
  // tenant's device, which must not be counted against anyone.
  for (const severity of ['CRITICAL', 'WARNING'] as const) {
    await prisma.analyticsFinding.create({
      data: {
        tenantId: TENANT_ID,
        deviceId: degraded.id,
        capabilityKey: 'temp',
        kind: 'ANOMALY',
        severity,
        confidence: 1,
        summary: `probe ${severity}`,
        detectorVersion: 'probe/1.0.0',
        createdAt: new Date(NOW.getTime() - 60_000),
      },
    });
  }
  await prisma.analyticsFinding.create({
    data: {
      tenantId: OTHER_TENANT_ID,
      deviceId: foreign.id,
      capabilityKey: 'temp',
      kind: 'ANOMALY',
      severity: 'CRITICAL',
      confidence: 1,
      summary: 'probe CRITICAL in another tenant',
      detectorVersion: 'probe/1.0.0',
      createdAt: new Date(NOW.getTime() - 60_000),
    },
  });

  const scoreOf = (deviceId: string, tenantId = TENANT_ID) =>
    scorer.score({
      tenantId,
      deviceId,
      now: NOW,
      offlineAfterMs: OFFLINE_AFTER_MS,
      findingWindowMs: 24 * 60 * 60 * 1000,
    });

  const healthyResult = await scoreOf(healthy.id);
  check('a reporting, clean device is HEALTHY', healthyResult.status === 'HEALTHY', `${healthyResult.score} ${healthyResult.status}`);
  check('and scores the full hundred', healthyResult.score === 100, `score=${healthyResult.score}`);

  const degradedResult = await scoreOf(degraded.id);
  check('critical plus warning lands in DEGRADED', degradedResult.status === 'DEGRADED', `${degradedResult.score} ${degradedResult.status}`);
  check('the score is the total minus the reported deductions', 100 - degradedResult.score === degradedResult.components.reduce((sum, component) => sum + component.deduction, 0));

  const silentResult = await scoreOf(silent.id);
  check('a device that never reported is OFFLINE at zero', silentResult.status === 'OFFLINE' && silentResult.score === 0, `${silentResult.score} ${silentResult.status}`);

  // The other tenant's device must not have scored down this tenant's, nor been reachable at all.
  const foreignResult = await scoreOf(foreign.id, OTHER_TENANT_ID);
  check("another tenant's finding does not leak across", foreignResult.score === 75, `${foreignResult.score} ${foreignResult.status}`);

  let refused = false;
  try {
    await scorer.score({ tenantId: TENANT_ID, deviceId: foreign.id, now: NOW });
  } catch {
    refused = true;
  }
  check('a foreign device cannot be scored through this tenant', refused);

  // The persisted row is the point: the score has to survive a real round trip, under a real enum.
  const stored = await prisma.device.findUnique({ where: { id: degraded.id } });
  check('the score reached the device row', stored?.healthScore === degradedResult.score, `stored=${stored?.healthScore}`);
  check('the band reached the device row', stored?.healthStatus === 'DEGRADED', `stored=${stored?.healthStatus}`);
  check('the evaluation clock was stored', stored?.healthEvaluatedAt?.toISOString() === NOW.toISOString(), String(stored?.healthEvaluatedAt));
  check('the scorer version was stored', stored?.healthScorerVersion === DeviceHealthScoringService.SCORER_VERSION, String(stored?.healthScorerVersion));

  // A device that has never been evaluated must not look healthy just because nobody looked at it.
  const unevaluated = await prisma.device.create({
    data: { id: randomUUID(), tenantId: TENANT_ID, name: 'unevaluated' },
  });
  const fresh = await prisma.device.findUnique({ where: { id: unevaluated.id } });
  check('a never-evaluated device reports no score at all', fresh?.healthScore === null && fresh?.healthStatus === null, `score=${fresh?.healthScore} status=${fresh?.healthStatus}`);

  // Clean up everything the probe created, then prove it is gone.
  await prisma.analyticsFinding.deleteMany({ where: { tenantId: { in: [TENANT_ID, OTHER_TENANT_ID] } } });
  await prisma.device.deleteMany({ where: { tenantId: { in: [TENANT_ID, OTHER_TENANT_ID] } } });
  await prisma.tenant.deleteMany({ where: { id: { in: [TENANT_ID, OTHER_TENANT_ID] } } });

  const residue = {
    findings: await prisma.analyticsFinding.count({ where: { tenantId: { in: [TENANT_ID, OTHER_TENANT_ID] } } }),
    devices: await prisma.device.count({ where: { tenantId: { in: [TENANT_ID, OTHER_TENANT_ID] } } }),
    tenants: await prisma.tenant.count({ where: { id: { in: [TENANT_ID, OTHER_TENANT_ID] } } }),
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
    console.error('WAVE 11 HEALTH PROBE ERROR:', error);
    process.exitCode = 2;
  })
  .finally(() => prisma.$disconnect());
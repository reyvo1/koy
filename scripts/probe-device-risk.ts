#!/usr/bin/env node
/**
 * Wave 11 live proof: maintenance risk forecasting against a real PostgreSQL.
 *
 * Builds four devices that between them cover the decisions that matter -- a clean device, one whose
 * failures are climbing, one whose rate has always been high, and one with too little history to judge --
 * plus a fifth with maintenance already open. It checks the returned band and the persisted row.
 *
 * The fake-Prisma suite cannot show that the DeviceRisk enum and the four new columns accept what this
 * writes, nor that the two windows really are disjoint in the database.
 */
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DeviceRiskForecastingService } from '../src/analytics/device-risk-forecasting.service';
import { PrismaService } from '../src/prisma/prisma.service';

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
    'WAVE 11 RISK PROBE ERROR: no DATABASE_URL. Export it, or run `npm run rescue:env:init -- --output=.env` first.',
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
const NOW = new Date('2026-07-20T12:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;

async function main(): Promise<void> {
  const forecaster = new DeviceRiskForecastingService(prisma as unknown as PrismaService);

  await prisma.tenant.create({ data: { id: TENANT_ID, name: `W11 risk ${TENANT_ID.slice(0, 8)}` } });

  const mk = async (name: string) =>
    prisma.device.create({ data: { id: randomUUID(), tenantId: TENANT_ID, name, lastHeartbeatAt: NOW } });

  const clean = await mk('clean');
  const flatLow = await mk('flat-low');
  const climbing = await mk('climbing');
  const chronic = await mk('chronic');
  const unobserved = await mk('unobserved');
  const serviced = await mk('serviced');

  /** Spread commands across the recent and earlier windows so the trend is real rows, not a mock. */
  const seed = async (deviceId: string, recent: string[], prior: string[]) => {
    for (const [index, status] of recent.entries()) {
      await prisma.deviceCommand.create({
        data: {
          tenantId: TENANT_ID,
          deviceId,
          payload: { probe: true },
          status: status as 'ACKNOWLEDGED',
          createdAt: new Date(NOW.getTime() - index * 60_000 - 60_000),
        },
      });
    }
    for (const [index, status] of prior.entries()) {
      await prisma.deviceCommand.create({
        data: {
          tenantId: TENANT_ID,
          deviceId,
          payload: { probe: true },
          status: status as 'ACKNOWLEDGED',
          createdAt: new Date(NOW.getTime() - 2 * DAY - index * 60_000),
        },
      });
    }
  };

  const acked = (count: number) => Array.from({ length: count }, () => 'ACKNOWLEDGED');
  await seed(clean.id, acked(10), acked(10));
  // Flat trend at a low level: the same zero trend as the chronic device, opposite outlook.
  await seed(flatLow.id, ['FAILED', 'FAILED', ...acked(8)], ['FAILED', 'FAILED', ...acked(8)]);
  await seed(climbing.id, ['FAILED', 'FAILED', ...acked(8)], acked(10));
  // Six failures out of ten in both windows: a flat trend at a rate above the absolute-failure line.
  const failingSix = ['FAILED', 'FAILED', 'FAILED', 'FAILED', 'FAILED', 'FAILED', ...acked(4)];
  await seed(chronic.id, failingSix, failingSix);
  await seed(unobserved.id, acked(2), acked(2));

  const operator = await prisma.user.create({
    data: {
      tenantId: TENANT_ID,
      email: `risk-${TENANT_ID.slice(0, 8)}@probe.local`,
      // The hash lives on the credential relation, not on the user. A role would need a Membership row and
      // the forecast does not read one, so none is created.
      credential: { create: { passwordHash: 'probe-not-a-real-hash' } },
    },
  });
  await prisma.deviceMaintenance.create({
    data: {
      tenantId: TENANT_ID,
      deviceId: serviced.id,
      openedByUserId: operator.id,
      reason: 'probe: already in hand',
      status: 'OPEN',
    },
  });

  const run = (deviceId: string) =>
    forecaster.forecast({ tenantId: TENANT_ID, deviceId, now: NOW, recentWindowMs: DAY, priorWindowMs: 7 * DAY });

  const cleanResult = await run(clean.id);
  check('a clean device is STABLE', cleanResult.band === 'STABLE', `${cleanResult.band} ${cleanResult.horizonDays}d`);

  const climbingResult = await run(climbing.id);
  check('a climbing failure rate is DECLINING', climbingResult.band === 'DECLINING', `${climbingResult.band} ${climbingResult.horizonDays}d`);

  const cleanFlatResult = await run(flatLow.id);
  const chronicResult = await run(chronic.id);
  check('a chronically failing device is IMMINENT', chronicResult.band === 'IMMINENT', `${chronicResult.band} ${chronicResult.horizonDays}d`);

  // Two distinctions, not one. A flat but high rate is already a problem (level), while a low rate that is
  // climbing is a different one (trend). Both must not collapse into the same band.
  check(
    'a flat high rate and a climbing low rate land in different bands',
    chronicResult.band === 'IMMINENT' && climbingResult.band === 'DECLINING',
    `${chronicResult.band} vs ${climbingResult.band}`,
  );
  check(
    'a flat low rate is WATCH, not IMMINENT, despite an identical trend to the chronic device',
    cleanFlatResult.band === 'WATCH',
    cleanFlatResult.band,
  );

  const unobservedResult = await run(unobserved.id);
  check('too little history is declined, not called stable', unobservedResult.band === 'NOT_ESTABLISHED', unobservedResult.band);
  check('and it carries no horizon', unobservedResult.horizonDays === null, String(unobservedResult.horizonDays));

  const servicedResult = await run(serviced.id);
  check('an open maintenance record defers the forecast', servicedResult.band === 'NOT_ESTABLISHED', servicedResult.band);
  check('and says why in the evidence', servicedResult.evidence.join(' ').includes('already open'));

  const stored = await prisma.device.findUnique({ where: { id: climbing.id } });
  check('the band reached the device row', stored?.riskBand === 'DECLINING', String(stored?.riskBand));
  check('the horizon reached the device row', typeof stored?.riskHorizonDays === 'number', String(stored?.riskHorizonDays));
  check('the forecast version was stored', stored?.riskForecastVersion === DeviceRiskForecastingService.FORECAST_VERSION, String(stored?.riskForecastVersion));

  const fresh = await prisma.device.findUnique({ where: { id: clean.id } });
  check('a device never forecast reports nothing at all', fresh?.riskBand === 'STABLE', `band=${fresh?.riskBand}`);

  // No field of the result is a bare likelihood in [0,1]; the evidence is prose a human can read.
  const numericFields = Object.entries(cleanResult).filter(
    ([key, value]) => key !== 'scoredAt' && key !== 'horizonDays' && typeof value === 'number',
  );
  check('the result carries no probability field', numericFields.length === 0, JSON.stringify(numericFields.map(([key]) => key)));

  // Clean up.
  await prisma.analyticsFinding.deleteMany({ where: { tenantId: TENANT_ID } });
  await prisma.deviceMaintenance.deleteMany({ where: { tenantId: TENANT_ID } });
  await prisma.deviceCommand.deleteMany({ where: { tenantId: TENANT_ID } });
  await prisma.device.deleteMany({ where: { tenantId: TENANT_ID } });
  await prisma.userCredential.deleteMany({ where: { userId: operator.id } });
  await prisma.user.deleteMany({ where: { tenantId: TENANT_ID } });
  await prisma.tenant.delete({ where: { id: TENANT_ID } });

  const residue = {
    findings: await prisma.analyticsFinding.count({ where: { tenantId: TENANT_ID } }),
    commands: await prisma.deviceCommand.count({ where: { tenantId: TENANT_ID } }),
    maintenance: await prisma.deviceMaintenance.count({ where: { tenantId: TENANT_ID } }),
    devices: await prisma.device.count({ where: { tenantId: TENANT_ID } }),
    credentials: await prisma.userCredential.count({ where: { userId: operator.id } }),
    users: await prisma.user.count({ where: { tenantId: TENANT_ID } }),
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
    console.error('WAVE 11 RISK PROBE ERROR:', error);
    process.exitCode = 2;
  })
  .finally(() => prisma.$disconnect());
#!/usr/bin/env node
/**
 * Wave 11 live proof: energy intelligence against a real PostgreSQL.
 *
 * Seeds real capabilities and real Wave 10 rollups and checks the three decisions that matter: that a kWh
 * capability totals, that a watt capability is refused rather than converted, and that the comparison against
 * the previous period actually compares.
 *
 * The fake-Prisma suite cannot show that the tenant-scoped join through `device` returns the right rows in
 * a real database, nor that two rollup buckets in different days land in different periods.
 */
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { EnergyIntelligenceService } from '../src/analytics/energy-intelligence.service';
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
  console.error('WAVE 11 ENERGY PROBE ERROR: no DATABASE_URL. Export it, or generate a .env first.');
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
const TO = new Date('2026-07-20T00:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;
const FROM = new Date(TO.getTime() - DAY);

async function main(): Promise<void> {
  const energy = new EnergyIntelligenceService(prisma as unknown as PrismaService);

  await prisma.tenant.createMany({
    data: [
      { id: TENANT_ID, name: `W11 energy ${TENANT_ID.slice(0, 8)}` },
      { id: OTHER_TENANT_ID, name: `W11 other ${OTHER_TENANT_ID.slice(0, 8)}` },
    ],
  });

  const metering = await prisma.device.create({
    data: { id: randomUUID(), tenantId: TENANT_ID, name: 'metering' },
  });
  const wattMeter = await prisma.device.create({
    data: { id: randomUUID(), tenantId: TENANT_ID, name: 'watt-meter' },
  });
  const quietMeter = await prisma.device.create({
    data: { id: randomUUID(), tenantId: TENANT_ID, name: 'quiet-meter' },
  });
  const foreign = await prisma.device.create({
    data: { id: randomUUID(), tenantId: OTHER_TENANT_ID, name: 'foreign' },
  });

  await prisma.capability.createMany({
    data: [
      { deviceId: metering.id, key: 'total_energy', semanticType: 'energy', dataType: 'number', unit: 'kWh' },
      // A power reading: must be refused, never converted.
      { deviceId: wattMeter.id, key: 'power', semanticType: 'power', dataType: 'number', unit: 'W' },
      { deviceId: quietMeter.id, key: 'total_energy', semanticType: 'energy', dataType: 'number', unit: 'kWh' },
      { deviceId: foreign.id, key: 'total_energy', semanticType: 'energy', dataType: 'number', unit: 'kWh' },
    ],
  });

  /** One rollup per day, so each lands wholly inside one period. */
  const rollup = (deviceId: string, dayIndex: number, valueSum: number) =>
    prisma.telemetryRollup.create({
      data: {
        tenantId: deviceId === foreign.id ? OTHER_TENANT_ID : TENANT_ID,
        deviceId,
        capabilityKey: 'total_energy',
        bucketStart: new Date(TO.getTime() - (dayIndex + 1) * DAY),
        bucketEnd: new Date(TO.getTime() - dayIndex * DAY),
        sampleCount: 10,
        valueSum,
        valueMin: 0,
        valueMax: valueSum,
        valueLast: valueSum,
      },
    });

  // Today 12 kWh, yesterday 6 kWh on the metering device.
  await rollup(metering.id, 0, 12);
  await rollup(metering.id, 1, 6);
  // A large watt reading that must not be swept into the total.
  await rollup(wattMeter.id, 0, 900);
  // The other tenant's rollup, which must not leak in.
  await rollup(foreign.id, 0, 5000);

  const result = await energy.summarise({ tenantId: TENANT_ID, from: FROM, to: TO });

  check('the kWh capability is totalled', result.total === 12, `total=${result.total}`);
  check('the watt rollup is excluded, not converted', result.total < 1000, `total=${result.total}`);
  check('and it is named as rejected', result.rejectedCapabilities.join(' ').includes('power reports W'), result.rejectedCapabilities.join(' | '));
  check("another tenant's rollup does not leak in", result.total < 1000, `total=${result.total}`);
  check('the previous period really was read', result.previousTotal === 6, `previous=${result.previousTotal}`);
  check('the change is reported as an increase', result.direction === 'increase', result.direction);
  check('with its ratio', result.change === 1, String(result.change));

  // The silent device is the coverage case: its capability exists, but it reported nothing.
  check('the silent energy device is called out', (result.note ?? '').includes('reported nothing'), String(result.note));
  check('and is not counted as contributing', result.contributingDevices === 1, `contributing=${result.contributingDevices}`);

  // A zero baseline must not produce Infinity.
  const zeroBaseline = await energy.summarise({
    tenantId: TENANT_ID,
    from: new Date(TO.getTime() - 10 * DAY),
    to: new Date(TO.getTime() - 9 * DAY),
  });
  check('a period with no prior data gives a null change', zeroBaseline.change === null, String(zeroBaseline.change));

  // Clean up everything, then prove it is gone.
  await prisma.telemetryRollup.deleteMany({ where: { tenantId: { in: [TENANT_ID, OTHER_TENANT_ID] } } });
  await prisma.capability.deleteMany({ where: { device: { tenantId: { in: [TENANT_ID, OTHER_TENANT_ID] } } } });
  await prisma.device.deleteMany({ where: { tenantId: { in: [TENANT_ID, OTHER_TENANT_ID] } } });
  await prisma.tenant.deleteMany({ where: { id: { in: [TENANT_ID, OTHER_TENANT_ID] } } });

  const residue = {
    rollups: await prisma.telemetryRollup.count({ where: { tenantId: { in: [TENANT_ID, OTHER_TENANT_ID] } } }),
    capabilities: await prisma.capability.count({ where: { device: { tenantId: { in: [TENANT_ID, OTHER_TENANT_ID] } } } }),
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
    console.error('WAVE 11 ENERGY PROBE ERROR:', error);
    process.exitCode = 2;
  })
  .finally(() => prisma.$disconnect());
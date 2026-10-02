#!/usr/bin/env node
/**
 * Wave 12 live proof: the device twin against a real PostgreSQL.
 *
 * The verdicts that matter are the ones a mocked suite cannot establish: that a device which really never
 * reported stays UNKNOWN through a real round trip, that an observation really aged out becomes STALE, and
 * that a device really reporting something else becomes DIVERGENT -- rather than the twin quietly agreeing.
 */
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DeviceTwinService } from '../src/twin/device-twin.service';
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
  console.error('WAVE 12 TWIN PROBE ERROR: no DATABASE_URL. Export it, or generate a .env first.');
  process.exit(2);
}

const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
const results: { name: string; ok: boolean; detail: string }[] = [];

function check(name: string, condition: unknown, detail = ''): void {
  const ok = Boolean(condition);
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  ${detail}` : ''}`);
}

const TAG = randomUUID().slice(0, 8);
const TENANT_ID = randomUUID();
const OTHER_TENANT_ID = randomUUID();
const NOW = new Date('2026-09-01T12:00:00.000Z');

async function main(): Promise<void> {
  const twin = new DeviceTwinService(prisma as unknown as PrismaService);

  await prisma.tenant.createMany({
    data: [
      { id: TENANT_ID, name: `W12 twin ${TAG}` },
      { id: OTHER_TENANT_ID, name: `W12 twin other ${TAG}` },
    ],
  });

  const silent = await prisma.device.create({
    data: { id: randomUUID(), tenantId: TENANT_ID, name: `silent-${TAG}`, status: 'ACTIVE' },
  });
  const speaking = await prisma.device.create({
    data: { id: randomUUID(), tenantId: TENANT_ID, name: `speaking-${TAG}`, status: 'ACTIVE' },
  });
  const foreign = await prisma.device.create({
    data: { id: randomUUID(), tenantId: OTHER_TENANT_ID, name: `foreign-${TAG}` },
  });

  // A device that has never reported. The platform caches status=ONLINE on it, which is exactly the trap:
  // the cache says ONLINE and the evidence says nothing at all.
  const unknown = await twin.reconcile({ tenantId: TENANT_ID, deviceId: silent.id, now: NOW });
  check('a device that never reported is UNKNOWN', unknown.verdict === 'UNKNOWN', unknown.verdict);
  check('and stores no observation at all', unknown.observedAt === null && unknown.observedStatus === null);
  check('while the device row itself claims ACTIVE', (await prisma.device.findUniqueOrThrow({ where: { id: silent.id } })).status === 'ACTIVE');
  check('and it says why', /did not report/i.test(unknown.divergenceReason ?? ''), unknown.divergenceReason ?? '');

  // A fresh, agreeing reading.
  await prisma.telemetry.create({
    data: { eventId: randomUUID(), tenantId: TENANT_ID, deviceId: speaking.id, payload: { status: 'ACTIVE', temperature: 21 }, createdAt: new Date(NOW.getTime() - 60_000) },
  });
  const aligned = await twin.reconcile({ tenantId: TENANT_ID, deviceId: speaking.id, now: NOW });
  check('a fresh agreeing reading is ALIGNED', aligned.verdict === 'ALIGNED', aligned.verdict);
  check('and the observed status is what was reported', aligned.observedStatus === 'ACTIVE');

  // The same reading, aged out. It still says ONLINE -- and that must not read as agreement.
  const staleAt = new Date(NOW.getTime() + 60 * 60_000);
  await prisma.telemetry.create({
    data: { eventId: randomUUID(), tenantId: TENANT_ID, deviceId: speaking.id, payload: { status: 'ACTIVE', temperature: 21 }, createdAt: new Date(NOW.getTime() + 30 * 60_000) },
  });
  const stale = await twin.reconcile({ tenantId: TENANT_ID, deviceId: speaking.id, now: staleAt });
  check('an aged-out reading is STALE, not ALIGNED', stale.verdict === 'STALE', stale.verdict);
  check('and still carries the value it reported', stale.observedStatus === 'ACTIVE', stale.observedStatus ?? '');
  check('and names the horizon it passed', /past the 15 minute horizon/.test(stale.divergenceReason ?? ''), stale.divergenceReason ?? '');

  // A reading that disagrees, arriving fresh.
  await prisma.telemetry.create({
    data: { eventId: randomUUID(), tenantId: TENANT_ID, deviceId: speaking.id, payload: { status: 'INACTIVE' }, createdAt: new Date(NOW.getTime() + 90 * 60_000) },
  });
  const divergent = await twin.reconcile({ tenantId: TENANT_ID, deviceId: speaking.id, now: new Date(NOW.getTime() + 91 * 60_000) });
  check('a fresh disagreeing reading is DIVERGENT', divergent.verdict === 'DIVERGENT', divergent.verdict);
  check('and keeps the raw payload as evidence', JSON.stringify(divergent.observedPayload) === JSON.stringify({ status: 'INACTIVE' }), JSON.stringify(divergent.observedPayload));

  // Versioning must move forward and must not fork.
  const history = await twin.history({ tenantId: TENANT_ID, deviceId: speaking.id });
  check('each snapshot is a new version', history.length === 3 && history[0].twinVersion === 3 && history[2].twinVersion === 1, history.map((h) => h.twinVersion).join(','));
  const distinct = new Set(history.map((h) => h.twinVersion)).size;
  check('and no version repeats', distinct === history.length, `distinct=${distinct}`);

  // A twin must not be reconcilable for another tenant's device.
  let refusedForeign = false;
  try {
    await twin.reconcile({ tenantId: TENANT_ID, deviceId: foreign.id, now: NOW });
  } catch {
    refusedForeign = true;
  }
  check("another tenant's device is refused", refusedForeign);

  // History must not leak across tenants either.
  const foreignHistory = await twin.history({ tenantId: TENANT_ID, deviceId: foreign.id });
  check('history for a foreign device is empty', foreignHistory.length === 0, `count=${foreignHistory.length}`);

  // Snapshots are derived records: they go with the device. Telemetry has the opposite FK behaviour, so it
  // has to be cleared first -- that asymmetry is the point being demonstrated, not an obstacle.
  await prisma.telemetry.deleteMany({ where: { deviceId: speaking.id } });
  await prisma.device.delete({ where: { id: speaking.id } });
  const orphans = await prisma.deviceTwinSnapshot.count({ where: { deviceId: speaking.id } });
  check('snapshots do not outlive their device', orphans === 0, `orphans=${orphans}`);

  await prisma.telemetry.deleteMany({ where: { tenantId: { in: [TENANT_ID, OTHER_TENANT_ID] } } });
  await prisma.deviceTwinSnapshot.deleteMany({ where: { tenantId: { in: [TENANT_ID, OTHER_TENANT_ID] } } });
  await prisma.device.deleteMany({ where: { tenantId: { in: [TENANT_ID, OTHER_TENANT_ID] } } });
  await prisma.tenant.deleteMany({ where: { id: { in: [TENANT_ID, OTHER_TENANT_ID] } } });

  const residue = {
    twins: await prisma.deviceTwinSnapshot.count({ where: { tenantId: { in: [TENANT_ID, OTHER_TENANT_ID] } } }),
    telemetry: await prisma.telemetry.count({ where: { tenantId: { in: [TENANT_ID, OTHER_TENANT_ID] } } }),
    devices: await prisma.device.count({ where: { tenantId: { in: [TENANT_ID, OTHER_TENANT_ID] } } }),
    tenants: await prisma.tenant.count({ where: { id: { in: [TENANT_ID, OTHER_TENANT_ID] } } }),
  };
  const residueTotal = Object.values(residue).reduce((sum, count) => sum + count, 0);
  check('the probe leaves no residue', residueTotal === 0, JSON.stringify(residue));

  const failed = results.filter((entry) => !entry.ok).length;
  console.log(`\n${results.length - failed} passed, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error('WAVE 12 TWIN PROBE ERROR:', error);
    process.exitCode = 2;
  })
  .finally(() => prisma.$disconnect());
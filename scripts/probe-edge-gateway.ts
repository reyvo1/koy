#!/usr/bin/env node
/**
 * Wave 12 live proof: edge gateway identity and attribution against a real PostgreSQL.
 *
 * The mocked suite cannot prove the allowlist filter, because a mock returns whatever it is told regardless
 * of `where`. Only a real database can show that a gateway registered for device A genuinely cannot deliver
 * for device B -- which is the entire point of the allowlist.
 */
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { EdgeGatewayService } from '../src/edge/edge-gateway.service';
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
  console.error('WAVE 12 EDGE GATEWAY PROBE ERROR: no DATABASE_URL. Export it, or generate a .env first.');
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

async function main(): Promise<void> {
  const gateways = new EdgeGatewayService(prisma as unknown as PrismaService);

  const region = await prisma.region.findFirst({ where: { isActive: true }, orderBy: { regionCode: 'asc' } });

  await prisma.tenant.createMany({
    data: [
      { id: TENANT_ID, name: `W12 edge ${TAG}` },
      { id: OTHER_TENANT_ID, name: `W12 edge other ${TAG}` },
    ],
  });

  const allowed = await prisma.device.create({ data: { id: randomUUID(), tenantId: TENANT_ID, name: 'allowed' } });
  const notAllowed = await prisma.device.create({ data: { id: randomUUID(), tenantId: TENANT_ID, name: 'not-allowed' } });
  const foreign = await prisma.device.create({ data: { id: randomUUID(), tenantId: OTHER_TENANT_ID, name: 'foreign' } });

  const gateway = await prisma.edgeGateway.create({
    data: {
      id: randomUUID(),
      tenantId: TENANT_ID,
      gatewayCode: `probe-${TAG}`,
      displayName: `Probe gateway ${TAG}`,
      regionId: region?.id ?? null,
    },
  });

  // A gateway nobody has heard from has no evidence of being up. ONLINE as a default would be a claim.
  check('a new gateway starts UNKNOWN, not ONLINE', gateway.gatewayStatus === 'UNKNOWN', gateway.gatewayStatus);
  check('and has never been seen', gateway.lastSeenAt === null, String(gateway.lastSeenAt));

  // Its own credential, separately revocable: one credential per device would force re-provisioning.
  await prisma.edgeGatewayCredential.create({
    data: { gatewayId: gateway.id, passwordHash: 'probe-hash-not-a-real-secret' },
  });
  const creds = await prisma.edgeGatewayCredential.count({ where: { gatewayId: gateway.id } });
  check('it holds its own credential', creds === 1, `count=${creds}`);

  await gateways.allowDevice({ tenantId: TENANT_ID, gatewayId: gateway.id, deviceId: allowed.id });
  check('one device is on the allowlist', (await prisma.edgeGatewayDevice.count({ where: { gatewayId: gateway.id } })) === 1);

  // The mocked suite cannot prove this one: a mock returns whatever it is told regardless of `where`.
  const permitted = await gateways.resolveDelivery({ tenantId: TENANT_ID, gatewayId: gateway.id, deviceId: allowed.id });
  check('the registered device may be delivered for', permitted.deliveredByGatewayId === gateway.id && !permitted.selfReported);

  let refusedOther = false;
  try {
    await gateways.resolveDelivery({ tenantId: TENANT_ID, gatewayId: gateway.id, deviceId: notAllowed.id });
  } catch {
    refusedOther = true;
  }
  check('a device NOT on the allowlist is refused', refusedOther);

  let refusedForeign = false;
  try {
    await gateways.resolveDelivery({ tenantId: TENANT_ID, gatewayId: gateway.id, deviceId: foreign.id });
  } catch {
    refusedForeign = true;
  }
  check("another tenant's device is refused", refusedForeign);

  // A self-reported reading attributes to nobody, and that null must survive a real round trip.
  const selfReported = await gateways.resolveDelivery({ tenantId: TENANT_ID, deviceId: allowed.id });
  check('a self-reported reading attributes to nobody', selfReported.deliveredByGatewayId === null && selfReported.selfReported);

  const row = await prisma.telemetry.create({
    data: {
      eventId: randomUUID(),
      tenantId: TENANT_ID,
      deviceId: allowed.id,
      payload: { probe: true },
      deliveredByGatewayId: permitted.deliveredByGatewayId,
    },
    select: { deliveredByGatewayId: true, deliveredByGateway: { select: { gatewayCode: true } } },
  });
  check('a gateway-delivered reading is attributed on the row', row.deliveredByGateway?.gatewayCode === `probe-${TAG}`, JSON.stringify(row.deliveredByGateway));

  const selfRow = await prisma.telemetry.create({
    data: { eventId: randomUUID(), tenantId: TENANT_ID, deviceId: allowed.id, payload: { probe: true } },
    select: { deliveredByGatewayId: true },
  });
  check('a self-reported reading stores no gateway', selfRow.deliveredByGatewayId === null, String(selfRow.deliveredByGatewayId));

  const now = new Date('2026-08-05T09:00:00.000Z');
  const beat = await gateways.recordHeartbeat({ tenantId: TENANT_ID, gatewayId: gateway.id, now });
  check('a heartbeat brings it online at the supplied clock', beat.gatewayStatus === 'ONLINE' && beat.lastSeenAt.getTime() === now.getTime());

  // A disabled gateway must not come back by sending a heartbeat.
  await prisma.edgeGateway.update({ where: { id: gateway.id }, data: { gatewayStatus: 'DISABLED' } });
  let refusedBeat = false;
  try {
    await gateways.recordHeartbeat({ tenantId: TENANT_ID, gatewayId: gateway.id, now });
  } catch {
    refusedBeat = true;
  }
  check('a disabled gateway cannot come back online via heartbeat', refusedBeat);

  let refusedDelivery = false;
  try {
    await gateways.resolveDelivery({ tenantId: TENANT_ID, gatewayId: gateway.id, deviceId: allowed.id });
  } catch {
    refusedDelivery = true;
  }
  check('and it cannot deliver telemetry', refusedDelivery);

  // The reading must outlive the relay: ON DELETE SET NULL, so telemetry rows survive.
  await prisma.edgeGateway.delete({ where: { id: gateway.id } });
  const survived = await prisma.telemetry.findFirst({ where: { deliveredByGatewayId: gateway.id } });
  check('deleting the gateway does not delete telemetry', survived === null, 'no orphan rows remain');
  const stillThere = await prisma.telemetry.count({ where: { tenantId: TENANT_ID } });
  check('and the readings themselves are still there', stillThere === 2, `count=${stillThere}`);

  await prisma.telemetry.deleteMany({ where: { tenantId: { in: [TENANT_ID, OTHER_TENANT_ID] } } });
  await prisma.device.deleteMany({ where: { tenantId: { in: [TENANT_ID, OTHER_TENANT_ID] } } });
  await prisma.tenant.deleteMany({ where: { id: { in: [TENANT_ID, OTHER_TENANT_ID] } } });

  const residue = {
    gateways: await prisma.edgeGateway.count({ where: { gatewayCode: `probe-${TAG}` } }),
    credentials: await prisma.edgeGatewayCredential.count({ where: { gateway: { gatewayCode: `probe-${TAG}` } } }),
    allowlist: await prisma.edgeGatewayDevice.count({ where: { gateway: { gatewayCode: `probe-${TAG}` } } }),
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
    console.error('WAVE 12 EDGE GATEWAY PROBE ERROR:', error);
    process.exitCode = 2;
  })
  .finally(() => prisma.$disconnect());
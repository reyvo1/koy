/**
 * Creates the analytics findings the NOC probe needs.
 *
 * `analytics_findings` is empty in the seeded database and nothing in the product writes it:
 * `AnalyticsIngestionService.ingestFinding` has no HTTP caller — the only route that touches the
 * service is `listRecent`. So a probe of "can an operator acknowledge and close a finding" has
 * nothing to act on, and a probe that asserts over zero rows would report every check green while
 * proving nothing. This is the "build the fixture you need to test the refusal" shape: the
 * reference has to exist before the refusal can be observed.
 *
 * Written through the product's own service layer, in a transaction it rolls back, so the rows are
 * real `analytics_findings` records and the paths the probe then exercises are the production
 * paths. Two findings, because the probe needs both cases at once: one that has never been
 * acknowledged (so resolve must be refused) and one that has (so resolve must succeed).
 *
 * Run inside the API container: docker exec -i iot-rescue-api node --experimental-strip-types ./fixture.mts
 * The probe's runner removes these rows afterwards, by id.
 */
const APP_ROOT = process.env.PROBE_APP_ROOT ?? '/app/dist';
const { NestFactory } = await import('@nestjs/core');
const { AppModule } = await import(`${APP_ROOT}/app.module.js`);
const { PrismaService } = await import(`${APP_ROOT}/prisma/prisma.service.js`);
const { AnalyticsIngestionService } = await import(
  `${APP_ROOT}/analytics/analytics-ingestion.service.js`
);

const TENANT = '22222222-2222-4222-8222-222222222222';
const STAMP = Date.now().toString(36);
// The finding names a device the fixture creates, so `deviceId` resolves to something real.
const DEVICE_NAME = `noc-probe-device-${STAMP}`;

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const prisma = app.get(PrismaService);
  const ingestion = app.get(AnalyticsIngestionService);

  // A finding carries `deviceId` as a plain column, not a foreign key, so the probe's fixture
  // only needs a device that exists for the console's device list to be non-empty. Created
  // directly and removed by the runner's sweep, matching `noc-probe-` and nothing else.
  const device = await prisma.device.create({
    data: {
      tenantId: TENANT,
      name: DEVICE_NAME,
      type: 'SENSOR',
      status: 'PROVISIONING',
      provisioningTokenHash: `noc-probe-${STAMP}`,
    },
  });

  const unacknowledged = await ingestion.ingestFinding({
    tenantId: TENANT,
    deviceId: device.id,
    capabilityKey: 'probe.temperature',
    kind: 'ANOMALY',
    severity: 'CRITICAL',
    summary: `noc-probe: unacknowledged finding ${STAMP}`,
    confidence: 0.97,
    detectorVersion: 'probe-1',
  });

  const toAcknowledge = await ingestion.ingestFinding({
    tenantId: TENANT,
    deviceId: device.id,
    capabilityKey: 'probe.humidity',
    kind: 'ANOMALY',
    severity: 'WARNING',
    summary: `noc-probe: finding to acknowledge ${STAMP}`,
    confidence: 0.88,
    detectorVersion: 'probe-1',
  });

  console.log(
    JSON.stringify({
      deviceId: device.id,
      unacknowledged: unacknowledged.id,
      toAcknowledge: toAcknowledge.id,
    }),
  );
  await app.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
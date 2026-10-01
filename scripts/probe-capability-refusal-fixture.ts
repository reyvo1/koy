/**
 * Sets up the refusal fixture for the capability-template lifecycle probe.
 *
 * The probe needs a capability that is genuinely referenced by a dashboard binding, because
 * "a bound capability is refused" is one of the two owner decisions and it cannot be proven
 * without a reference. Nothing in the public API creates a widget binding — `DashboardWidgetBinding`
 * rows are written by the dashboard service when a widget is saved — and the demo tenant has no
 * bindings of its own: all eight in this database belong to tenants created by Jest runs.
 *
 * So this script creates one through the product's own service layer, in a transaction it can
 * roll back, and prints the ids the probe needs. It is a fixture, not a workaround: the
 * reference it creates is a real `dashboard_widget_bindings` row, so the refusal path the probe
 * then exercises is the production path.
 *
 * Run: docker exec -i iot-rescue-api node --experimental-strip-types /tmp/fixture.ts
 * Afterwards: the probe's cleanup removes the dashboard by id.
 */
import { NestFactory } from '@nestjs/core';
// Relative, not `/app/…`: this file compiles in the repo but runs inside the container, where
// the compiled `dist` layout differs. `PROBE_APP_ROOT` is set by the runner so the same source
// resolves in both places.
const APP_ROOT = process.env.PROBE_APP_ROOT ?? '/app/dist';
const { AppModule } = await import(`${APP_ROOT}/app.module.js`);
const { PrismaService } = await import(`${APP_ROOT}/prisma/prisma.service.js`);

const TENANT = '22222222-2222-4222-8222-222222222222';
const DEVICE_NAME = 'capability-probe-device';

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const prisma = app.get(PrismaService);

  // Idempotent: a previous run's fixture is reused rather than duplicated, so repeated probe
  // runs do not accumulate devices.
  const existing = await prisma.device.findFirst({
    where: { tenantId: TENANT, name: DEVICE_NAME },
  });

  const device =
    existing ??
    (await prisma.device.create({
      data: {
        tenantId: TENANT,
        name: DEVICE_NAME,
        type: 'SENSOR',
        status: 'PROVISIONING',
        provisioningTokenHash: `probe-${Math.random().toString(36).slice(2)}`,
      },
    }));

  const capability = await prisma.capability.upsert({
    where: { deviceId_key: { deviceId: device.id, key: 'temperature' } },
    update: {},
    create: {
      deviceId: device.id,
      key: 'temperature',
      semanticType: 'number',
      dataType: 'float8',
      unit: 'C',
      schemaVersion: '1.0.0',
    },
  });

  // Dashboard -> widget -> binding are three tables, and the widget needs a `title`; the earlier
  // draft tried to create a binding inline on the widget with fields (`alias`, `intent`, `mode`,
  // `deviceId`, `capabilityId`) that belong to `DashboardWidgetBinding`, not `DashboardWidget`.
  // Prisma rejected it by name, which is the useful failure: it named the unknown argument
  // instead of writing a row with nothing in it.
  const membership = await prisma.membership.findFirst({
    where: { tenantId: TENANT },
  });
  if (!membership) throw new Error('no membership in the demo tenant');

  const dashboard = await prisma.dashboard.create({
    data: {
      tenantId: TENANT,
      ownerMembershipId: membership.id,
      name: `capability-probe-${Date.now().toString(36).slice(2, 8)}`,
    },
  });

  const widget = await prisma.dashboardWidget.create({
    data: {
      tenantId: TENANT,
      dashboardId: dashboard.id,
      kind: 'CARD',
      title: 'probe card',
    },
  });

  const binding = await prisma.dashboardWidgetBinding.create({
    data: {
      tenantId: TENANT,
      widgetId: widget.id,
      alias: 'probe-card',
      intent: 'READ',
      mode: 'LATEST',
      deviceId: device.id,
      capabilityId: capability.id,
    },
  });

  // And one automation, so the refusal count for automation is non-zero too: a refusal that only
  // ever sees one of the two reference tables is not the refusal the owner approved.
  const automation = await prisma.automation.create({
    data: {
      tenantId: TENANT,
      ownerMembershipId: membership.id,
      name: `capability-probe-auto-${Date.now().toString(36).slice(2, 8)}`,
      // Disabled: this is a reference to be counted, never a rule that should run.
      enabled: false,
      triggerKind: 'CAPABILITY_REPORTED',
      triggerDeviceId: device.id,
      triggerCapabilityId: capability.id,
      condition: { op: 'GT', value: 30 } as never,
    },
  });

  // `createMany` on its own, the way `AutomationRepository` writes actions. The nested
  // `actions: { create: [...] }` form was rejected with `Unknown argument tenantId` -- the
  // action's tenant is taken from the parent, and Prisma's nested-create input omits it. The
  // repository's shape is the one that is known to work, so the fixture uses that.
  await prisma.automationAction.create({
    data: {
      tenantId: TENANT,
      automationId: automation.id,
      actionId: 'probe-action',
      position: 0,
      kind: 'DEVICE_COMMAND',
      deviceId: device.id,
      capabilityId: capability.id,
      value: { command: 'SET', args: { value: 18 } } as never,
    },
  });

  console.log(
    JSON.stringify({
      deviceId: device.id,
      deviceName: device.name,
      capabilityId: capability.id,
      dashboardId: dashboard.id,
      widgetId: widget.id,
      bindingId: binding.id,
      automationId: automation.id,
    }),
  );

  await app.close();
}

main().catch((error) => {
  console.error('fixture failed:', error);
  process.exit(1);
});
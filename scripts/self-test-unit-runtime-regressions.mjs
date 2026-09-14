import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');
let failed = false;

function check(name, condition) {
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}`);
  if (!condition) failed = true;
}

const commandSpec = read('src/device/command.controller.spec.ts');
const telemetrySpec = read('src/telemetry/telemetry.controller.spec.ts');
const commandController = read('src/device/command.controller.ts');
const telemetryController = read('src/telemetry/telemetry.controller.ts');
const schedulerSpec = read('src/scheduler/schedule-due-run.service.spec.ts');
const schedulerService = read('src/scheduler/schedule-due-run.service.ts');

check(
  'CommandController unit test isolates delegation from Nest guard-container resolution',
  !commandSpec.includes("from '@nestjs/testing'") &&
    !commandSpec.includes('PrismaService') &&
    commandSpec.includes('new CommandController(') &&
    commandController.includes('@UseGuards(JwtAuthGuard, TenantContextGuard, DeviceAccessGuard)') &&
    commandController.includes("@RequireDeviceAccess('CONTROL')") &&
    commandController.includes("@RequireDeviceAccess('VIEW')"),
);

check(
  'TelemetryController unit test isolates delegation from Nest guard-container resolution',
  !telemetrySpec.includes("from '@nestjs/testing'") &&
    !telemetrySpec.includes('PrismaService') &&
    telemetrySpec.includes('new TelemetryController(') &&
    telemetryController.includes('@UseGuards(JwtAuthGuard, TenantContextGuard, DeviceAccessGuard)') &&
    telemetryController.includes("@RequireDeviceAccess('VIEW')"),
);

check(
  'scheduler failed-scene unit contract preserves claimedAt ownership token on settlement',
  schedulerService.includes('claimedAt: claimToken') &&
    schedulerSpec.includes("status: 'CLAIMED',\n        claimedAt: databaseNow,") &&
    schedulerSpec.includes("sceneExecutionId: 'scene-exec-partial'"),
);

if (failed) process.exit(1);

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(process.cwd());
const failures = [];
const checks = [];

function check(name, condition, detail = '') {
  checks.push({ name, pass: Boolean(condition), detail });
  if (!condition) failures.push(`${name}${detail ? `: ${detail}` : ''}`);
}

function read(path) {
  return readFileSync(join(root, path), 'utf8');
}

for (const path of [
  'CURRENT-STATE.md',
  'PROJECT-HANDOFF.md',
  'docs/RESCUE-WORKFLOW.md',
  'docs/UI-ROUTE-MAP.md',
]) {
  check(`required ${path}`, existsSync(join(root, path)));
}

check(
  'Windows operator launchers are source-controlled with CRLF Git checkout policy',
  read('.gitattributes').includes('*.cmd text eol=crlf') &&
    read('.gitattributes').includes('*.bat text eol=crlf'),
);

const agentRules = read('AGENTS.md');
check(
  'agent workflow does not auto-push on generic automatic work',
  !agentRules.includes('implement → test → commit → push') &&
    agentRules.includes('`git push` adalah gate terpisah'),
);

const appModule = read('src/app.module.ts');
const orgRegistrations = (appModule.match(/^\s+OrgModule,\s*$/gm) ?? []).length;
check('OrgModule registered once', orgRegistrations === 1, `found ${orgRegistrations}`);

const forbidden = [
  ['demo command row', "id: 'demo-1'"],
  ['demo command row 2', "id: 'demo-2'"],
  ['demo profile email', 'admin@demo.id'],
  ['random claim code', 'CLAIM-${Math.random()'],
  ['synthetic provision log', '] PROVISION OK'],
  ['old Slice 10.7 user message', 'Kontrol perangkat belum diaktifkan pada Slice 10.7'],
  ['tenant dashboard demo fallback', 'fallback keeps blueprint demo rooms'],
];

const sourceRoots = ['apps/admin-web', 'apps/user-web', 'apps/user-mobile/src'];
const ignoredSourceDirectories = new Set([
  'node_modules',
  '.next',
  'dist',
  'coverage',
  '.turbo',
]);
function collect(dir) {
  const out = [];
  for (const entry of readdirSync(join(root, dir), { withFileTypes: true })) {
    const rel = join(dir, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) {
      if (ignoredSourceDirectories.has(entry.name)) continue;
      out.push(...collect(rel));
    } else if (/\.(?:ts|tsx|js|mjs)$/.test(entry.name)) {
      out.push(rel);
    }
  }
  return out;
}
const sourceFiles = sourceRoots.flatMap(collect);
const sourceText = sourceFiles.map((path) => read(path)).join('\n');
for (const [name, token] of forbidden) {
  check(`no ${name}`, !sourceText.includes(token));
}

for (const path of [
  'apps/admin-web/app/tenant/dashboard/page.tsx',
  'apps/admin-web/app/tenant/perangkat/[deviceId]/page.tsx',
  'apps/admin-web/app/tenant/perintah/page.tsx',
  'apps/admin-web/app/super/dashboard/page.tsx',
  'apps/user-web/app/page.tsx',
  'apps/user-mobile/App.tsx',
]) {
  check(`canonical surface ${path}`, existsSync(join(root, path)));
}

const tenantShell = read('apps/admin-web/components/tenant-shell.tsx');
check(
  'tenant device groups are a canonical real-data navigation surface',
  tenantShell.includes("href: '/tenant/grup-perangkat'") &&
    existsSync(join(root, 'apps/admin-web/components/tenant-device-groups-content.tsx')),
);
const superShell = read('apps/admin-web/components/super-admin-shell.tsx');
check('quarantined NOC hidden from super nav', !superShell.includes("direct: '/noc'"));
check(
  'platform command monitor is visible only after a read-only cross-tenant history contract exists',
  superShell.includes("direct: '/super/commands'") &&
    existsSync(join(root, 'apps/admin-web/components/super-command-monitor-content.tsx')),
);

// RESCUE-03 UI/product consolidation guardrails.
const deviceGroupController = read('src/device/device-group.controller.ts');
const deviceGroupUi = read('apps/admin-web/components/tenant-device-groups-content.tsx');
check(
  'device group mutations require RBAC and tenant-scoped device ownership',
  deviceGroupController.includes('RbacPermissionGuard') &&
    deviceGroupController.includes("@RequirePermission('device.update')") &&
    deviceGroupController.includes('where: { id: body.deviceId, tenantId }') &&
    deviceGroupController.includes('where: { tenantId, id: { in: deviceIds } }'),
);
check(
  'device group reads hide legacy cross-tenant poisoned memberships',
  deviceGroupController.includes('where: { device: { tenantId } }') &&
    deviceGroupController.includes('Historical builds did not validate same-tenant membership on write.'),
);
check(
  'device group UI uses real tenant APIs instead of placeholder content',
  deviceGroupUi.includes("fetch('/api/tenant/device-groups'") &&
    deviceGroupUi.includes("fetch('/api/admin/devices'") &&
    deviceGroupUi.includes('Perangkat ditambahkan ke grup.') &&
    !read('apps/admin-web/app/tenant/grup-perangkat/page.tsx').includes('Fitur grup sedang disiapkan'),
);

const adminLoginRoute = read('apps/admin-web/app/api/session/login/route.ts');
const compatibilityShell = read('apps/admin-web/components/admin-shell-v3.tsx');
check(
  'Admin Web rejects MEMBER sessions before setting admin cookies',
  adminLoginRoute.includes("role !== 'ADMIN' && role !== 'PLATFORM_ADMIN'") &&
    adminLoginRoute.includes("backendFetch('/auth/logout'") &&
    adminLoginRoute.includes('Akun ini tidak memiliki akses ke konsol administrator'),
);
check(
  'canonical admin shells fail closed on role hints and auto-track pathname',
  tenantShell.includes('useAdminSessionRole()') &&
    tenantShell.includes('usePathname()') &&
    superShell.includes('useAdminSessionRole()') &&
    superShell.includes('usePathname()') &&
    compatibilityShell.includes('useAdminSessionRole()') &&
    compatibilityShell.includes('usePathname()'),
);
check(
  'super navigation keeps nested routes active',
  superShell.includes('function isActiveRoute(') &&
    superShell.includes('currentPath.startsWith(`${href}/`)'),
);

const legacyDeviceDetail = read('apps/admin-web/app/perangkat/[deviceId]/page.tsx');
check(
  'legacy device detail redirects to canonical tenant detail',
  legacyDeviceDetail.includes("redirect(`/tenant/perangkat/${encodeURIComponent(deviceId)}`)") &&
    !legacyDeviceDetail.includes('AdminShellV3'),
);

const adminLayout = read('apps/admin-web/app/layout.tsx');
check(
  'admin design system is imported once at root layout',
  adminLayout.includes("import './design-system-v2.css';") &&
    sourceFiles.filter((path) => path.replaceAll('\\', '/') !== 'apps/admin-web/app/layout.tsx')
      .every((path) => !read(path).includes('design-system-v2.css')),
);
check(
  'obsolete admin UI generation files are removed',
  !existsSync(join(root, 'apps/admin-web/components/admin-shell.tsx')) &&
    !existsSync(join(root, 'apps/admin-web/components/admin-dashboard-overview.tsx')) &&
    !existsSync(join(root, 'apps/admin-web/components/admin-dashboard-v3.tsx')) &&
    !existsSync(join(root, 'apps/admin-web/components/device-control-panel.tsx')) &&
    !existsSync(join(root, 'apps/admin-web/components/devices-table-v3.tsx')) &&
    !existsSync(join(root, 'apps/admin-web/components/devices-table.tsx')),
);

const deviceAccessSource = read('src/device/device-access.service.ts');
check(
  'device access decision map keeps the full access-source union during declaration build',
  deviceAccessSource.includes('Array<[string, DeviceAccessDecision]>') &&
    deviceAccessSource.includes('new Map<string, DeviceAccessDecision>(entries)'),
);
const scheduleDueRunSource = read('src/scheduler/schedule-due-run.service.ts');
check(
  'scheduler stale-claim timeout remains a number instead of a literal-only type',
  scheduleDueRunSource.includes(
    'claimTimeoutMs: number = SCHEDULER_RUN_LIMITS.defaultClaimTimeoutMs',
  ),
);
const accessibleSpaceSource = read('src/space/accessible-space.service.ts');
check(
  'accessible space declaration model exports WorkspaceDevice for Nest declaration emit',
  accessibleSpaceSource.includes('export interface WorkspaceDevice'),
);
const userRoomWorkspaceSource = read('apps/user-web/components/room-workspace-experience.tsx');
const userDeviceDetailSource = read('apps/user-web/components/device-detail-experience.tsx');
const mobileDashboardScreenSource = read('apps/user-mobile/src/ui/mobile-dashboard-screen.tsx');
const mobileDashboardWidgetSource = read('apps/user-mobile/src/ui/mobile-dashboard-widget.tsx');
const mobileDeviceDetailPanelSource = read('apps/user-mobile/src/ui/mobile-device-detail-panel.tsx');
const mobileDashboardSelectorSource = mobileDashboardScreenSource.slice(
  mobileDashboardScreenSource.indexOf('function DashboardSelector('),
  mobileDashboardScreenSource.indexOf('function DashboardContent('),
);
const mobileGaugeValueSource = mobileDashboardWidgetSource.slice(
  mobileDashboardWidgetSource.indexOf('function GaugeValue('),
  mobileDashboardWidgetSource.indexOf('function SeriesValues('),
);
check(
  'User Web room login callback preserves the async LoginForm contract',
  userRoomWorkspaceSource.includes('onAuthenticated={() => load()}') &&
    !userRoomWorkspaceSource.includes('onAuthenticated={() => void load()}'),
);
check(
  'User Web device-detail login callback preserves the async LoginForm contract',
  userDeviceDetailSource.includes('onAuthenticated={() => load()}') &&
    !userDeviceDetailSource.includes('onAuthenticated={() => void load()}'),
);
check(
  'Mobile dashboard selector contract contains only props it actually consumes',
  mobileDashboardSelectorSource.includes('onSelectDashboard(dashboardId: string): Promise<void>;') &&
    !mobileDashboardSelectorSource.includes('onSendCommand('),
);
check(
  'Mobile gauge contract contains only props it actually consumes',
  mobileGaugeValueSource.includes('resolution: MobileResolvedWidget;') &&
    !mobileGaugeValueSource.includes('onSendCommand('),
);
check(
  'Mobile Device Detail captures a stable non-null device id before async command callbacks',
  mobileDeviceDetailPanelSource.includes('const deviceId = detail.device.id;') &&
    mobileDeviceDetailPanelSource.includes('onSendCommand(deviceId, capabilityKey, value)') &&
    !mobileDeviceDetailPanelSource.includes('onSendCommand(detail.device.id, capabilityKey, value)'),
);

check(
  'rescue source scan is portable across Windows paths and ignores generated dependency trees',
  ignoredSourceDirectories.has('node_modules') &&
    sourceFiles.every((path) => !path.split(/[\\/]/).includes('node_modules')),
);

const rbacPolicy = read('src/rbac/rbac-policy.service.ts');
check(
  'PLATFORM_ADMIN is an RBAC administrative superset consistently',
  rbacPolicy.includes("input.baseRole === 'ADMIN' || input.baseRole === 'PLATFORM_ADMIN'"),
);

const generatedHtml = existsSync(join(root, 'apps/admin-web'))
  ? readdirSync(join(root, 'apps/admin-web')).filter((name) => name.endsWith('.html'))
  : [];
check('no generated admin HTML snapshots', generatedHtml.length === 0, generatedHtml.join(', '));
check(
  'Wave 1 pre-push gate mirrors cheap GitHub security lint hygiene and source checks',
  read('package.json').includes('wave1:prepush:check') &&
    read('package.json').includes('security:audit:production') &&
    read('package.json').includes('lint:check') &&
    read('package.json').includes('baseline:hygiene:clean') &&
    read('package.json').includes('rescue:github-ci:self-test'),
);
check(
  'baseline hygiene cleaner is source-controlled and explicit',
  read('package.json').includes('baseline:hygiene:clean') &&
    read('scripts/clean-generated-build-artifacts.mjs').includes("'dist'") &&
    read('scripts/clean-generated-build-artifacts.mjs').includes("'apps/admin-web/.next'") &&
    read('scripts/clean-generated-build-artifacts.mjs').includes("'apps/user-web/.next'"),
);
check('no stale compiled dist in source baseline', !existsSync(join(root, 'dist')));
const repositoryTree = read('repository-tree.txt');
check(
  'repository tree reflects rescue baseline hygiene',
  !repositoryTree.includes('node_modules') &&
    !repositoryTree.includes('apps/admin-web/app/api/automation-runtime/route.ts') &&
    repositoryTree.includes('docker-compose.rescue.yml') &&
    repositoryTree.includes('scripts/configure-emqx-http-auth.mjs'),
);
check(
  'no stale automation runtime UI proxy',
  !existsSync(join(root, 'apps/admin-web/app/api/automation-runtime/route.ts')) &&
    !existsSync(join(root, 'apps/admin-web/components/automation-runtime-card.tsx')) &&
    !sourceText.includes('/automation/runtime'),
);


// RESCUE-02 core-flow contract guardrails. These checks are intentionally
// dependency-free so a portable baseline can detect drift before npm install.
const commandAdapter = read('apps/admin-web/lib/device-control.ts');
check(
  'tenant command adapter uses canonical backend payload',
  commandAdapter.includes('payload: { [capabilityKey]: value }'),
);
check(
  'tenant command adapter sends idempotency key',
  commandAdapter.includes('idempotencyKey: crypto.randomUUID()'),
);

const tenantCommandHistory = read('apps/admin-web/app/api/tenant/commands/route.ts');
check(
  'tenant command history understands dynamic payload keys',
  tenantCommandHistory.includes("Object.keys(row.payload).join(', ')"),
);

const provisionService = read('src/admin-operations/admin-device-provisioning.service.ts');
check(
  'provisioning emits device-bound pairing code',
  provisionService.includes('pairingCode: `${device.id}:${token}`'),
);

const deviceService = read('src/device/device.service.ts');
check(
  'pairing fails closed without MQTT broker URI',
  deviceService.includes("process.env.MQTT_BROKER_URL?.trim()") &&
    deviceService.includes("'MQTT broker is not configured'"),
);
check(
  'pairing safely upserts device credential',
  deviceService.includes('deviceCredential.upsert({'),
);
check(
  'pairing token consumption is atomic under concurrent claims',
  deviceService.includes('await this.prisma.$transaction(async (tx) =>') &&
    deviceService.includes('provisioningTokenHash: expectedTokenHash') &&
    deviceService.includes('const claim = await tx.device.updateMany({') &&
    deviceService.includes('if (claim.count !== 1)') &&
    deviceService.includes('await tx.deviceCredential.upsert({'),
);
const cameraOnboardingService = read('src/device/camera-onboarding.service.ts');
check(
  'camera pairing consumes one-time token atomically',
  cameraOnboardingService.includes('await this.prisma.$transaction(async (tx) =>') &&
    cameraOnboardingService.includes('type: DeviceType.CAMERA') &&
    cameraOnboardingService.includes('provisioningTokenHash: expectedTokenHash') &&
    cameraOnboardingService.includes('const claim = await tx.device.updateMany({') &&
    cameraOnboardingService.includes('if (claim.count !== 1)') &&
    cameraOnboardingService.includes('await tx.deviceCredential.upsert({'),
);
check(
  'pairing returns trusted tenant and MQTT identity',
  deviceService.includes('tenantId: device.tenantId') &&
    deviceService.includes('mqttUri,') &&
    deviceService.includes('mqttUsername: device.id'),
);

const mqttService = read('src/mqtt/mqtt.service.ts');
check(
  'MQTT ACL allows telemetry publish',
  mqttService.includes('`${expectedPrefix}/telemetry`'),
);
check(
  'MQTT ACL allows command ACK publish',
  mqttService.includes('`${expectedPrefix}/commands/ack`'),
);
check(
  'MQTT ACL allows command subscribe',
  mqttService.includes('`${expectedPrefix}/commands`'),
);
check(
  'MQTT ACK preserves explicit device failure',
  mqttService.includes("status === 'FAILED'") &&
    mqttService.includes("'Invalid acknowledgement status'"),
);
const commandService = read('src/device/command.service.ts');
check(
  'command service maps device failure to FAILED status',
  commandService.includes("deviceResult === 'FAILED' ? CommandStatus.FAILED") &&
    commandService.includes("status: nextStatus"),
);
check(
  'command ACK is QoS-1 replay safe and accepts delivered PENDING state',
  commandService.includes("command.status === nextStatus") &&
    commandService.includes("status: { in: [CommandStatus.PENDING, CommandStatus.SENT] }") &&
    commandService.includes("acknowledgement_replayed") &&
    commandService.includes("durable.status === nextStatus"),
);
check(
  'command SENT persistence cannot regress a fast terminal ACK',
  commandService.includes("where: { id: command.id, status: CommandStatus.PENDING }") &&
    commandService.includes("event: 'command.publish.sent_state_raced'") &&
    commandService.includes("return durable ?? command") &&
    !commandService.includes("sentCommand = await this.prisma.deviceCommand.update({"),
);
check(
  'confirmed broker publish does not fabricate FAILED on SENT persistence failure',
  commandService.includes("event: 'command.publish.sent_state_persist_failed'") &&
    commandService.includes("recordCommandLifecycle('sent_persistence_failed')") &&
    commandService.includes('return command;'),
);

const runtimeChecker = read('scripts/check-rescue-runtime.mjs');
const scheduleDueRunService = read('src/scheduler/schedule-due-run.service.ts');
check(
  'scheduler materializes distinct cron activations',
  scheduleDueRunService.includes('job.nextDates(candidateCount)') &&
    !scheduleDueRunService.includes('const next = job.nextDate().toJSDate()'),
);
check(
  'scheduler skip accounting uses durable update counts',
  scheduleDueRunService.includes('skippedMissed += skipped.count'),
);
check(
  'scheduler missed-run policy executes the newest backlog state',
  scheduleDueRunService.includes("if (policy === 'SKIP_TO_NEXT')") &&
    scheduleDueRunService.includes('const skipIds = runs.slice(0, -1)') &&
    scheduleDueRunService.includes('toExecute = runs.slice(-1)') &&
    scheduleDueRunService.includes('const overflowCount = Math.max(') &&
    scheduleDueRunService.includes('toExecute = runs.slice(overflowCount)'),
);
check(
  'scheduler stale CLAIMED lease recovery is ownership-token safe',
  scheduleDueRunService.includes('async recoverStaleClaims(') &&
    scheduleDueRunService.includes('claimedAt: { lte: cutoff }') &&
    scheduleDueRunService.includes('claimedAt: claimToken') &&
    scheduleDueRunService.includes("event: 'scheduler.run.claim_lost'") &&
    scheduleDueRunService.includes('claimed += 1'),
);
check(
  'scheduler does not report failed or partial Scene execution as success',
  scheduleDueRunService.includes('sceneResult.status !== SceneExecutionStatus.SUCCEEDED') &&
    scheduleDueRunService.includes('sceneExecutionId: sceneResult.executionId') &&
    scheduleDueRunService.includes('status: ScheduleRunStatus.FAILED'),
);
check(
  'scheduler materializes COUNTDOWN intervals with durable nextRunAt anchor',
  scheduleDueRunService.includes("if (schedule.kind === 'COUNTDOWN')") &&
    scheduleDueRunService.includes('schedule.nextRunAt ?? new Date(cursor.getTime() + intervalMs)') &&
    scheduleDueRunService.includes('data: { nextRunAt: desiredNextRunAt }'),
);
check(
  'scheduler honors ONCE and LIMITED materialization bounds',
  scheduleDueRunService.includes('private remainingMaterializations(') &&
    scheduleDueRunService.includes("if (repeat === 'ONCE')") &&
    scheduleDueRunService.includes("if (repeat === 'LIMITED')") &&
    scheduleDueRunService.includes('schedule._count.runs'),
);
const scheduleValidator = read('src/scheduler/schedule-domain.validator.ts');
check(
  'LIMITED schedule requires a valid maxRuns contract',
  scheduleValidator.includes("repeat === 'LIMITED'") &&
    scheduleValidator.includes("errors.push('SCHEDULE_MAXRUNS_INVALID')") &&
    scheduleValidator.includes("errors.push('SCHEDULE_REPEAT_INVALID')"),
);
const scheduleUi = read('apps/admin-web/components/tenant-schedules-content.tsx');
check(
  'tenant schedule UI exposes INDEFINITE LIMITED and ONCE repeat modes',
  scheduleUi.includes("useState<'INDEFINITE' | 'LIMITED' | 'ONCE'>") &&
    scheduleUi.includes('<option value="LIMITED">') &&
    scheduleUi.includes('<option value="ONCE">') &&
    scheduleUi.includes("payload.maxRuns = Number(form.get('maxRuns') ?? 1)"),
);
const scheduleApi = read('src/scheduler/schedule.controller.ts');
check(
  'enabling COUNTDOWN initializes nextRunAt from countdownSeconds',
  scheduleApi.includes("schedule.kind === 'COUNTDOWN'") &&
    scheduleApi.includes('new Date(Date.now() + schedule.countdownSeconds * 1000)') &&
    scheduleApi.includes('{ nextRunAt: countdownNextRunAt }'),
);
const scheduleRuntimeWorker = read('src/scheduler/schedule-runtime.worker.ts');
const schedulerModule = read('src/scheduler/scheduler.module.ts');
check(
  'scheduler runtime tick is explicit opt-in, lease recovering, and overlap guarded',
  scheduleRuntimeWorker.includes("SCHEDULER_RUNTIME_ENABLED") &&
    scheduleRuntimeWorker.includes('SCHEDULER_CLAIM_TIMEOUT_MS') &&
    scheduleRuntimeWorker.includes('if (this.running)') &&
    scheduleRuntimeWorker.includes('recoverStaleClaims(') &&
    scheduleRuntimeWorker.includes('materializeUpcomingRuns(24)') &&
    scheduleRuntimeWorker.includes('executeDueRuns()'),
);
check(
  'scheduler runtime worker is wired into SchedulerModule',
  schedulerModule.includes('ScheduleRuntimeWorker') &&
    schedulerModule.includes('providers: [ScheduleDomainValidator, ScheduleDueRunService, ScheduleRuntimeWorker]'),
);
check(
  'rescue runtime checker requires scheduler activation and safe lease timeout',
  runtimeChecker.includes("env.SCHEDULER_RUNTIME_ENABLED") &&
    runtimeChecker.includes("must be true for schedule acceptance") &&
    runtimeChecker.includes('SCHEDULER_CLAIM_TIMEOUT_MS') &&
    runtimeChecker.includes('60000') &&
    runtimeChecker.includes('3600000'),
);

const capabilityProxy = read('apps/admin-web/app/api/admin/device-capabilities/route.ts');
check(
  'tenant capability proxy supports creation',
  capabilityProxy.includes('export async function POST(request: Request)'),
);
check(
  'capability proxy preserves items compatibility for scene and automation',
  capabilityProxy.includes('{ capabilities, items: capabilities }') &&
    capabilityProxy.includes('{ capabilities: [], items: [] }'),
);

const automationUi = read('apps/admin-web/components/tenant-automation-content.tsx');
check(
  'automation accepts array device responses',
  automationUi.includes('setDevices(Array.isArray(data) ? data : (data.items ?? []))'),
);

const notificationsUi = read('apps/admin-web/components/tenant-analytics-findings-content.tsx');
check(
  'analytics findings empty state does not claim device health or notification delivery',
  notificationsUi.includes('Belum ada temuan analitik') &&
    notificationsUi.includes('Ini bukan status pengiriman notifikasi.') &&
    !notificationsUi.includes('Semua perangkat berjalan normal'),
);

const sceneItemProxy = read('apps/admin-web/app/api/tenant/scenes/[sceneId]/route.ts');
check(
  'scene proxy supports enable and disable',
  sceneItemProxy.includes('export async function PATCH(') &&
    sceneItemProxy.includes("method: 'PATCH'"),
);

const scheduleController = read('src/scheduler/schedule.controller.ts');
check(
  'schedule target scene is tenant scoped before creation',
  scheduleController.includes('this.prisma.scene.findFirst({') &&
    scheduleController.includes('where: { id: targetSceneId, tenantId }') &&
    scheduleController.includes('Scene target tidak ditemukan untuk tenant aktif'),
);

const deviceCommandProxy = read('apps/admin-web/app/api/devices/[deviceId]/commands/route.ts');
check(
  'device command proxy exposes history and command send',
  deviceCommandProxy.includes('export async function GET(') &&
    deviceCommandProxy.includes('export async function POST('),
);

const deviceDetail = read('apps/admin-web/components/device-detail-content.tsx');
check(
  'device detail loads command history',
  deviceDetail.includes('fetch(`/api/devices/${encodeURIComponent(deviceId)}/commands`)'),
);
check(
  'device detail can create capabilities',
  deviceDetail.includes('const createCapability = async') &&
    deviceDetail.includes("method: 'POST'"),
);

const sceneExecutionService = read('src/scene/scene-execution.service.ts');
check(
  'scene replay never redispatches a RESERVED execution',
  sceneExecutionService.includes("if (reservation.disposition === 'REPLAYED')") &&
    !sceneExecutionService.includes("reservation.execution.status !== SceneExecutionStatus.RESERVED") &&
    sceneExecutionService.includes('idempotency fail-safe under concurrent duplicate requests'),
);

const sdkRoot = 'packages/esp32-sdk';
const sdkFiles = collect(sdkRoot);
const sdkText = sdkFiles.map((path) => read(path)).join('\n');
check('ESP32 SDK removed stale claim endpoint', !sdkText.includes('/api/provision/claim'));
const sdkSource = read('packages/esp32-sdk/src/iot_sdk.c');
check(
  'ESP32 SDK uses canonical MQTT topic prefix',
  sdkSource.includes('"tenants/%s/devices/%s/%s"'),
);
check(
  'ESP32 SDK publishes command ACK on canonical topic',
  sdkSource.includes('topic_build(topic, sizeof(topic), "commands/ack")'),
);
check(
  'ESP32 SDK telemetry uses event envelope',
  sdkSource.includes('{\\"eventId\\":\\"%s\\",\\"payload\\":%s}'),
);
check(
  'ESP32 SDK heartbeat uses device HTTP endpoint',
  sdkSource.includes('"%s/devices/%s/heartbeat"'),
);
check(
  'ESP32 SDK suppresses duplicate QoS-1 command execution and replays ACK',
  sdkSource.includes('IOT_COMMAND_DEDUPE_SLOTS') &&
    sdkSource.includes('command_cache_find(command.command_id)') &&
    sdkSource.includes('duplicate in-flight command suppressed') &&
    sdkSource.includes('duplicate command replayed from ACK cache') &&
    sdkSource.includes('command_cache_record_result(command_id, success, reason)'),
);
check(
  'ESP32 SDK resumes provisioned state after reboot',
  sdkSource.includes('s_ctx.state = IOT_STATE_WIFI_CONNECTING;'),
);
check(
  'ESP32 SDK captures HTTP response during perform',
  sdkSource.includes('HTTP_EVENT_ON_DATA') &&
    sdkSource.includes('.event_handler = http_capture_event') &&
    !sdkSource.includes('esp_http_client_read_response('),
);
check(
  'ESP32 provisioning waits for Wi-Fi before pair API',
  sdkSource.includes('wifi connection failed during provisioning') &&
    sdkSource.includes('xEventGroupWaitBits('),
);

const mqttWebhook = read('src/mqtt/mqtt.webhook.controller.ts');
const telemetryWebhook = read('src/telemetry/mqtt.webhook.controller.ts');
check(
  'MQTT webhook secret fails closed when unconfigured',
  mqttWebhook.includes('!configuredSecret || !this.secureEqual(secret, configuredSecret)'),
);
check(
  'telemetry webhook secret fails closed with constant-time comparison',
  telemetryWebhook.includes("import { timingSafeEqual } from 'node:crypto';") &&
    telemetryWebhook.includes('actual.length !== expected.length') &&
    telemetryWebhook.includes('!timingSafeEqual(actual, expected)'),
);

const mobileDeviceClient = read('apps/user-mobile/src/device-control/mobile-device-client.ts');
check(
  'mobile device list uses the authorized room/access workspace contract',
  mobileDeviceClient.includes("gateway.requestJson<unknown>('/spaces/accessible')") &&
    mobileDeviceClient.includes('const rows = Array.isArray(body?.devices)') &&
    mobileDeviceClient.includes('canControl: row.canControl === true') &&
    mobileDeviceClient.includes("typeof row.roomPath === 'string'"),
);
check(
  'mobile command uses dynamic capability payload and idempotency contract',
  mobileDeviceClient.includes('payload: { [capabilityKey]: value }') &&
    mobileDeviceClient.includes('sendBooleanCapabilityCommand') &&
    mobileDeviceClient.includes('idempotencyKey:'),
);
check(
  'mobile latest telemetry maps backend payload row',
  mobileDeviceClient.includes('const payload = row.payload;') &&
    mobileDeviceClient.includes('Object.entries(payload as Record<string, unknown>)'),
);
check(
  'ESP32 OTA verifies complete SHA-256 before boot selection and keeps rollback confirmation live-bound',
  sdkSource.includes('esp_ota_get_next_update_partition(NULL)') &&
    sdkSource.includes('mbedtls_sha256_update') &&
    sdkSource.includes('constant_time_digest_equal(actual_digest, expected_digest)') &&
    sdkSource.indexOf('constant_time_digest_equal(actual_digest, expected_digest)') <
      sdkSource.indexOf('esp_ota_set_boot_partition(update_partition)') &&
    sdkSource.includes('esp_ota_abort(ota_handle)') &&
    sdkSource.includes('esp_ota_mark_app_valid_cancel_rollback'),
);

check(
  'RESCUE-02 runtime runbook exists',
  existsSync(join(root, 'docs/RESCUE-02-RUNTIME-RUNBOOK.md')),
);

check(
  'EMQX 5.8 auth response embeds device-bound ACL',
  mqttWebhook.includes('authenticateForBroker') &&
    mqttWebhook.includes('is_superuser: false') &&
    mqttWebhook.includes('topic: `eq ${topicPrefix}/telemetry`') &&
    mqttWebhook.includes('topic: `eq ${topicPrefix}/commands/ack`') &&
    mqttWebhook.includes('topic: `eq ${topicPrefix}/commands`') &&
    mqttWebhook.includes("{ permission: 'deny', action: 'all', topic: '#' }"),
);
check(
  'broker authentication preserves tenant identity',
  mqttService.includes('async authenticateForBroker(') &&
    mqttService.includes('return { authenticated: true, tenantId: device.tenantId };'),
);
check(
  'platform MQTT publisher receives command-only ACL',
  mqttWebhook.includes("'MQTT_USERNAME'") &&
    mqttWebhook.includes("'MQTT_PASSWORD'") &&
    mqttWebhook.includes("topic: 'tenants/+/devices/+/commands'") &&
    mqttWebhook.includes('timingSafeEqual'),
);
const rescueCompose = read('docker-compose.rescue.yml');
check(
  'RESCUE-02 local infra compose exists',
  existsSync(join(root, 'docker-compose.rescue.yml')),
);
check(
  'rescue EMQX persists runtime configuration',
  rescueCompose.includes('iot_rescue_emqx:/opt/emqx/data') &&
    rescueCompose.includes('iot_rescue_emqx:'),
);
check(
  'rescue and development compose pin EMQX 5.9.2 instead of 5.8.0',
  rescueCompose.includes('image: emqx/emqx:5.9.2') &&
    read('docker-compose.yml').includes('image: emqx/emqx:5.9.2') &&
    !rescueCompose.includes('image: emqx/emqx:5.8.0') &&
    !read('docker-compose.yml').includes('image: emqx/emqx:5.8.0'),
);
check(
  'rescue EMQX gets deterministic local dashboard bootstrap password',
  rescueCompose.includes('EMQX_DASHBOARD__DEFAULT_PASSWORD'),
);
check(
  'RESCUE-02 local env template exists',
  existsSync(join(root, 'ops/env/rescue-local.env.example')),
);
const rescueLocalEnv = read('ops/env/rescue-local.env.example');
check(
  'local rescue database integration URL targets the compose-created database and relies on run-owned schema isolation',
  rescueLocalEnv.includes('DATABASE_URL=postgresql://iot:iot_local_only@127.0.0.1:5432/iot') &&
    rescueLocalEnv.includes('TEST_DATABASE_URL=postgresql://iot:iot_local_only@127.0.0.1:5432/iot') &&
    rescueLocalEnv.includes('run-owned test_* schema'),
);
check(
  'local rescue environment initializer generates secrets without printing them or overwriting by default',
  existsSync(join(root, 'scripts/init-rescue-local-env.mjs')) &&
    read('package.json').includes('rescue:env:init') &&
    read('scripts/init-rescue-local-env.mjs').includes("randomBytes") &&
    read('scripts/init-rescue-local-env.mjs').includes("Refusing to overwrite existing environment file") &&
    !read('scripts/init-rescue-local-env.mjs').includes('console.log(value)'),
);
check(
  'EMQX rescue integration guide exists',
  existsSync(join(root, 'ops/emqx/README.md')) &&
    existsSync(join(root, 'ops/emqx/http-authenticator.rescue-02.example.hocon')),
);
check(
  'dependency-free runtime prerequisite checker exists',
  existsSync(join(root, 'scripts/check-rescue-runtime.mjs')),
);
check(
  'EMQX HTTP auth bootstrap helper exists',
  existsSync(join(root, 'scripts/configure-emqx-http-auth.mjs')),
);
check(
  'runtime probes follow configured service URLs',
  runtimeChecker.includes('resolveTcpTarget(') &&
    runtimeChecker.includes('env.DATABASE_URL') &&
    runtimeChecker.includes('env.REDIS_URL') &&
    runtimeChecker.includes('env.MQTT_BROKER_URL') &&
    runtimeChecker.includes('env.EMQX_API_URL'),
);
const acceptanceRunner = read('scripts/run-rescue-acceptance.mjs');
check(
  'runtime acceptance runner emits evidence and fails closed',
  existsSync(join(root, 'scripts/run-rescue-acceptance.mjs')) &&
    acceptanceRunner.includes('RUNTIME_PRECHECK_BLOCKED') &&
    acceptanceRunner.includes('AUTOMATED_TEST_SUITE_PASS') &&
    read('package.json').includes('rescue:acceptance'),
);
check(
  'acceptance orchestrator self-test is source-controlled and explicitly synthetic',
  existsSync(join(root, 'scripts/self-test-rescue-acceptance-runner.mjs')) &&
    read('package.json').includes('rescue:acceptance:self-test') &&
    read('scripts/self-test-rescue-acceptance-runner.mjs').includes('fake npm') &&
    read('scripts/self-test-rescue-acceptance-runner.mjs').includes("NODE_ENV=test") &&
    read('scripts/self-test-rescue-acceptance-runner.mjs').includes('never RESCUE-02B runtime evidence'),
);
check(
  'acceptance self-test proves development rescue env cannot leak into production build steps',
  read('scripts/self-test-rescue-acceptance-runner.mjs').includes('NODE_ENV=development') &&
    read('scripts/self-test-rescue-acceptance-runner.mjs').includes("backend production build must force NODE_ENV=production") &&
    read('scripts/self-test-rescue-acceptance-runner.mjs').includes("web/mobile production validation must force NODE_ENV=production"),
);
check(
  'acceptance self-test excludes nested generated web trees before fixture copy',
  read('scripts/self-test-rescue-acceptance-runner.mjs').includes('segments.some((segment) => GENERATED_SOURCE_SEGMENTS.has(segment))') &&
    read('scripts/self-test-rescue-acceptance-runner.mjs').includes("'node_modules'") &&
    read('scripts/self-test-rescue-acceptance-runner.mjs').includes("'.next'") &&
    read('scripts/self-test-rescue-acceptance-runner.mjs').includes('acceptance self-test source copy excludes nested generated trees'),
);
check(
  'root unit-test compiler is isolated from Next.js web ambient declarations',
  existsSync(join(root, 'tsconfig.jest.json')) &&
    read('jest.config.js').includes("roots: ['<rootDir>/src', '<rootDir>/test', '<rootDir>/apps/user-mobile/src']") &&
    read('jest.config.js').includes("tsconfig: 'tsconfig.jest.json'") &&
    read('tsconfig.jest.json').includes('"types": ["node", "jest"]') &&
    read('tsconfig.jest.json').includes('"apps/admin-web/**"') &&
    read('tsconfig.jest.json').includes('"apps/user-web/**"') &&
    !read('tsconfig.jest.json').includes('"apps/admin-web/**/*.ts"') &&
    !read('tsconfig.jest.json').includes('"apps/user-web/**/*.ts"') &&
    existsSync(join(root, 'scripts/self-test-unit-test-type-boundary.mjs')) &&
    read('package.json').includes('rescue:unit-types:self-test'),
);
check(
  'acceptance runner isolates production build mode from development runtime env and test mode',
  acceptanceRunner.includes('const executionEnv = { ...parseEnv(envPath), ...process.env };') &&
    acceptanceRunner.includes("const productionBuildEnv = { ...executionEnv, NODE_ENV: 'production' };") &&
    acceptanceRunner.includes("const testExecutionEnv = { ...executionEnv, NODE_ENV: 'test' };") &&
    acceptanceRunner.includes("name: 'Backend production build'") &&
    acceptanceRunner.includes("name: 'Web/mobile validation'") &&
    acceptanceRunner.includes('options: { env: productionBuildEnv }') &&
    acceptanceRunner.includes("name: 'Unit/contract tests'") &&
    acceptanceRunner.includes("name: 'Database integration'") &&
    acceptanceRunner.includes("name: 'MQTT integration'") &&
    acceptanceRunner.includes('options: { env: testExecutionEnv }'),
);
check(
  'acceptance runner handles Windows npm command scripts',
  acceptanceRunner.includes("process.platform === 'win32' ? 'npm.cmd' : 'npm'") &&
    acceptanceRunner.includes("shell: process.platform === 'win32'"),
);
check(
  'acceptance failures expose all suite/test headers before the bounded tail',
  existsSync(join(root, 'scripts/rescue-failure-summary.mjs')) &&
    existsSync(join(root, 'scripts/self-test-rescue-failure-summary.mjs')) &&
    read('package.json').includes('rescue:failure-summary:self-test') &&
    acceptanceRunner.includes("import { summarizeFailureOutput } from './rescue-failure-summary.mjs'") &&
    acceptanceRunner.includes("console.log('FAILURE SUMMARY')") &&
    read('scripts/rescue-failure-summary.mjs').includes('/^FAIL\\s+/') &&
    read('scripts/rescue-failure-summary.mjs').includes('/^\\s*●\\s+/') &&
    read('scripts/self-test-rescue-failure-summary.mjs').includes('FAIL src/device/device.service.spec.ts'),
);
check(
  'historical contract assertions follow the current authorization and product supersets',
  read('test/module-09-latest-telemetry-query.contract.spec.ts').includes('DeviceAccessGuard') &&
    read('test/module-09-latest-telemetry-query.contract.spec.ts').includes("@RequireDeviceAccess('VIEW')") &&
    read('test/module-09-telemetry-history-query.contract.spec.ts').includes('DeviceAccessGuard') &&
    read('test/module-09-telemetry-aggregation-query.contract.spec.ts').includes('DeviceAccessGuard') &&
    read('test/g1-super-devices-security.contract.spec.ts').includes("fetch('/api/super/platform-devices')") &&
    read('test/module-10-dashboard-api.contract.spec.ts').includes("ADMIN_ROLES.has(actorMembership.role)") &&
    read('test/space-http.contract.spec.ts').includes('AccessibleSpaceController') &&
    read('test/g1-notifications-screen.contract.spec.ts').includes("redirect('/tenant/temuan')") &&
    read('test/g1-mobile-final.contract.spec.ts').includes('loadMobileAlerts') &&
    read('test/g1-commands-screen.contract.spec.ts').includes('encodeURIComponent(targetId)') &&
    read('test/module-10-telemetry-widget-query-integration.contract.spec.ts').includes('DeviceModule'),
);
const unitRegressionSelfTestR24 = read('scripts/self-test-unit-runtime-regressions.mjs');
const commandControllerSpecR24 = read('src/device/command.controller.spec.ts');
const telemetryControllerSpecR24 = read('src/telemetry/telemetry.controller.spec.ts');
const schedulerDueRunSpecR24 = read('src/scheduler/schedule-due-run.service.spec.ts');
check(
  'controller delegation unit tests no longer resolve unrelated authorization guard dependencies',
  existsSync(join(root, 'scripts/self-test-unit-runtime-regressions.mjs')) &&
    read('package.json').includes('rescue:unit-regressions:self-test') &&
    !commandControllerSpecR24.includes("from '@nestjs/testing'") &&
    !telemetryControllerSpecR24.includes("from '@nestjs/testing'") &&
    commandControllerSpecR24.includes('new CommandController(') &&
    telemetryControllerSpecR24.includes('new TelemetryController(') &&
    unitRegressionSelfTestR24.includes('Nest guard-container resolution'),
);
check(
  'scheduler failed-scene test preserves the claimedAt lease ownership token',
  schedulerDueRunSpecR24.includes("status: 'CLAIMED',\n        claimedAt: databaseNow,") &&
    read('src/scheduler/schedule-due-run.service.ts').includes('claimedAt: claimToken') &&
    unitRegressionSelfTestR24.includes('claimedAt ownership token'),
);
check(
  'unit regression self-test resolves repository root portably on Windows',
  unitRegressionSelfTestR24.includes("resolve(import.meta.dirname, '..')") &&
    !unitRegressionSelfTestR24.includes('.pathname'),
);

const dashboardWidgetIntegrationR26 = read('test/integration/dashboard-widget-query.integration-spec.ts');
const dashboardIntegrationSelfTestR26 = read('scripts/self-test-dashboard-widget-integration-access.mjs');
check(
  'dashboard telemetry integration fixture honors centralized MEMBER device authorization',
  dashboardWidgetIntegrationR26.includes('const deviceAccess = new DeviceAccessService(prismaService);') &&
    dashboardWidgetIntegrationR26.includes('ownerId: user.id,') &&
    dashboardWidgetIntegrationR26.includes("{ tenantId, membershipId, userId, role: 'MEMBER' }") &&
    dashboardIntegrationSelfTestR26.includes('production filtering remains fail-closed'),
);

check(
  'automation persistence logs activation state with literal structured event names',
  read('src/automation/automation.repository.ts').includes("event: 'automation.persistence.activated'") &&
    read('src/automation/automation.repository.ts').includes("event: 'automation.persistence.deactivated'") &&
    !read('src/automation/automation.repository.ts').includes('event: input.enabled'),
);
check(
  'automated acceptance report is source-fingerprinted before manual runtime evidence',
  acceptanceRunner.includes('packageLockSha256') &&
    acceptanceRunner.includes('baselineManifestSha256') &&
    acceptanceRunner.includes('repositoryTreeSha256') &&
    acceptanceRunner.includes('sourceFingerprint'),
);
const evidenceInitializer = read('scripts/init-rescue-02b-evidence.mjs');
const evidenceValidator = read('scripts/validate-rescue-02b-evidence.mjs');
const acceptanceGuide = read('ops/acceptance/README.md');
check(
  'RESCUE-02B evidence initializer and validator are source-controlled and fail closed',
  existsSync(join(root, 'scripts/init-rescue-02b-evidence.mjs')) &&
    existsSync(join(root, 'scripts/validate-rescue-02b-evidence.mjs')) &&
    existsSync(join(root, 'ops/acceptance/rescue-02b-evidence.example.json')) &&
    read('package.json').includes('rescue:evidence:init') &&
    read('package.json').includes('rescue:evidence:validate') &&
    evidenceInitializer.includes("status !== 'AUTOMATED_TEST_SUITE_PASS'") &&
    evidenceInitializer.includes('requiredAutomatedSteps') &&
    evidenceInitializer.includes('does not match the current source baseline') &&
    evidenceValidator.includes("row.status !== 'PASS'") &&
    evidenceValidator.includes('source fingerprint') &&
    evidenceValidator.includes('RESCUE-02B EVIDENCE PASS'),
);
check(
  'runtime evidence keeps physical ESP32/HIL separate from automated Wave 3 simulation',
  evidenceValidator.includes('REQUIRED_RUNTIME_FLOW') &&
    evidenceValidator.includes('REQUIRED_BROKER') &&
    evidenceValidator.includes('REQUIRED_HARDWARE') &&
    evidenceValidator.includes("['DEFERRED', 'PASS']") &&
    acceptanceGuide.includes('Physical OTA/HIL remains') &&
    read('docs/RESCUE-02-RUNTIME-RUNBOOK.md').includes('Auditable final RESCUE-02B evidence gate'),
);
check(
  'generated runtime acceptance evidence is excluded without hiding nested application report routes',
  read('.gitignore').includes('/reports/') &&
    !read('.gitignore').split(/\r?\n/).some((line) => line.trim() === 'reports/') &&
    acceptanceGuide.includes('generated under `reports/`') &&
    existsSync(join(root, 'apps/admin-web/app/super/reports/page.tsx')) &&
    existsSync(join(root, 'apps/admin-web/app/api/super/reports/tenant-summary/route.ts')),
);

const emqxConfigure = read('scripts/configure-emqx-http-auth.mjs');
check(
  'EMQX bootstrap helper loads selected env file',
  emqxConfigure.includes("value.startsWith('--env=')") &&
    emqxConfigure.includes('const env = { ...parseEnv(envPath), ...process.env };'),
);

// RESCUE-03 R2 platform-scope UI guardrails.
const superDashboard = read('apps/admin-web/app/super/dashboard/page.tsx');
const superDevices = read('apps/admin-web/components/super-devices-content.tsx');
const superMonitoring = read('apps/admin-web/components/super-monitoring-content.tsx');
const superTelemetry = read('apps/admin-web/app/super/telemetry/telemetry-center-content.tsx');
const platformDeviceController = read('src/admin-operations/admin-device-provisioning.controller.ts');
const adminOpsModule = read('src/admin-operations/admin-operations.module.ts');
const superReports = read('apps/admin-web/app/super/reports/page.tsx');
const superReportsContent = read('apps/admin-web/components/super-reports-content.tsx');
check(
  'super dashboard is platform-scoped and health is evidence-based',
  superDashboard.includes("fetch('/api/super/platform-devices')") &&
    superDashboard.includes("fetch('/api/super/tenants')") &&
    superDashboard.includes("fetch('/api/super/health')") &&
    !superDashboard.includes("fetch('/api/admin/operational-summary')") &&
    !superDashboard.includes("fetch('/api/admin/devices')") &&
    !superDashboard.includes("Commands', href: '/super/commands'"),
);
check(
  'super device directory never falls back to active tenant scope',
  superDevices.includes("fetch('/api/super/platform-devices')") &&
    !superDevices.includes("fetch('/api/admin/devices')") &&
    superDevices.includes('tenantName'),
);
check(
  'super monitoring reads readiness and platform directories',
  superMonitoring.includes("fetch('/api/super/health')") &&
    superMonitoring.includes("fetch('/api/super/platform-devices')") &&
    superMonitoring.includes("fetch('/api/super/tenants')") &&
    !superMonitoring.includes("fetch('/api/admin/operational-summary')"),
);
check(
  'platform telemetry route resolves real device tenant before aggregation',
  platformDeviceController.includes("@Get('platform-devices/:deviceId/telemetry/aggregate')") &&
    platformDeviceController.includes('select: { tenantId: true }') &&
    platformDeviceController.includes('this.telemetryAggregation.getAggregate(') &&
    adminOpsModule.includes('TelemetryModule'),
);
check(
  'platform capability registry exposes device identity for telemetry selection',
  platformDeviceController.includes('deviceId: cap.device?.id ?? null'),
);
check(
  'super telemetry is platform-scoped and numeric-capability driven',
  superTelemetry.includes("fetch('/api/super/platform-devices')") &&
    superTelemetry.includes("fetch('/api/super/capabilities')") &&
    superTelemetry.includes('/api/super/telemetry-chart?') &&
    !superTelemetry.includes('/api/admin/devices') &&
    !superTelemetry.includes('/api/admin/telemetry-chart'),
);
check(
  'super reports are backed by a platform report contract and export only returned rows',
  superReports.includes('<SuperReportsContent />') &&
    superReportsContent.includes("fetch(`/api/super/reports/tenant-summary?hours=${hours}`)") &&
    superReportsContent.includes('Snapshot server-generated') &&
    superReportsContent.includes('Export CSV') &&
    !superReportsContent.includes('static report'),
);



// RESCUE-03 R3 end-user device authorization and product-neutral UI guardrails.
const deviceAccessGuard = read('src/device/device-access.guard.ts');
const deviceAccessServiceR4 = read('src/device/device-access.service.ts');
const commandControllerR3 = read('src/device/command.controller.ts');
const deviceControllerR3 = read('src/device/device.controller.ts');
const deviceServiceR3 = read('src/device/device.service.ts');
const capabilityControllerR3 = read('src/device/capability.controller.ts');
const telemetryControllerR3 = read('src/telemetry/telemetry.controller.ts');
const telemetryStreamControllerR3 = read('src/telemetry/telemetry-stream.controller.ts');
const telemetryAggregationControllerR3 = read('src/telemetry/telemetry-aggregation.controller.ts');
const deviceModuleR3 = read('src/device/device.module.ts');
const mobileCanonicalAppR3 = read('apps/user-mobile/App.tsx');
const mobileAuthenticatedShellR3 = read('apps/user-mobile/src/ui/mobile-authenticated-shell.tsx');
const userManifestR3 = read('apps/user-web/app/manifest.ts');
const tenantDashboardR3 = read('apps/admin-web/app/tenant/dashboard/page.tsx');
check(
  'device access service centralizes owner/share VIEW and CONTROL authorization',
  deviceAccessGuard.includes("export type DeviceAccessLevel = 'VIEW' | 'CONTROL'") &&
    deviceAccessGuard.includes('this.access.resolveOne(') &&
    deviceAccessServiceR4.includes("source: 'OWNER'") &&
    deviceAccessServiceR4.includes("source: 'CONTROL_SHARE'") &&
    deviceAccessServiceR4.includes("source: hasView ? 'VIEW_SHARE' : 'NONE'") &&
    deviceAccessServiceR4.includes('ShareGrantStatus.ACTIVE') &&
    deviceAccessServiceR4.includes('expiresAt: { gt: databaseNow }'),
);
check(
  'command publish requires CONTROL while command history requires VIEW',
  commandControllerR3.includes("@RequireDeviceAccess('CONTROL')") &&
    commandControllerR3.includes("@RequireDeviceAccess('VIEW')") &&
    commandControllerR3.includes('DeviceAccessGuard'),
);
check(
  'device detail and health require VIEW access',
  deviceControllerR3.includes("@Get(':id')\n  @RequireDeviceAccess('VIEW')") &&
    deviceControllerR3.includes("@Get(':id/health')\n  @RequireDeviceAccess('VIEW')"),
);
check(
  'telemetry latest and history require VIEW access',
  telemetryControllerR3.includes("@Get('latest')\n  @RequireDeviceAccess('VIEW')") &&
    telemetryControllerR3.includes("@Get('history')\n  @RequireDeviceAccess('VIEW')") &&
    telemetryAggregationControllerR3.includes("@Get('aggregate')\n  @RequireDeviceAccess('VIEW')"),
);
check(
  'telemetry SSE stream requires VIEW before realtime frames are opened',
  telemetryStreamControllerR3.includes("@Sse('stream')\n  @RequireDeviceAccess('VIEW')") &&
    telemetryStreamControllerR3.includes('DeviceAccessGuard'),
);
check(
  'capability reads inherit device VIEW authorization',
  capabilityControllerR3.includes("@Get()\n  @RequireDeviceAccess('VIEW')") &&
    capabilityControllerR3.includes("@RequirePermission('device.update')") &&
    capabilityControllerR3.includes('RbacPermissionGuard') &&
    capabilityControllerR3.includes('DeviceAccessGuard'),
);
check(
  'MEMBER device directory is owner-or-active-share scoped',
  deviceServiceR3.includes("access.role === 'ADMIN' || access.role === 'PLATFORM_ADMIN'") &&
    deviceServiceR3.includes('{ ownerId: access.userId }') &&
    deviceServiceR3.includes('grantedToMembershipId: access.membershipId') &&
    deviceServiceR3.includes("status: 'ACTIVE'") &&
    deviceServiceR3.includes('expiresAt: { gt: databaseNow }'),
);
check(
  'device module exports centralized access service and guard',
  deviceControllerR3.includes("@RequirePermission('device.update')") &&
    deviceModuleR3.includes('DeviceAccessService') &&
    deviceModuleR3.includes('DeviceAccessGuard') &&
    deviceModuleR3.includes('exports: [') &&
    deviceModuleR3.includes('DeviceAccessService, DeviceAccessGuard'),
);
check(
  'active tenant and user surfaces are product-neutral rather than home/hotel specific',
  tenantDashboardR3.includes('title="Dashboard Tenant"') &&
    mobileAuthenticatedShellR3.includes('MobileDashboardScreen') &&
    (userManifestR3.includes("name: 'IoT Platform — Dashboard'") || userManifestR3.includes("name: 'IoT Platform — User Workspace'")) &&
    !userManifestR3.toLowerCase().includes('rumah') &&
    !mobileCanonicalAppR3.includes('Tidak ada alert aktif'),
);
check(
  'obsolete second-generation mobile app surface is removed',
  !existsSync(join(root, 'apps/user-mobile/src/app/mobile-app.tsx')) &&
    !existsSync(join(root, 'apps/user-mobile/src/app/mobile-app.spec.tsx')) &&
    !existsSync(join(root, 'apps/user-mobile/src/app/index.ts')),
);


// RESCUE-03 R4 shared-dashboard authorization + end-user SWITCH control guardrails.
const dashboardServiceR4 = read('src/dashboard/dashboard.service.ts');
const dashboardModuleR4 = read('src/dashboard/dashboard.module.ts');
const userWebCommandRouteR4 = read('apps/user-web/app/api/device-command/route.ts');
const userWebWidgetR4 = read('apps/user-web/components/widget-card.tsx');
const mobileWidgetR4 = read('apps/user-mobile/src/ui/mobile-dashboard-widget.tsx');
const mobileCanonicalAppR4 = read('apps/user-mobile/App.tsx');
check(
  'shared dashboard bindings are filtered by device VIEW before aggregate/resolution data reaches MEMBER',
  dashboardModuleR4.includes('DeviceModule') &&
    dashboardServiceR4.includes('filterAggregateDeviceAccess') &&
    dashboardServiceR4.includes('filterResolutionDeviceAccess') &&
    dashboardServiceR4.includes('decisions.get(binding.deviceId)?.canView === true') &&
    dashboardServiceR4.includes('if (!decision?.canView) return [];'),
);
const dashboardRepositoryR4 = read('src/dashboard/dashboard.repository.ts');
const dashboardServiceSpecR4 = read('src/dashboard/dashboard.service.spec.ts');
check(
  'dashboard create/replace validates MEMBER bindings against VIEW or CONTROL before persistence',
  dashboardServiceR4.includes('assertDashboardBindingAccess(context, dto.bindings)') &&
    dashboardServiceR4.includes("binding.intent === 'WRITE' || binding.mode === 'COMMAND'") &&
    dashboardServiceR4.includes('decision?.canControl === true') &&
    dashboardServiceR4.includes('decision?.canView === true') &&
    dashboardServiceSpecR4.includes('rejects MEMBER dashboard WRITE bindings without device CONTROL') &&
    dashboardServiceSpecR4.includes('allows MEMBER dashboard READ bindings with device VIEW'),
);
check(
  'dashboard shared-admin semantics consistently include PLATFORM_ADMIN',
  dashboardServiceR4.includes("context.role === ADMIN_ROLE || context.role === 'PLATFORM_ADMIN'") &&
    dashboardRepositoryR4.includes("const ADMIN_ROLES = new Set(['ADMIN', 'PLATFORM_ADMIN'])") &&
    dashboardRepositoryR4.includes('canManageShared && ADMIN_ROLES.has(actorMembership.role)') &&
    dashboardServiceSpecR4.includes('treats PLATFORM_ADMIN as shared-dashboard administrator'),
);
check(
  'view-only shared dashboard capability cannot advertise writable control',
  dashboardServiceR4.includes('decision.canControl') &&
    dashboardServiceR4.includes('isWritable: false') &&
    dashboardServiceR4.includes('both technical capability and the current user'),
);
check(
  'user web SWITCH control is dynamic, session-backed, and permission-aware',
  userWebCommandRouteR4.includes('SessionBackendClient.create()') &&
    userWebCommandRouteR4.includes('payload: { [body.capabilityKey]: body.value }') &&
    userWebCommandRouteR4.includes("import { randomUUID } from 'node:crypto';") &&
    userWebCommandRouteR4.includes('user-web-${randomUUID()}') &&
    userWebWidgetR4.includes("capability?.dataType === 'boolean'") &&
    userWebWidgetR4.includes('capability.access.writable') &&
    userWebWidgetR4.includes("fetch('/api/device-command'") &&
    !userWebWidgetR4.includes("'switch.power'"),
);
check(
  'mobile canonical SWITCH control uses resolver entitlement and dynamic capability key',
  mobileCanonicalAppR4.includes('sendBooleanCapabilityCommand') &&
    mobileWidgetR4.includes("capability?.dataType === 'boolean'") &&
    mobileWidgetR4.includes('capability.access.writable') &&
    mobileWidgetR4.includes('const result = await onSendCommand(') &&
    mobileWidgetR4.includes('binding.device!.id') &&
    mobileWidgetR4.includes('capability!.key') &&
    mobileDeviceClient.includes('payload: { [capabilityKey]: value }'),
);
check(
  'end-user control UI never fabricates final device state before ACK or telemetry',
  userWebWidgetR4.includes('UI tidak mengasumsikan status perangkat sebelum ACK/telemetry diterima') &&
    mobileMessagesControlEvidence(),
);

function mobileMessagesControlEvidence() {
  const messages = read('apps/user-mobile/src/localization/messages.ts');
  return messages.includes('status aktual menunggu ACK/telemetry') &&
    messages.includes('Status aktual tetap mengikuti ACK/telemetry') &&
    messages.includes('controls appear only with CONTROL permission');
}

// RESCUE-03 R5 command reconciliation + canonical mobile cleanup guardrails.
const commandServiceR5 = read('src/device/command.service.ts');
const commandControllerR5 = read('src/device/command.controller.ts');
const userWebGridR5 = read('apps/user-web/components/dashboard-grid.tsx');
const userWebExperienceR5 = read('apps/user-web/components/dashboard-experience.tsx');
const mobileDeviceSpecR5 = read('apps/user-mobile/src/device-control/mobile-device-client.spec.ts');
check(
  'command status lookup is tenant/device scoped and exposed behind VIEW access',
  commandServiceR5.includes('async getByCorrelationId(') &&
    commandServiceR5.includes("where: { correlationId: normalizedCorrelationId }") &&
    commandServiceR5.includes('command.tenantId !== tenantId') &&
    commandServiceR5.includes('command.deviceId !== deviceId') &&
    commandControllerR5.includes("@Get(':commandId')") &&
    commandControllerR5.includes("@RequireDeviceAccess('VIEW')"),
);
check(
  'user web reconciles command status before refreshing dashboard state',
  userWebCommandRouteR4.includes('export async function GET(request: Request)') &&
    userWebCommandRouteR4.includes('/commands/${encodeURIComponent(commandId)}') &&
    userWebWidgetR4.includes('reconcileCommand(') &&
    userWebWidgetR4.includes("'ACKNOWLEDGED'") &&
    userWebWidgetR4.includes("'TIMED_OUT'") &&
    userWebGridR5.includes('onCommandSettled') &&
    userWebExperienceR5.includes('onCommandSettled={() =>'),
);
check(
  'mobile canonical control reconciles terminal command status and refreshes authorized dashboard',
  mobileDeviceClient.includes('loadMobileCommandStatus(') &&
    mobileDeviceClient.includes('reconcileMobileCommand(') &&
    mobileCanonicalAppR4.includes('reconcileMobileCommand') &&
    mobileCanonicalAppR4.includes('if (settled.terminal)') &&
    mobileDeviceSpecR5.includes('reconciles a command until a terminal device result is observed'),
);
check(
  'end-user command reconciliation never treats SENT/PENDING as final device state',
  userWebWidgetR4.includes("case 'SENT':") &&
    userWebWidgetR4.includes("case 'PENDING':") &&
    mobileWidgetR4.includes('commandFeedback(result.status)') &&
    read('apps/user-mobile/src/localization/messages.ts').includes('Command masih menunggu ACK perangkat'),
);

check(
  'canonical mobile shell preserves five-tab blueprint on the secure Expo root',
  read('apps/user-mobile/src/ui/mobile-authenticated-shell.tsx').includes("{ key: 'home', label: 'Home' }") &&
    read('apps/user-mobile/src/ui/mobile-authenticated-shell.tsx').includes("{ key: 'devices', label: 'Devices' }") &&
    read('apps/user-mobile/src/ui/mobile-authenticated-shell.tsx').includes("{ key: 'realtime', label: 'Realtime' }") &&
    read('apps/user-mobile/src/ui/mobile-authenticated-shell.tsx').includes("{ key: 'alerts', label: 'Alerts' }") &&
    read('apps/user-mobile/src/ui/mobile-authenticated-shell.tsx').includes("{ key: 'profile', label: 'Profile' }") &&
    read('apps/user-mobile/src/ui/mobile-authenticated-shell.tsx').includes('loadMobileDevices(mobileSessionClient)') &&
    read('apps/user-mobile/src/ui/mobile-authenticated-shell.tsx').includes('loadLatestTelemetry(mobileSessionClient, deviceId)') &&
    read('apps/user-mobile/src/ui/mobile-authenticated-shell.tsx').includes('<MobileDeviceDetailPanel') &&
    read('apps/user-mobile/src/ui/mobile-authenticated-shell.tsx').includes('<MobileAlertsPanel') &&
    read('apps/user-mobile/src/ui/mobile-alerts-panel.tsx').includes('bukan jaminan all-clear'),
);


// RESCUE-03 R6 operator truthfulness / fail-closed data-state guardrails.
const tenantDashboardR6 = read('apps/admin-web/app/tenant/dashboard/page.tsx');
const tenantHistoricalR6 = read('apps/admin-web/components/tenant-historical-content.tsx');
const superRolesR6 = read('apps/admin-web/components/super-roles-content.tsx');
const superProvisioningR6 = read('apps/admin-web/components/super-provisioning-content.tsx');
const superMqttR6 = read('apps/admin-web/components/super-mqtt-content.tsx');
check(
  'tenant dashboard distinguishes backend failure from genuine zero/empty data',
  tenantDashboardR6.includes('const [deviceError, setDeviceError]') &&
    tenantDashboardR6.includes('const [roomError, setRoomError]') &&
    tenantDashboardR6.includes('const [sceneError, setSceneError]') &&
    tenantDashboardR6.includes('backend tidak tersedia') &&
    tenantDashboardR6.includes('Data ruangan tidak dapat dimuat dari backend.') &&
    !tenantDashboardR6.includes('else {\n        setDevices([]);') &&
    !tenantDashboardR6.includes('else {\n        setRooms([]);'),
);
check(
  'tenant dashboard telemetry differentiates unreachable backend from valid empty telemetry',
  tenantDashboardR6.includes('let hadSuccessfulResponse = false;') &&
    tenantDashboardR6.includes('hadSuccessfulResponse = true;') &&
    tenantDashboardR6.includes('Telemetri tidak dapat dimuat dari backend saat ini.') &&
    tenantDashboardR6.includes('Belum ada data telemetri. Grafik akan muncul setelah perangkat mengirim data.'),
);
check(
  'tenant historical telemetry does not convert transport failure into an empty dataset',
  tenantHistoricalR6.includes('const [telemetryError, setTelemetryError]') &&
    tenantHistoricalR6.includes("setTelemetryError(cause instanceof Error ? cause.message : 'gagal memuat telemetri')") &&
    tenantHistoricalR6.includes('Data telemetri gagal dimuat') &&
    tenantHistoricalR6.includes('Belum ada data agregat untuk rentang ini.'),
);
check(
  'super role directory does not report zero users when the platform directory fails',
  superRolesR6.includes('const [error, setError]') &&
    superRolesR6.includes('Jumlah per role tidak ditampilkan sebagai nol.') &&
    superRolesR6.includes("users === null ? '—'") &&
    superRolesR6.includes('VIEW: owner/VIEW/CONTROL share') &&
    !superRolesR6.includes('device & telemetry: read, command: control'),
);
check(
  'super provisioning distinguishes directory outage from a valid empty tenant/device inventory',
  superProvisioningR6.includes('const [tenantLoadError, setTenantLoadError]') &&
    superProvisioningR6.includes('const [deviceLoadError, setDeviceLoadError]') &&
    superProvisioningR6.includes('Provisioning dinonaktifkan sampai data tenant tersedia.') &&
    superProvisioningR6.includes('Direktori perangkat tidak dapat dimuat') &&
    superProvisioningR6.includes('disabled={busy || Boolean(tenantLoadError) || tenants.length === 0}'),
);
check(
  'super MQTT center displays the canonical broker topics and separates auth from telemetry ingest',
  superMqttR6.includes('tenants/<tenantId>/devices/<deviceId>/telemetry') &&
    superMqttR6.includes('tenants/<tenantId>/devices/<deviceId>/commands') &&
    superMqttR6.includes('tenants/<tenantId>/devices/<deviceId>/commands/ack') &&
    superMqttR6.includes('POST /mqtt/auth') &&
    superMqttR6.includes('POST /mqtt/webhook/telemetry') &&
    !superMqttR6.includes("'<tenant>/<device>/ack'"),
);

check(
  'official rescue runtime npm command is strict by default',
  read('package.json').includes('"rescue:runtime:check": "node scripts/check-rescue-runtime.mjs --strict"') &&
    read('docs/RESCUE-02-RUNTIME-RUNBOOK.md').includes('`npm run rescue:runtime:check` is strict by default'),
);

// RESCUE-03 R7 dependency-catalog / history fail-closed guardrails.
const superApiKeysR7 = read('apps/admin-web/components/super-api-keys-content.tsx');
const superUsersR7 = read('apps/admin-web/components/super-users-content.tsx');
const tenantAutomationR7 = read('apps/admin-web/components/tenant-automation-content.tsx');
const tenantScenesR7 = read('apps/admin-web/components/tenant-scenes-content.tsx');
const tenantSchedulesR7 = read('apps/admin-web/components/tenant-schedules-content.tsx');
check(
  'super API key UI distinguishes API-key and tenant-directory failure from valid empty data',
  superApiKeysR7.includes('const [error, setError]') &&
    superApiKeysR7.includes('const [tenantError, setTenantError]') &&
    superApiKeysR7.includes('Direktori API key tidak dapat dimuat') &&
    superApiKeysR7.includes('Pembuatan API key dinonaktifkan sampai data tenant berhasil dimuat') &&
    superApiKeysR7.includes('disabled={busy !== null || Boolean(tenantError) || tenants.length === 0}') &&
    superApiKeysR7.includes('setOperationError(cause instanceof Error ? cause.message : \'Gagal mencabut API key\')'),
);
check(
  'super user provisioning fails closed when tenant directory is unavailable',
  superUsersR7.includes('const [tenantError, setTenantError]') &&
    superUsersR7.includes('Pembuatan pengguna dinonaktifkan sampai data tenant berhasil dimuat') &&
    superUsersR7.includes('disabled={busy || Boolean(tenantError) || tenants.length === 0}'),
);
check(
  'tenant automation and scene builders fail closed on device/capability catalog outage',
  tenantAutomationR7.includes('const [catalogError, setCatalogError]') &&
    tenantAutomationR7.includes('Pembuatan otomasi dinonaktifkan sampai katalog berhasil dimuat') &&
    tenantAutomationR7.includes('if (!res.ok) throw new Error(`capability backend ${res.status}`)') &&
    tenantScenesR7.includes('const [catalogError, setCatalogError]') &&
    tenantScenesR7.includes('Pembuatan scene dinonaktifkan sampai katalog berhasil dimuat') &&
    tenantScenesR7.includes('if (!res.ok) throw new Error(`capability backend ${res.status}`)'),
);
check(
  'tenant schedule builder fails closed when scene catalog is unavailable',
  tenantSchedulesR7.includes('const [sceneCatalogError, setSceneCatalogError]') &&
    tenantSchedulesR7.includes('Pembuatan jadwal dinonaktifkan sampai scene berhasil dimuat') &&
    tenantSchedulesR7.includes('disabled={busy !== null || Boolean(sceneCatalogError) || scenes.length === 0}'),
);
check(
  'scene and schedule history distinguish backend failure from a genuine empty history',
  tenantScenesR7.includes('const [historyError, setHistoryError]') &&
    tenantScenesR7.includes('Riwayat eksekusi gagal dimuat') &&
    tenantSchedulesR7.includes('const [historyError, setHistoryError]') &&
    tenantSchedulesR7.includes('Riwayat jadwal gagal dimuat'),
);

const deviceDetailR7 = read('apps/admin-web/components/device-detail-content.tsx');
check(
  'canonical device detail command controls are capability-driven instead of hardcoded keys',
  deviceDetailR7.includes("capabilities.filter((cap) => cap.isWritable)") &&
    deviceDetailR7.includes("cap.dataType === 'boolean'") &&
    deviceDetailR7.includes('sendCommand(true, cap.key)') &&
    deviceDetailR7.includes('sendCommand(false, cap.key)') &&
    !deviceDetailR7.includes("sendCommand(true, 'switch.power')") &&
    !deviceDetailR7.includes("sendCommand('restart', 'device.restart')") &&
    deviceDetailR7.includes('State akhir tetap mengikuti ACK/telemetry perangkat'),
);
check(
  'canonical device detail distinguishes capability telemetry and command-history failures from empty data',
  deviceDetailR7.includes('const [capabilityError, setCapabilityError]') &&
    deviceDetailR7.includes('const [commandHistoryError, setCommandHistoryError]') &&
    deviceDetailR7.includes('const [telemetryError, setTelemetryError]') &&
    deviceDetailR7.includes('Capability tidak dapat dimuat') &&
    deviceDetailR7.includes('Telemetry gagal dimuat') &&
    deviceDetailR7.includes('Riwayat command gagal dimuat'),
);


// RESCUE-03 R8 typed capability semantics guardrails.
const capabilityValueR8 = read('apps/admin-web/lib/capability-value.ts');
const capabilityValueInputR8 = read('apps/admin-web/components/capability-value-input.tsx');
const deviceControlProxyR8 = read('apps/admin-web/app/api/devices/[deviceId]/commands/route.ts');
check(
  'capability value parser preserves declared data types instead of generic string coercion',
  capabilityValueR8.includes("case 'string':") &&
    capabilityValueR8.includes('return { ok: true, value: raw };') &&
    capabilityValueR8.includes("case 'integer':") &&
    capabilityValueR8.includes("case 'number':") &&
    capabilityValueR8.includes("case 'enum':") &&
    capabilityValueR8.includes("case 'object':") &&
    capabilityValueR8.includes('JSON.parse(raw)') &&
    capabilityValueR8.includes('constraints.precision'),
);
check(
  'scene and automation actions use typed capability parsing and reset stale values when capability changes',
  tenantAutomationR7.includes("import { parseCapabilityValue } from '@/lib/capability-value';") &&
    tenantAutomationR7.includes('parseCapabilityValue(a.value, capability)') &&
    tenantAutomationR7.includes("capabilityKey: c?.key ?? '', value: ''") &&
    tenantScenesR7.includes("import { parseCapabilityValue } from '@/lib/capability-value';") &&
    tenantScenesR7.includes('parseCapabilityValue(a.value, capability)') &&
    tenantScenesR7.includes("capabilityKey: c?.key ?? '', value: ''"),
);
check(
  'typed capability input renders boolean enum numeric object and string-safe controls',
  capabilityValueInputR8.includes("dataType === 'boolean'") &&
    capabilityValueInputR8.includes("dataType === 'enum'") &&
    capabilityValueInputR8.includes("dataType === 'integer' || dataType === 'number'") &&
    capabilityValueInputR8.includes("dataType === 'object'") &&
    capabilityValueInputR8.includes('constraints.enumValues'),
);
check(
  'device detail supports typed non-boolean commands and capability constraints',
  deviceDetailR7.includes('const [capabilityDataType, setCapabilityDataType]') &&
    deviceDetailR7.includes('name="enumValues"') &&
    deviceDetailR7.includes('name="precision"') &&
    deviceDetailR7.includes('parseCapabilityValue(raw, capability)') &&
    deviceDetailR7.includes('<CapabilityValueInput') &&
    deviceControlProxyR8.includes('value?: unknown'),
);


const sceneRepositoryR8 = read('src/scene/scene.repository.ts');
const scenePersistenceSpecR8 = read('src/scene/scene.persistence.spec.ts');
check(
  'automation builder only offers backend-supported trigger/action capability contracts',
  tenantAutomationR7.includes('c.isReportable === true') &&
    tenantAutomationR7.includes("['boolean', 'number', 'string'].includes(String(c.dataType ?? '').toLowerCase())") &&
    tenantAutomationR7.includes('capability.isWritable !== true') &&
    tenantAutomationR7.includes('parseCapabilityValue(a.value, capability)'),
);
check(
  'scene builder excludes unsupported object actions while preserving typed primitive capability values',
  tenantScenesR7.includes("String(c.dataType ?? '').toLowerCase() !== 'object'") &&
    tenantScenesR7.includes('capability.isWritable !== true') &&
    tenantScenesR7.includes('parseCapabilityValue(a.value, capability)'),
);
check(
  'scene persistence validates tenant device capability identity writability and value before create',
  sceneRepositoryR8.includes('transaction.capability.findMany') &&
    sceneRepositoryR8.includes('device: { tenantId }') &&
    sceneRepositoryR8.includes('Scene action capability does not belong to the selected tenant device') &&
    sceneRepositoryR8.includes('if (!capability.isWritable)') &&
    sceneRepositoryR8.includes('this.capabilityValidator.validateValue(action.value, capability)') &&
    scenePersistenceSpecR8.includes('rejects a scene action whose capability target is not tenant/device scoped') &&
    scenePersistenceSpecR8.includes('validates a scene action value against the resolved writable capability before persistence'),
);

// FOUNDATION-ALIGNMENT F1/F2 — automation activation/runtime + typed Command Center.
const automationControllerFoundation = read('src/automation/automation.controller.ts');
const automationRepositoryFoundation = read('src/automation/automation.repository.ts');
const automationRuntimePolicyFoundation = read('src/automation/automation-runtime-policy.ts');
const rescueEnvFoundation = read('ops/env/rescue-local.env.example');
const automationUiFoundation = read('apps/admin-web/components/tenant-automation-content.tsx');
const tenantCommandsFoundation = read('apps/admin-web/components/tenant-commands-content.tsx');
check(
  'automation activation is explicit owner-scoped revision-protected and target-revalidated',
  automationControllerFoundation.includes("@Post(':automationId/activate')") &&
    automationControllerFoundation.includes("@Post(':automationId/deactivate')") &&
    automationControllerFoundation.includes('expectedRevision') &&
    automationRepositoryFoundation.includes('async setOwnedAutomationEnabled(') &&
    automationRepositoryFoundation.includes('if (existing.revision !== input.expectedRevision)') &&
    automationRepositoryFoundation.includes('const definition = this.definitionFromAggregate(existing);') &&
    automationRepositoryFoundation.includes('await this.resolveTargets(transaction, input.tenantId, definition);'),
);
check(
  'automation runtime remains fail-closed behind one explicit environment policy',
  automationRuntimePolicyFoundation.includes("AUTOMATION_RUNTIME_ENABLED_ENV = 'AUTOMATION_RUNTIME_ENABLED'") &&
    automationRuntimePolicyFoundation.includes('Readonly<Record<string, string | undefined>>') &&
    !automationRuntimePolicyFoundation.includes('env: NodeJS.ProcessEnv') &&
    automationRuntimePolicyFoundation.includes(".toLowerCase() === 'true'") &&
    read('src/telemetry/telemetry.service.ts').includes('isAutomationRuntimeEnabled()') &&
    automationControllerFoundation.includes('if (!isAutomationRuntimeEnabled())') &&
    rescueEnvFoundation.includes('AUTOMATION_RUNTIME_ENABLED=true') &&
    read('.env.example').includes('AUTOMATION_RUNTIME_ENABLED=false') &&
    runtimeChecker.includes("'env:AUTOMATION_RUNTIME_ENABLED'") &&
    runtimeChecker.includes('must be true for automation runtime acceptance'),
);
check(
  'tenant automation UI truthfully distinguishes persisted activation from runtime availability',
  automationUiFoundation.includes('runtimeEnabled') &&
    automationUiFoundation.includes("const operation = enabled ? 'activate' : 'deactivate';") &&
    automationUiFoundation.includes('/${operation}`') &&
    automationUiFoundation.includes('AKTIF · RUNTIME OFF') &&
    automationUiFoundation.includes('AUTOMATION_RUNTIME_ENABLED=true') &&
    !automationUiFoundation.includes('aktivasi menyusul'),
);
check(
  'tenant Command Center selects real writable capabilities and uses shared typed parsing',
  tenantCommandsFoundation.includes("fetch(`/api/admin/device-capabilities?deviceId=${encodeURIComponent(targetId)}`)") &&
    tenantCommandsFoundation.includes('capability.isWritable === true') &&
    tenantCommandsFoundation.includes('<CapabilityValueInput') &&
    tenantCommandsFoundation.includes('parseCapabilityValue(value, selectedCapability)') &&
    tenantCommandsFoundation.includes('capabilityKey: selectedCapability.key') &&
    tenantCommandsFoundation.includes('state akhir tetap menunggu ACK/telemetry perangkat') &&
    !tenantCommandsFoundation.includes("useState('relay.state')") &&
    !tenantCommandsFoundation.includes('parsed = Number(value)') &&
    !tenantCommandsFoundation.includes("v === 'true' ? 'NYALA' : 'MATI'"),
);

// FOUNDATION-ALIGNMENT F3/F4/F5 — truthful findings/OTA + room-centric User Web.
const tenantFindingsPageFoundation = read('apps/admin-web/app/tenant/temuan/page.tsx');
const legacyNotificationsPageFoundation = read('apps/admin-web/app/tenant/notifikasi/page.tsx');
const firmwareUiFoundation = read('apps/admin-web/components/super-firmware-content.tsx');
const accessibleSpaceControllerFoundation = read('src/space/accessible-space.controller.ts');
const accessibleSpaceServiceFoundation = read('src/space/accessible-space.service.ts');
const userWorkspaceUiFoundation = read('apps/user-web/components/room-workspace-experience.tsx');
const userDeviceDetailFoundation = read('apps/user-web/components/device-detail-experience.tsx');
const userWorkspaceProxyFoundation = read('apps/user-web/app/api/workspace/route.ts');
const userDeviceDetailProxyFoundation = read('apps/user-web/app/api/devices/[deviceId]/route.ts');
const userRootFoundation = read('apps/user-web/app/page.tsx');
check(
  'tenant analytics findings has a truthful canonical surface and notification compatibility redirect',
  tenantFindingsPageFoundation.includes('title="Temuan Analitik"') &&
    tenantShell.includes("href: '/tenant/temuan'") &&
    tenantShell.includes("label: 'Temuan Analitik'") &&
    notificationsUi.includes("fetch('/api/admin/analytics-findings?limit=50')") &&
    notificationsUi.includes('bukan riwayat delivery notifikasi') &&
    legacyNotificationsPageFoundation.includes("redirect('/tenant/temuan')") &&
    !tenantShell.includes("href: '/tenant/notifikasi'"),
);
check(
  'firmware UI distinguishes stored digest/rollout state from byte verification and physical OTA proof',
  firmwareUiFoundation.includes('Digest SHA-256 (metadata)') &&
    firmwareUiFoundation.includes('Selesai Tercatat') &&
    firmwareUiFoundation.includes('tidak membuktikan byte artefak telah diunduh lalu diverifikasi') &&
    firmwareUiFoundation.includes('bukan bukti keberhasilan update fisik pada hardware') &&
    firmwareUiFoundation.includes('Hardware OTA acceptance tetap pending') &&
    !firmwareUiFoundation.includes('verifikasi hash sebelum distribusi') &&
    !firmwareUiFoundation.includes('Perangkat Ter-update'),
);
check(
  'end-user room read model applies owner/share access before room placement grouping',
  accessibleSpaceControllerFoundation.includes("@Get('accessible')") &&
    accessibleSpaceControllerFoundation.includes('@UseGuards(JwtAuthGuard, TenantContextGuard)') &&
    !accessibleSpaceControllerFoundation.includes('AdminRoleGuard') &&
    accessibleSpaceServiceFoundation.includes('await this.devices.findAll(context.tenantId') &&
    accessibleSpaceServiceFoundation.includes('await this.access.resolveMany(') &&
    accessibleSpaceServiceFoundation.includes('if (!decision?.canView) return [];') &&
    accessibleSpaceServiceFoundation.includes('sanitizeDevice(device, decision.canControl, room)') &&
    accessibleSpaceServiceFoundation.includes("placement.room.kind === 'ROOM'") &&
    accessibleSpaceServiceFoundation.includes('Space placement only groups') &&
    userWorkspaceProxyFoundation.includes("client.request('/spaces/accessible')"),
);
check(
  'User Web canonical routes are room-centric and no longer redirect rooms/devices back to root dashboard',
  userRootFoundation.includes("redirect('/beranda')") &&
    !read('apps/user-web/app/beranda/page.tsx').includes("redirect('/')") &&
    !read('apps/user-web/app/ruangan/page.tsx').includes("redirect('/')") &&
    !read('apps/user-web/app/perangkat-saya/page.tsx').includes("redirect('/')") &&
    read('apps/user-web/app/beranda/page.tsx').includes('<RoomWorkspaceExperience mode="home"') &&
    read('apps/user-web/app/ruangan/page.tsx').includes('<RoomWorkspaceExperience mode="rooms"') &&
    read('apps/user-web/app/perangkat-saya/page.tsx').includes('<RoomWorkspaceExperience mode="devices"') &&
    existsSync(join(root, 'apps/user-web/app/dashboard/page.tsx')),
);
check(
  'room-centric user read contract is additively wired and architecture-decision bound',
  read('src/space/space.module.ts').includes('AccessibleSpaceController') &&
    read('src/space/space.module.ts').includes('AccessibleSpaceService') &&
    existsSync(join(root, 'docs/phoenix/adr/ADR-006-user-room-centric-accessible-space-read-model.md')) &&
    read('docs/phoenix/adr/ADR-006-user-room-centric-accessible-space-read-model.md').includes('placement tidak pernah memberikan izin') &&
    read('docs/phoenix/adr/ADR-006-user-room-centric-accessible-space-read-model.md').includes('Tidak ada perubahan Prisma schema'),
);
check(
  'User Web Device Detail is backend-backed and enforces VIEW/CONTROL truthfulness',
  userDeviceDetailProxyFoundation.includes('client.request(`/devices/${encoded}`)') &&
    userDeviceDetailProxyFoundation.includes('client.request(`/devices/${encoded}/capabilities`)') &&
    userDeviceDetailProxyFoundation.includes('client.request(`/devices/${encoded}/telemetry/latest`)') &&
    userDeviceDetailProxyFoundation.includes('client.request(`/devices/${encoded}/commands?limit=20&offset=0`)') &&
    userDeviceDetailProxyFoundation.includes('workspaceDevice.canControl') &&
    userDeviceDetailFoundation.includes("capability.isWritable && capability.dataType.toLowerCase() === 'boolean'") &&
    userDeviceDetailFoundation.includes('Akses Anda VIEW saja. Backend juga akan menolak command tanpa CONTROL.') &&
    userDeviceDetailFoundation.includes('state akhir menunggu ACK/telemetry perangkat') &&
    userDeviceDetailFoundation.includes('TERMINAL_COMMAND_STATES') &&
    userWorkspaceUiFoundation.includes("device.canControl ? 'VIEW + CONTROL' : 'VIEW'"),
);

// FOUNDATION-ALIGNMENT F6 — truthful Device Detail technical evidence + mobile detail/alerts.
const deviceTechnicalControllerFoundation = read('src/device/device-technical-history.controller.ts');
const deviceTechnicalServiceFoundation = read('src/device/device-technical-history.service.ts');
const accessibleAnalyticsControllerFoundation = read('src/analytics/accessible-analytics.controller.ts');
const accessibleAnalyticsServiceFoundation = read('src/analytics/accessible-analytics.service.ts');
const mobileDetailFoundation = read('apps/user-mobile/src/ui/mobile-device-detail-panel.tsx');
const mobileAlertsFoundation = read('apps/user-mobile/src/ui/mobile-alerts-panel.tsx');
check(
  'Device Detail technical history is VIEW-authorized bounded and never invents current firmware/protocol',
  deviceTechnicalControllerFoundation.includes("@Controller('devices/:deviceId/technical-history')") &&
    deviceTechnicalControllerFoundation.includes("@RequireDeviceAccess('VIEW')") &&
    deviceTechnicalServiceFoundation.includes("availability: 'UNAVAILABLE_BY_CONTRACT'") &&
    deviceTechnicalServiceFoundation.includes('artifactBytesVerifiedByPlatform: false') &&
    deviceTechnicalServiceFoundation.includes('physicalInstallProven: false') &&
    deviceTechnicalServiceFoundation.includes('where: { tenantId, deviceId }'),
);
check(
  'end-user analytics Alerts resolve owner/share-visible devices before WARNING/CRITICAL findings',
  accessibleAnalyticsControllerFoundation.includes("@Controller('analytics/alerts')") &&
    accessibleAnalyticsControllerFoundation.includes("@Get('accessible')") &&
    accessibleAnalyticsServiceFoundation.includes('await this.devices.findAll(context.tenantId') &&
    accessibleAnalyticsServiceFoundation.includes('deviceId: { in: ids }') &&
    accessibleAnalyticsServiceFoundation.includes('AnalyticsSeverity.WARNING') &&
    accessibleAnalyticsServiceFoundation.includes('AnalyticsSeverity.CRITICAL') &&
    accessibleAnalyticsServiceFoundation.includes('notificationDeliveryHistory: false'),
);
check(
  'web/admin Device Detail separates command history OTA evidence and analytics findings truthfully',
  read('apps/admin-web/components/device-detail-content.tsx').includes('OTA / Firmware Update Evidence') &&
    read('apps/admin-web/components/device-detail-content.tsx').includes('Module 16 findings, bukan riwayat delivery notifikasi') &&
    !read('apps/admin-web/components/device-detail-content.tsx').includes('Command & Alert History') &&
    userDeviceDetailFoundation.includes('Firmware, Protocol & Update Evidence') &&
    userDeviceDetailFoundation.includes('Current firmware/protocol tidak ditebak') &&
    userDeviceDetailFoundation.includes('Ini bukan riwayat delivery notifikasi'),
);
check(
  'mobile Device Detail exposes backend-backed status telemetry capability command history and technical evidence while settings writes stay closed',
  mobileDeviceClient.includes('loadMobileDeviceDetail(') &&
    mobileDeviceClient.includes('/technical-history') &&
    mobileDetailFoundation.includes('Settings / Technical Identity') &&
    mobileDetailFoundation.includes('Tidak ada mutation settings end-user yang dibuka tanpa kontrak backend nyata') &&
    mobileDetailFoundation.includes('Rollout state bukan bukti instalasi firmware fisik') &&
    mobileDetailFoundation.includes('Module 16 findings; bukan delivery notifikasi'),
);
check(
  'mobile Alerts is backend-backed by authorized Module 16 findings and never claims notification delivery',
  mobileDeviceClient.includes("'/analytics/alerts/accessible?limit=50'") &&
    mobileAlertsFoundation.includes('Alerts Analitik') &&
    mobileAlertsFoundation.includes('Ini bukan riwayat delivery notifikasi') &&
    mobileAlertsFoundation.includes('bukan jaminan all-clear') &&
    existsSync(join(root, 'docs/phoenix/adr/ADR-007-device-technical-evidence-and-user-analytics-alert-read-models.md')),
);


// FOUNDATION-ALIGNMENT F8 — Super Admin platform observability/read-model depth.
const platformObservabilityControllerF8 = read('src/admin-operations/admin-platform-observability.controller.ts');
const platformObservabilityServiceF8 = read('src/admin-operations/admin-platform-observability.service.ts');
const superDeviceGroupsF8 = read('apps/admin-web/components/super-device-groups-content.tsx');
const superCredentialsF8 = read('apps/admin-web/components/super-device-credentials-content.tsx');
const superCommandMonitorF8 = read('apps/admin-web/components/super-command-monitor-content.tsx');
const superCapabilitiesF8 = read('apps/admin-web/components/super-capabilities-content.tsx');
check(
  'platform observability controller is platform-admin guarded and additive',
  platformObservabilityControllerF8.includes('@UseGuards(JwtAuthGuard, TenantContextGuard, AdminRoleGuard, PlatformRoleGuard)') &&
    platformObservabilityControllerF8.includes("@Get('platform-device-groups')") &&
    platformObservabilityControllerF8.includes("@Get('platform-device-credentials')") &&
    platformObservabilityControllerF8.includes("@Get('platform-commands')") &&
    platformObservabilityControllerF8.includes("@Get('platform-telemetry/explorer')") &&
    platformObservabilityControllerF8.includes("@Get('platform-reports/tenant-summary')") &&
    adminOpsModule.includes('AdminPlatformObservabilityController') &&
    adminOpsModule.includes('AdminPlatformObservabilityService'),
);
check(
  'platform credential directory never selects or exposes passwordHash/secret material',
  platformObservabilityServiceF8.includes('credential: {\n          select: { id: true, createdAt: true, updatedAt: true },') &&
    platformObservabilityServiceF8.includes('secretMaterialExposed: false') &&
    !platformObservabilityServiceF8.includes('passwordHash: true') &&
    !superCredentialsF8.includes('passwordHash') &&
    superCredentialsF8.includes('Password hash, secret, dan token pairing tidak pernah dikirim ke UI'),
);
check(
  'platform device groups are read-only observations of tenant-owned groups',
  platformObservabilityServiceF8.includes("mutationContract: 'TENANT_SCOPED_ONLY'") &&
    superDeviceGroupsF8.includes('Surface platform ini <strong>read-only</strong>') &&
    !read('apps/admin-web/app/api/super/device-groups/route.ts').includes('export async function POST'),
);
check(
  'platform command monitor exposes queue ACK history without cross-tenant dispatch',
  platformObservabilityServiceF8.includes('sendCommandEnabled: false') &&
    superCommandMonitorF8.includes('monitoring-only') &&
    superCommandMonitorF8.includes('Tidak ada tombol Send Command lintas tenant') &&
    !read('apps/admin-web/app/api/super/commands/route.ts').includes('export async function POST'),
);
check(
  'platform telemetry explorer is device-bound capability-validated and CSV exports returned evidence',
  platformObservabilityServiceF8.includes('deviceId is required') &&
    platformObservabilityServiceF8.includes('Capability ${capability} is not registered for this device') &&
    superTelemetry.includes('/api/super/telemetry-explorer?') &&
    superTelemetry.includes('Telemetry Explorer') &&
    superTelemetry.includes('Export CSV'),
);
check(
  'capability registry surfaces persisted schemaVersion constraints and unit without inventing global templates',
  platformDeviceController.includes('schemaVersion: true') &&
    platformDeviceController.includes('constraints: true') &&
    platformDeviceController.includes('unit: true') &&
    superCapabilitiesF8.includes('observed per-device definitions') &&
    superCapabilitiesF8.includes('belum ada entity template global terpisah'),
);
check(
  'platform reports use bounded server-generated tenant evidence and an accepted architecture decision',
  platformObservabilityServiceF8.includes('getTenantSummaryReport') &&
    platformObservabilityServiceF8.includes('this.prisma.deviceCommand.groupBy') &&
    platformObservabilityServiceF8.includes('this.prisma.telemetry.groupBy') &&
    platformObservabilityServiceF8.includes('this.prisma.analyticsFinding.groupBy') &&
    existsSync(join(root, 'docs/phoenix/adr/ADR-008-platform-observability-read-models.md')) &&
    read('docs/phoenix/adr/ADR-008-platform-observability-read-models.md').includes('No Prisma migration is introduced by this ADR'),
);
check(
  'live MQTT broker sessions remain fail-closed instead of being fabricated by platform observability work',
  read('apps/admin-web/components/super-mqtt-content.tsx').includes('Fail-closed: broker state tidak pernah dikarang') &&
    read('docs/phoenix/adr/ADR-008-platform-observability-read-models.md').includes('MQTT broker sessions/connections/topic runtime state remain unavailable'),
);


// RESCUE-02B runtime-readiness R2 — canonical baseline manifest coverage.
const baselineManifestManagerR2 = read('scripts/manage-baseline-manifest.mjs');
check(
  'baseline manifest hashing is portable across Windows and Linux text checkouts',
  read('scripts/manage-baseline-manifest.mjs').includes("const normalizedLf = decoded.replace(/\\r\\n/g, '\\n').replace(/\\r/g, '\\n')") &&
    read('scripts/manage-baseline-manifest.mjs').includes("extension === '.cmd' || extension === '.bat'") &&
    read('package.json').includes('baseline:manifest:self-test'),
);

check(
  'baseline manifest manager distinguishes top-level runtime reports from legitimate application report routes',
  existsSync(join(root, 'scripts/manage-baseline-manifest.mjs')) &&
    baselineManifestManagerR2.includes("const excludedTopLevel = new Set(['artifacts', 'reports'])") &&
    baselineManifestManagerR2.includes('depth === 0 && excludedTopLevel.has(entry.name)') &&
    !baselineManifestManagerR2.includes("excludedAnywhere = new Set(['.git', 'node_modules', 'dist', '.next', 'coverage', 'reports'"),
);
check(
  'baseline manifest excludes top-level runtime secret env from sealed source hashes',
  baselineManifestManagerR2.includes("const excludedFiles = new Set(['repository-tree.txt', 'BASELINE-MANIFEST.sha256', '.env'])") &&
    baselineManifestManagerR2.includes('depth === 0 && excludedFiles.has(entry.name)'),
);
check(
  'baseline manifest ignores generated TypeScript incremental build metadata without weakening ordinary source drift detection',
  baselineManifestManagerR2.includes('/\\.tsbuildinfo$/i') &&
    baselineManifestManagerR2.includes('/^next-env\\.d\\.ts$/i') &&
    baselineManifestManagerR2.includes('stat.isFile() && excludedFilePatterns.some((pattern) => pattern.test(entry.name))') &&
    existsSync(join(root, 'scripts/self-test-baseline-manifest.mjs')) &&
    read('scripts/self-test-baseline-manifest.mjs').includes('generated tsbuildinfo variant B') &&
    read('package.json').includes('baseline:manifest:self-test'),
);
check(
  'Next web workspaces keep TypeScript incremental metadata under excluded build cache paths',
  read('apps/admin-web/tsconfig.json').includes('"tsBuildInfoFile": ".next/cache/tsconfig.tsbuildinfo"') &&
    read('apps/user-web/tsconfig.json').includes('"tsBuildInfoFile": ".next/cache/tsconfig.tsbuildinfo"') &&
    read('.gitignore').includes('*.tsbuildinfo'),
);
check(
  'repository tree includes canonical Super Admin report route and API route',
  repositoryTree.includes('apps/admin-web/app/super/reports/page.tsx') &&
    repositoryTree.includes('apps/admin-web/app/api/super/reports/tenant-summary/route.ts'),
);
check(
  'runtime acceptance verifies exact baseline manifest before lifecycle and runtime execution',
  acceptanceRunner.includes("run('Baseline manifest verifier'") &&
    acceptanceRunner.includes("['scripts/manage-baseline-manifest.mjs', 'verify']") &&
    evidenceInitializer.includes("'Baseline manifest verifier'") &&
    evidenceValidator.includes("'Baseline manifest verifier'") &&
    read('package.json').includes('baseline:manifest:generate') &&
    read('package.json').includes('baseline:manifest:verify'),
);

// RESCUE-02B runtime-readiness R2 — immutable live evidence artifacts.
const evidenceAttachR2 = read('scripts/attach-rescue-02b-evidence.mjs');
check(
  'RESCUE-02B live evidence schema requires hashed artifact references rather than free text',
  evidenceValidator.includes('schemaVersion must be 2') &&
    evidenceValidator.includes('must be an artifact reference object, not free text') &&
    evidenceValidator.includes('artifactSha256') &&
    evidenceValidator.includes('SHA-256 does not match artifact bytes') &&
    read('ops/acceptance/rescue-02b-evidence.example.json').includes('"schemaVersion": 2'),
);
check(
  'automated acceptance report must contain every successful full-suite step before live evidence can close',
  evidenceValidator.includes('REQUIRED_AUTOMATED_STEPS') &&
    evidenceValidator.includes('must have pass=true and exitCode=0') &&
    evidenceInitializer.includes('requiredAutomatedSteps') &&
    evidenceInitializer.includes('missing successful required step'),
);
check(
  'live evidence timestamps cannot silently predate the automated full-suite gate',
  evidenceValidator.includes('must not predate the automated full-suite report'),
);
check(
  'operator evidence attachment helper hashes real artifacts and only updates known checklist rows',
  existsSync(join(root, 'scripts/attach-rescue-02b-evidence.mjs')) &&
    read('package.json').includes('rescue:evidence:attach') &&
    evidenceAttachR2.includes("['runtimeFlow', 'liveBroker', 'physicalEsp32']") &&
    evidenceAttachR2.includes("row.status = 'PASS'") &&
    evidenceAttachR2.includes("createHash('sha256')") &&
    evidenceAttachR2.includes('Unknown check id'),
);

// RESCUE-02B runtime-readiness R2 — release integrity vs production approval separation.
const releaseBuilderR2 = read('scripts/build-production-release.mjs');
const releaseVerifierR2 = read('scripts/verify-production-release.mjs');
const productionApprovalR2 = read('scripts/verify-production-approval.mjs');
const evidenceValidatorR2 = read('scripts/validate-rescue-02b-evidence.mjs');
check(
  'production release manifest is source-fingerprinted to the sealed baseline',
  releaseBuilderR2.includes('sourceFingerprint: {') &&
    releaseBuilderR2.includes("baselineManifestSha256: sha256(resolve(root, 'BASELINE-MANIFEST.sha256'))") &&
    releaseBuilderR2.includes("repositoryTreeSha256: sha256(resolve(root, 'repository-tree.txt'))"),
);
check(
  'release verifier requires exact manifest coverage and rejects symlink entries',
  releaseVerifierR2.includes('Untracked release file is not covered by manifest') &&
    releaseVerifierR2.includes('Release file set does not exactly match manifest') &&
    releaseVerifierR2.includes('Symbolic links are forbidden in release artifacts') &&
    releaseVerifierR2.includes('Unsafe manifest path'),
);
check(
  'production approval is a separate source-bound gate rather than release integrity alias',
  existsSync(join(root, 'scripts/verify-production-approval.mjs')) &&
    read('package.json').includes('release:approve') &&
    productionApprovalR2.includes('validate-rescue-02b-evidence.mjs') &&
    productionApprovalR2.includes("ota?.status !== 'PASS'") &&
    productionApprovalR2.includes('Release source fingerprint matches the current sealed baseline'),
);
check(
  'OTA PASS requires actual artifact bytes and matching device-observed SHA-256',
  evidenceValidatorR2.includes("ota?.status === 'PASS'") &&
    evidenceValidatorR2.includes('artifactSha256') &&
    evidenceValidatorR2.includes('deviceObservedSha256') &&
    evidenceValidatorR2.includes('OTA artifact file bytes do not match') &&
    evidenceValidatorR2.includes('OTA artifact SHA-256 and device-observed SHA-256 must match'),
);
check(
  'runtime and deployment docs distinguish artifact integrity from production approval',
  read('docs/RESCUE-02-RUNTIME-RUNBOOK.md').includes('release:verify` proves package integrity only') &&
    read('docs/deployment-recovery.md').includes('not** a production-approval claim') &&
    read('ops/acceptance/README.md').includes('artifact integrity, **not production approval**'),
);


// RESCUE-02B runtime-readiness R6 — installation requires manifest-bound production approval receipt.
const releaseApprovalReceiptR6 = read('scripts/verify-production-approval.mjs');
const releaseVerifierReceiptR6 = read('scripts/verify-production-release.mjs');
const installReleaseReceiptR6 = read('ops/scripts/install-release.sh');
check(
  'production approval writes a manifest-bound receipt containing evidence and OTA digests',
  releaseApprovalReceiptR6.includes("'production-approval.json'") &&
    releaseApprovalReceiptR6.includes('releaseManifestSha256') &&
    releaseApprovalReceiptR6.includes('evidenceSha256') &&
    releaseApprovalReceiptR6.includes('otaDigestVerification') &&
    releaseApprovalReceiptR6.includes("'--require-approved'"),
);
check(
  'release verifier supports fail-closed approved-install mode without weakening exact payload coverage',
  releaseVerifierReceiptR6.includes("const requireApproved = process.argv.slice(2).includes('--require-approved')") &&
    releaseVerifierReceiptR6.includes('Production approval receipt is required for installation') &&
    releaseVerifierReceiptR6.includes('Production approval receipt is not bound to this release manifest') &&
    releaseVerifierReceiptR6.includes("const reservedSidecars = new Set(['production-approval.json'])") &&
    releaseVerifierReceiptR6.includes('Untracked release file is not covered by manifest'),
);
check(
  'VPS installer requires an approved release before dependency install migration or symlink activation',
  installReleaseReceiptR6.includes('verify-production-release.mjs\" --require-approved') &&
    installReleaseReceiptR6.indexOf('--require-approved') < installReleaseReceiptR6.indexOf('npm --prefix \"$release_dir\" ci') &&
    installReleaseReceiptR6.indexOf('--require-approved') < installReleaseReceiptR6.indexOf('run migrate:deploy') &&
    installReleaseReceiptR6.indexOf('--require-approved') < installReleaseReceiptR6.indexOf('ln -sfn \"$release_dir\" \"$current_link\"'),
);
check(
  'production approval receipt self-test covers missing valid tampered and untracked release paths',
  existsSync(join(root, 'scripts/self-test-production-approval-receipt.mjs')) &&
    read('package.json').includes('release:approval:self-test') &&
    read('scripts/self-test-production-approval-receipt.mjs').includes('Missing production approval receipt is rejected') &&
    read('scripts/self-test-production-approval-receipt.mjs').includes('Tampered approval receipt is rejected') &&
    read('scripts/self-test-production-approval-receipt.mjs').includes('Untracked release files remain rejected after approval'),
);



// RESCUE-02B runtime-readiness R3 — dependency bootstrap classification + structured runtime preflight.
const bootstrapDoctorR3 = read('scripts/diagnose-rescue-bootstrap.mjs');
const runtimeCheckerR3 = read('scripts/check-rescue-runtime.mjs');
const acceptanceRunnerR3 = read('scripts/run-rescue-acceptance.mjs');
check(
  'dependency bootstrap doctor classifies toolchain lock partial install and npm registry blocking without project dependencies',
  existsSync(join(root, 'scripts/diagnose-rescue-bootstrap.mjs')) &&
    read('package.json').includes('rescue:bootstrap:doctor') &&
    bootstrapDoctorR3.includes('TOOLCHAIN_OR_LOCK_INVALID') &&
    bootstrapDoctorR3.includes('PARTIAL_INSTALL') &&
    bootstrapDoctorR3.includes('DEPENDENCY_NETWORK_BLOCKED') &&
    bootstrapDoctorR3.includes('INSTALL_REQUIRED_REGISTRY_REACHABLE') &&
    bootstrapDoctorR3.includes("dependencies already installed; network is not a runtime prerequisite"),
);
check(
  'runtime prerequisite checker supports structured JSON blockers without changing the human default',
  runtimeCheckerR3.includes("const jsonOutput = args.has('--json')") &&
    runtimeCheckerR3.includes('blockerCount: failures.length') &&
    runtimeCheckerR3.includes('blockers: failures.map') &&
    runtimeCheckerR3.includes('if (jsonOutput)') &&
    runtimeCheckerR3.includes("'Check'.padEnd(widths.name)"),
);
check(
  'acceptance report embeds structured runtime preflight instead of requiring log scraping',
  acceptanceRunnerR3.includes('let runtimePreflight = null') &&
    acceptanceRunnerR3.includes("'--json'") &&
    acceptanceRunnerR3.includes("runtimePreflight = JSON.parse(steps.at(-1)?.stdout") &&
    acceptanceRunnerR3.includes('runtimePreflight,') &&
    read('docs/RESCUE-02-RUNTIME-RUNBOOK.md').includes('structured `runtimePreflight` object'),
);
check(
  'runtime runbook documents exact dependency bootstrap command and classified doctor recovery',
  read('docs/RESCUE-02-RUNTIME-RUNBOOK.md').includes('npm ci --ignore-scripts --prefer-offline --no-audit --fund=false --progress=false') &&
    read('docs/RESCUE-02-RUNTIME-RUNBOOK.md').includes('rescue:bootstrap:doctor') &&
    read('ops/acceptance/README.md').includes('DEPENDENCY') === false &&
    read('ops/acceptance/README.md').includes('registry DNS/HTTPS blocking'),
);



// RESCUE-02B runtime-readiness R4 — topology-neutral protocol-aware runtime probes.
const runtimeCheckerR4 = read('scripts/check-rescue-runtime.mjs');
const runtimeRunbookR4 = read('docs/RESCUE-02-RUNTIME-RUNBOOK.md');
check(
  'runtime acceptance does not require Docker/Podman when approved external services pass the same probes',
  runtimeCheckerR4.includes("const requireContainerRuntime = args.has('--require-container-runtime')") &&
    runtimeCheckerR4.includes("requireContainerRuntime ? 'FAIL' : 'INFO'") &&
    runtimeRunbookR4.includes('External/managed services') &&
    runtimeRunbookR4.includes('--require-container-runtime'),
);
check(
  'runtime dependency gate requires a complete critical-package boundary rather than only node_modules hidden lock',
  runtimeCheckerR4.includes("const criticalPackages = ['typescript', 'jest', 'prisma', '@nestjs/cli', 'next', 'expo']") &&
    runtimeCheckerR4.includes("dependencies.state === 'READY'") &&
    runtimeCheckerR4.includes('partial/incomplete node_modules'),
);
check(
  'runtime probes validate PostgreSQL Redis and MQTT application protocols rather than TCP listeners',
  runtimeCheckerR4.includes('PostgreSQL SSL negotiation responded') &&
    runtimeCheckerR4.includes("respCommand(['PING'])") &&
    runtimeCheckerR4.includes('MQTT 3.1.1 CONNECT accepted') &&
    runtimeCheckerR4.includes('invalid MQTT CONNACK frame'),
);
check(
  'runtime probes authenticate EMQX dashboard and require API readiness body instead of port-only success',
  runtimeCheckerR4.includes("new URL('/api/v5/login', base)") &&
    runtimeCheckerR4.includes('login response missing bearer token') &&
    runtimeCheckerR4.includes("body?.status === 'ready'") &&
    runtimeCheckerR4.includes('API /health/ready') &&
    read('ops/env/rescue-local.env.example').includes('API_PROBE_URL=http://127.0.0.1:3000/health/ready'),
);
check(
  'runtime preflight schema v2 documents topology-neutral protocol-aware checks for operators and evidence consumers',
  runtimeCheckerR4.includes('schemaVersion: 2') &&
    runtimeCheckerR4.includes('containerRuntimeRequired: requireContainerRuntime') &&
    runtimeRunbookR4.includes('A listening TCP port alone is not PASS') &&
    read('ops/acceptance/README.md').includes('topology-neutral') &&
    read('ops/acceptance/README.md').includes('authenticated MQTT CONNECT'),
);


check(
  'protocol-aware runtime probe self-test is source-controlled and dependency-free',
  existsSync(join(root, 'scripts/self-test-rescue-runtime-probes.mjs')) &&
    read('package.json').includes('rescue:runtime:self-test') &&
    read('scripts/self-test-rescue-runtime-probes.mjs').includes('accepts valid service fixtures') &&
    read('scripts/self-test-rescue-runtime-probes.mjs').includes('rejects raw/invalid service fixtures'),
);
const runtimeCheckerR27 = read('scripts/check-rescue-runtime.mjs');
const runtimeProbeSelfTestR27 = read('scripts/self-test-rescue-runtime-probes.mjs');
check(
  'full runtime readiness requires wrong-secret MQTT rejection instead of positive-connect only',
  runtimeCheckerR27.includes("'MQTT wrong-secret rejection'") &&
    runtimeCheckerR27.includes('SECURITY: wrong-secret MQTT CONNECT was accepted') &&
    runtimeCheckerR27.includes('probeMqttWrongSecretRejection'),
);
check(
  'runtime probe regression rejects a fail-open MQTT broker',
  runtimeProbeSelfTestR27.includes('mqttAcceptAll: true') &&
    runtimeProbeSelfTestR27.includes('fail-open MQTT fixture must fail full runtime readiness') &&
    runtimeProbeSelfTestR27.includes("row.name === 'MQTT wrong-secret rejection'"),
);

// RESCUE-02B RR28 — isolate the rescue EMQX host endpoint from unrelated local brokers.
const rescueComposeR28 = read('docker-compose.rescue.yml');
const rescueNetworkR28 = read('scripts/rescue-local-network.mjs');
const localManagerR28 = read('scripts/manage-rescue-local-runtime.mjs');
const gate1RunnerR28 = read('scripts/run-rescue-gate1.mjs');
const gate1ValidatorR28 = read('scripts/validate-rescue-gate1-receipt.mjs');
const acceptanceR28 = read('scripts/run-rescue-acceptance.mjs');
const rescueEnvR28 = read('ops/env/rescue-local.env.example');
check(
  'local rescue EMQX uses a dedicated host MQTT port while keeping the compose-network broker port canonical',
  rescueComposeR28.includes('${RESCUE_MQTT_HOST_PORT:-18884}:1883') &&
    rescueComposeR28.includes('MQTT_BROKER_URL: mqtt://emqx:1883') &&
    rescueNetworkR28.includes('DEFAULT_RESCUE_MQTT_HOST_PORT = 18884') &&
    rescueEnvR28.includes('RESCUE_MQTT_HOST_PORT=18884') &&
    rescueEnvR28.includes('RESCUE_MQTT_BROKER_URL=mqtt://127.0.0.1:18884'),
);
check(
  'local runtime refuses an occupied rescue MQTT host port and persists the exact broker endpoint it proved',
  localManagerR28.includes('assertTcpPortAvailable') &&
    localManagerR28.includes('Choose a free RESCUE_MQTT_HOST_PORT') &&
    localManagerR28.includes('mqttHostPort,') &&
    localManagerR28.includes('mqttHostUrl,'),
);
check(
  'Gate 1 validator and automated acceptance recheck the source-bound rescue MQTT endpoint instead of a foreign host broker',
  gate1RunnerR28.includes('runtimeExecutionEnv') &&
    gate1RunnerR28.includes('RESCUE_MQTT_BROKER_URL') &&
    gate1ValidatorR28.includes('currentState.mqttHostUrl') &&
    acceptanceR28.includes('localRuntimeProbeEnv()') &&
    acceptanceR28.includes('state.mqttHostUrl'),
);
const gate1ValidatorSelfTestR29 = read('scripts/self-test-rescue-gate1-validator.mjs');
check(
  'Gate 1 validator keeps local runtime state in scope while constructing dedicated MQTT revalidation env',
  gate1ValidatorR28.includes('let currentState = null;') &&
    gate1ValidatorR28.includes('currentState = existsSync(statePath) ? readJson(statePath) : null;') &&
    !gate1ValidatorR28.includes('const currentState = existsSync(statePath) ? readJson(statePath) : null;'),
);
check(
  'Gate 1 validator regression executes the local PASS receipt path and asserts dedicated MQTT endpoint propagation',
  existsSync(join(root, 'scripts/self-test-rescue-gate1-validator.mjs')) &&
    read('package.json').includes('rescue:gate1-validator:self-test') &&
    gate1ValidatorSelfTestR29.includes('Gate 1 validator executes end-to-end without block-scope ReferenceError') &&
    gate1ValidatorSelfTestR29.includes('RESCUE_MQTT_BROKER_URL') &&
    gate1ValidatorSelfTestR29.includes('mqtt://127.0.0.1:18884'),
);
check(
  'runtime regression proves a dedicated rescue MQTT endpoint isolates a foreign fail-open legacy broker',
  runtimeProbeSelfTestR27.includes('foreignMqttPort') &&
    runtimeProbeSelfTestR27.includes('dedicated rescue MQTT endpoint isolates a foreign fail-open broker on the legacy host endpoint') &&
    read('scripts/self-test-rescue-acceptance-runner.mjs').includes('foreign legacy broker'),
);


// RESCUE-02B runtime-readiness R7 — staged local runtime orchestration.
const runtimeCheckerR7 = read('scripts/check-rescue-runtime.mjs');
const localRuntimeManagerR7 = read('scripts/manage-rescue-local-runtime.mjs');
const localRuntimeSelfTestR7 = read('scripts/self-test-rescue-local-runtime.mjs');
const runtimeRunbookR7 = read('docs/RESCUE-02-RUNTIME-RUNBOOK.md');
check(
  'runtime checker supports staged infra/full probe scopes without weakening the default full probe',
  runtimeCheckerR7.includes("const probeScopeArg = argv.find((value) => value.startsWith('--probe-scope='))") &&
    runtimeCheckerR7.includes("args.has('--probe') ? 'full' : 'none'") &&
    runtimeCheckerR7.includes("if (probeScope === 'full')") &&
    runtimeCheckerR7.includes('probeScope,') &&
    read('scripts/self-test-rescue-runtime-probes.mjs').includes('staged infra probe validates only PostgreSQL Redis and EMQX Dashboard'),
);
check(
  'local runtime orchestrator preserves fail-closed order through one-network compose API readiness',
  existsSync(join(root, 'scripts/manage-rescue-local-runtime.mjs')) &&
    localRuntimeManagerR7.includes('validate source/runtime prerequisites') &&
    localRuntimeManagerR7.includes("composeArgs(compose, ['up', '-d', 'postgres', 'redis', 'emqx'])") &&
    localRuntimeManagerR7.includes("waitForRuntimeScope(envPath, 'infra'") &&
    localRuntimeManagerR7.includes("composeArgs(compose, ['build', 'api'])") &&
    localRuntimeManagerR7.includes("composeArgs(compose, ['up', '-d', 'api'])") &&
    localRuntimeManagerR7.includes("IOT_API_FROM_EMQX: 'http://api:3000'") &&
    localRuntimeManagerR7.includes('waitForHttp(urls.live, 200') &&
    localRuntimeManagerR7.includes('configure-emqx-http-auth.mjs') &&
    localRuntimeManagerR7.includes('configure-emqx-webhooks.mjs') &&
    localRuntimeManagerR7.includes("waitForRuntimeScope(envPath, 'full'") &&
    localRuntimeManagerR7.includes('CORE_RUNTIME_READY_LIVE_BROKER_EVIDENCE_PENDING') &&
    !localRuntimeManagerR7.includes("runChecked('backend production build'") &&
    !localRuntimeManagerR7.includes("runChecked('Prisma committed migration deployment'"),
);
check(
  'local runtime orchestrator rejects placeholder env rolls back failed bring-up and preserves volumes by default',
  localRuntimeManagerR7.includes('Refusing to use the placeholder rescue-local.env.example') &&
    localRuntimeManagerR7.includes('ROLLBACK  Bring-up failed') &&
    localRuntimeManagerR7.includes("composeArgs(compose, ['down'])") &&
    localRuntimeManagerR7.includes("if (removeVolumes) args.push('--volumes')") &&
    localRuntimeManagerR7.includes('named rescue volumes were preserved'),
);
check(
  'local runtime manager is exposed through package scripts and dependency-free regression coverage',
  read('package.json').includes('rescue:local:plan') &&
    read('package.json').includes('rescue:local:up') &&
    read('package.json').includes('rescue:local:status') &&
    read('package.json').includes('rescue:local:down') &&
    read('package.json').includes('rescue:local:self-test') &&
    existsSync(join(root, 'scripts/self-test-rescue-local-runtime.mjs')) &&
    localRuntimeSelfTestR7.includes('refuses placeholder env and unsafe timeout before mutation'),
);
check(
  'runtime runbook keeps live broker evidence separate from source-controlled webhook configuration',
  runtimeRunbookR7.includes('rescue:local:up') &&
    runtimeRunbookR7.includes('--probe-scope=infra') &&
    runtimeRunbookR7.includes('--probe-scope=full') &&
    runtimeRunbookR7.includes('CORE_RUNTIME_READY_LIVE_BROKER_EVIDENCE_PENDING') &&
    read('ops/emqx/README.md').includes('live broker OpenAPI') &&
    read('ops/acceptance/README.md').includes('CORE_RUNTIME_READY_LIVE_BROKER_EVIDENCE_PENDING') &&
    read('ops/acceptance/README.md').includes('telemetry delivery, ACK correlation, idempotency'),
);


// RESCUE-02B runtime-readiness R8 — source-validated EMQX webhook automation.
const emqxWebhookConfiguratorR8 = read('scripts/configure-emqx-webhooks.mjs');
const emqxWebhookSelfTestR8 = read('scripts/self-test-emqx-webhooks.mjs');
check(
  'EMQX webhook automation requires live OpenAPI and no-mutation bridge probe before broker mutation',
  existsSync(join(root, 'scripts/configure-emqx-webhooks.mjs')) &&
    emqxWebhookConfiguratorR8.includes("'/api-docs/swagger.json', '/api-spec.json'") &&
    emqxWebhookConfiguratorR8.includes("['/bridges', 'get']") &&
    emqxWebhookConfiguratorR8.includes("['/bridges_probe', 'post']") &&
    emqxWebhookConfiguratorR8.includes("['/rules/{id}', 'put']") &&
    emqxWebhookConfiguratorR8.includes("/api/v5/bridges_probe") &&
    emqxWebhookConfiguratorR8.includes('refusing webhook mutation'),
);
check(
  'EMQX webhook automation manages canonical telemetry and ACK transforms without changing API contracts',
  emqxWebhookConfiguratorR8.includes('iot_telemetry_webhook') &&
    emqxWebhookConfiguratorR8.includes('iot_command_ack_webhook') &&
    emqxWebhookConfiguratorR8.includes('payload.eventId AS eventId') &&
    emqxWebhookConfiguratorR8.includes('/mqtt/webhook/telemetry') &&
    emqxWebhookConfiguratorR8.includes('/mqtt/ack') &&
    emqxWebhookConfiguratorR8.includes("'x-webhook-secret': webhookSecret") &&
    emqxWebhookConfiguratorR8.includes('live publish/idempotency/ACK/negative-path evidence'),
);
check(
  'EMQX webhook automation is package-exposed and dependency-free self-test covers idempotency and fail-closed paths',
  read('package.json').includes('rescue:emqx:webhooks:configure') &&
    read('package.json').includes('rescue:emqx:webhooks:self-test') &&
    existsSync(join(root, 'scripts/self-test-emqx-webhooks.mjs')) &&
    emqxWebhookSelfTestR8.includes('OpenAPI contract failure must happen before probe or mutation') &&
    emqxWebhookSelfTestR8.includes('bridge probe failure must not mutate broker configuration') &&
    emqxWebhookSelfTestR8.includes('reconfiguration must update rather than duplicate managed objects'),
);
check(
  'EMQX webhook rule verification is semantic across broker SQL normalization while source/action drift stays fail-closed',
  emqxWebhookConfiguratorR8.includes('canonicalizeRuleSql') &&
    emqxWebhookConfiguratorR8.includes('bridgeActionIdFromRecord') &&
    emqxWebhookConfiguratorR8.includes('equivalentHttpBridgeAction') &&
    emqxWebhookConfiguratorR8.includes('ruleHasExpectedAction') &&
    emqxWebhookConfiguratorR8.includes('unexpected source topic') &&
    emqxWebhookSelfTestR8.includes('bridge-alias-roundtrip') &&
    emqxWebhookSelfTestR8.includes('broker-resolved http action id') &&
    emqxWebhookSelfTestR8.includes('normalized-roundtrip') &&
    emqxWebhookSelfTestR8.includes('wrong-source-roundtrip') &&
    emqxWebhookSelfTestR8.includes('unexpected source topic returned by broker must fail closed'),
);
check(
  'EMQX webhook bridge alias round-trip resolves broker-returned http action identity before rule verification',
  emqxWebhookConfiguratorR8.includes("const httpBridgeTypes = new Set(['webhook', 'http'])") &&
    emqxWebhookConfiguratorR8.includes('bridgeActionIdFromRecord') &&
    emqxWebhookConfiguratorR8.includes('const refreshed = await listBridges(headers)') &&
    emqxWebhookConfiguratorR8.includes('return resolvedActionId') &&
    emqxWebhookSelfTestR8.includes("withFakeEmqx('bridge-alias-roundtrip'") &&
    emqxWebhookSelfTestR8.includes("actions?.includes('http:iot_telemetry_webhook')") &&
    emqxWebhookSelfTestR8.includes("actions?.includes('http:iot_command_ack_webhook')"),
);

check(
  'local runtime rollback covers webhook configuration failure and never upgrades configuration state into acceptance evidence',
  localRuntimeManagerR7.includes("runChecked('EMQX telemetry/ACK webhook configuration'") &&
    localRuntimeSelfTestR7.includes('synthetic webhook configuration failure must fail bring-up') &&
    localRuntimeSelfTestR7.includes('webhook configuration failure must rollback complete compose stack') &&
    read('ops/acceptance/README.md').includes('configuration was accepted by the live broker contract') &&
    read('ops/acceptance/README.md').includes('still mandatory'),
);
check(
  'local runtime exposes crash recovery that preserves named volumes and re-proves readiness',
  read('package.json').includes('rescue:local:recover') &&
    localRuntimeManagerR7.includes('async function recover') &&
    localRuntimeManagerR7.includes('Resetting possibly partial local runtime state after interruption/crash') &&
    localRuntimeManagerR7.includes('await down({ envPath, removeVolumes: false })') &&
    localRuntimeManagerR7.includes('await up({ envPath, timeoutMs, keepOnFailure })') &&
    localRuntimeManagerR7.includes('rescue:local:recover never removes named volumes') &&
    localRuntimeSelfTestR7.includes('synthetic interrupted-state recovery must pass') &&
    localRuntimeSelfTestR7.includes('recovery must preserve named volumes'),
);



// RESCUE-02B runtime-readiness R11 — API joins the local Compose network.
const rescueComposeR11 = read('docker-compose.rescue.yml');
const rescueApiDockerfileR11 = read('ops/docker/Dockerfile.rescue-api');
check(
  'local rescue API is a compose service with internal PostgreSQL Redis and MQTT service URLs',
  rescueComposeR11.includes('api:') &&
    rescueComposeR11.includes('dockerfile: ops/docker/Dockerfile.rescue-api') &&
    rescueComposeR11.includes('DATABASE_URL: postgresql://${POSTGRES_USER:-iot}:${POSTGRES_PASSWORD:-iot_local_only}@postgres:5432/${POSTGRES_DB:-iot}') &&
    rescueComposeR11.includes('REDIS_URL: redis://redis:6379') &&
    rescueComposeR11.includes('MQTT_BROKER_URL: mqtt://emqx:1883') &&
    rescueComposeR11.includes('condition: service_healthy'),
);
check(
  'rescue API image pins npm 10 builds backend and applies migrations before API startup',
  existsSync(join(root, 'ops/docker/Dockerfile.rescue-api')) &&
    rescueApiDockerfileR11.includes('FROM node:22-bookworm-slim') &&
    rescueApiDockerfileR11.includes('npm install --global npm@10.9.8') &&
    rescueApiDockerfileR11.includes('RUN npm ci') &&
    rescueApiDockerfileR11.includes('RUN npm run build') &&
    rescueApiDockerfileR11.includes('./node_modules/.bin/prisma migrate deploy && exec node dist/main.js'),
);
check(
  'local EMQX callbacks stay on the compose network and never depend on host.docker.internal',
  read('ops/env/rescue-local.env.example').includes('IOT_API_FROM_EMQX=http://api:3000') &&
    read('scripts/configure-emqx-http-auth.mjs').includes("'http://api:3000'") &&
    read('scripts/configure-emqx-webhooks.mjs').includes("'http://api:3000'") &&
    !rescueComposeR11.includes('host.docker.internal:host-gateway') &&
    read('ops/emqx/README.md').includes('internal service address `http://api:3000`'),
);
check(
  'docker build context excludes runtime secrets dependencies and generated artifacts',
  existsSync(join(root, '.dockerignore')) &&
    read('.dockerignore').includes('node_modules') &&
    read('.dockerignore').includes('dist') &&
    read('.dockerignore').includes('reports') &&
    read('.dockerignore').includes('.env'),
);


// RESCUE-02B runtime-readiness R9 — explicit Gate 1 receipt and Gate 2 entry barrier.
const gate1RunnerR9 = read('scripts/run-rescue-gate1.mjs');
const gate1ValidatorR9 = read('scripts/validate-rescue-gate1-receipt.mjs');
check(
  'Gate 1 runner binds dependency/runtime bring-up to the current sealed source fingerprint',
  existsSync(join(root, 'scripts/run-rescue-gate1.mjs')) &&
    read('package.json').includes('rescue:gate1') &&
    gate1RunnerR9.includes("gate: 'GATE_1_DEPENDENCY_RUNTIME_BRINGUP'") &&
    gate1RunnerR9.includes('packageLockSha256') &&
    gate1RunnerR9.includes('baselineManifestSha256') &&
    gate1RunnerR9.includes('repositoryTreeSha256') &&
    gate1RunnerR9.includes("bootstrap?.status !== 'READY'") &&
    gate1RunnerR9.includes("'--probe-scope=full'") &&
    gate1RunnerR9.includes("save('PASS')"),
);
check(
  'Gate 1 runner cannot convert dependency or runtime blockers into a PASS receipt',
  gate1RunnerR9.includes("GATE1_BLOCKED_DEPENDENCY") &&
    gate1RunnerR9.includes("GATE1_BLOCKED_RUNTIME") &&
    gate1RunnerR9.includes("runtimePreflight?.blockerCount !== 0") &&
    gate1RunnerR9.includes('CORE_RUNTIME_READY_LIVE_BROKER_EVIDENCE_PENDING'),
);
check(
  'Gate 1 reuses an already-ready local runtime only when env and sealed-source fingerprint match',
  gate1RunnerR9.includes('REUSE  Local runtime already tracks the source-bound CORE_RUNTIME_READY_LIVE_BROKER_EVIDENCE_PENDING') &&
    gate1RunnerR9.includes('existingState.schemaVersion !== 3') &&
    gate1RunnerR9.includes('sameSourceFingerprint(existingState.sourceFingerprint, sourceFingerprint)') &&
    gate1RunnerR9.includes('Tracked local runtime belongs to a different environment file') &&
    gate1RunnerR9.includes('Full protocol runtime preflight'),
);
check(
  'local runtime state binds protocol-ready compose execution to the sealed source fingerprint',
  localRuntimeManagerR7.includes('function sealedSourceFingerprint()') &&
    localRuntimeManagerR7.includes('schemaVersion: 3') &&
    localRuntimeManagerR7.includes('sourceFingerprint,') &&
    localRuntimeManagerR7.includes("status: 'CORE_RUNTIME_READY_LIVE_BROKER_EVIDENCE_PENDING'"),
);
check(
  'Gate 2 entry validator requires source-bound Gate 1 PASS and rechecks the live environment',
  existsSync(join(root, 'scripts/validate-rescue-gate1-receipt.mjs')) &&
    read('package.json').includes('rescue:gate1:validate') &&
    gate1ValidatorR9.includes("receipt.status !== 'PASS'") &&
    gate1ValidatorR9.includes('source fingerprint mismatch') &&
    gate1ValidatorR9.includes('runtime state is not source-bound to the receipt baseline') &&
    gate1ValidatorR9.includes('Current local runtime state is not source-bound to the validated Gate 1 baseline') &&
    gate1ValidatorR9.includes("'--no-registry-probe'") &&
    gate1ValidatorR9.includes("'--probe-scope=full'") &&
    gate1ValidatorR9.includes('Gate 2 entry is permitted'),
);
check(
  'sealed source manifest ignores stale top-level overlay instruction artifacts',
  read('scripts/manage-baseline-manifest.mjs').includes('excludedTopLevelFilePatterns') &&
    read('scripts/manage-baseline-manifest.mjs').includes('/^APPLY-.*\\.txt$/i') &&
    read('scripts/manage-baseline-manifest.mjs').includes('/^README-HOTFIX\\.txt$/i'),
);
check(
  'Gate 1 validator automatically selects the latest receipt when --file is omitted',
  gate1ValidatorR9.includes('function resolveReceiptPath()') &&
    gate1ValidatorR9.includes('Using latest Gate 1 receipt') &&
    gate1ValidatorR9.includes("/^gate1-.*\\.json$/i") &&
    gate1RunnerR9.includes('npm run rescue:gate1:validate'),
);
check(
  'operator documentation keeps Gate 2 blocked until Gate 1 receipt validates live',
  read('docs/RESCUE-02-RUNTIME-RUNBOOK.md').includes('rescue:gate1:validate') &&
    read('ops/acceptance/README.md').includes('Gate 2 entry') &&
    read('ops/acceptance/README.md').includes('Gate 1 PASS receipt'),
);



// RESCUE-02B runtime-readiness R30 — GitHub-hosted heavy validation + real EMQX smoke.
const githubCiR30 = read('.github/workflows/ci.yml');
const liveBrokerSmokeR30 = read('scripts/run-rescue-live-broker-smoke.mjs');
const githubCiSelfTestR30 = read('scripts/self-test-rescue-github-ci.mjs');
const secureFastifyVerifierR30 = read('scripts/verify-secure-fastify-stack.mjs');
const productionAuditPolicyR30 = JSON.parse(read('ops/security/production-audit-policy.json'));
const secureNextVerifierR30 = read('scripts/verify-secure-next-stack.mjs');
const fastifyV5CompatVerifierR30 = read('scripts/verify-fastify-v5-compat.mjs');
const webFrameworkContractSyncVerifierR30 = read('scripts/verify-web-framework-contract-sync.mjs');
const adminWebPackageR30 = JSON.parse(read('apps/admin-web/package.json'));
const userWebPackageR30 = JSON.parse(read('apps/user-web/package.json'));
check(
  'active web workspace contract and foundation documentation track the security-approved Next.js line',
  read('package.json').includes('web:framework:contract:verify') &&
    webFrameworkContractSyncVerifierR30.includes("const expected = '16.3.5'") &&
    read('test/module-10-web-workspace-design-system-foundation.contract.spec.ts').includes(
      "expect(app.dependencies.next).toBe('16.3.5')",
    ) &&
    read('docs/module-10-web-workspace-design-system-foundation.md').includes('Next.js `16.3.5`'),
);
check(
  'Fastify v5 source compatibility guard rejects removed v4 request/reply APIs',
  read('package.json').includes('fastify:v5:compat:verify') &&
    fastifyV5CompatVerifierR30.includes('request.routerPath') &&
    fastifyV5CompatVerifierR30.includes('request.connection') &&
    fastifyV5CompatVerifierR30.includes('reply.getResponseTime(') &&
    read('src/metrics/metrics.interceptor.ts').includes('request.routeOptions?.url') &&
    !read('src/metrics/metrics.interceptor.ts').includes('request.routerPath'),
);
check(
  'secure Next.js boundary is source-controlled at the August 2026 patched line',
  read('package.json').includes('security:web-stack:verify') &&
    adminWebPackageR30.dependencies?.next === '16.3.5' &&
    userWebPackageR30.dependencies?.next === '16.3.5' &&
    secureNextVerifierR30.includes("const REQUIRED = '16.3.5'") &&
    secureNextVerifierR30.includes("const MINIMUM = '16.3.3'"),
);
check(
  'secure NestJS/Fastify boundary is source-controlled and has no standing critical acceptance',
  read('package.json').includes('security:stack:verify') &&
    secureFastifyVerifierR30.includes("'@nestjs/platform-fastify', '11.2.3'") &&
    secureFastifyVerifierR30.includes("compare(version, '9.3.3') < 0") &&
    Array.isArray(productionAuditPolicyR30.acceptedCriticalFindings) &&
    productionAuditPolicyR30.acceptedCriticalFindings.length === 0,
);
check(
  'GitHub CI preserves core regression job and adds source-bound real EMQX rescue validation',
  githubCiR30.includes('\n  test:\n') &&
    githubCiR30.includes('\n  rescue-live-emqx:\n') &&
    githubCiR30.includes('needs: [test, esp32-firmware-simulation]') &&
    githubCiR30.includes('runs-on: ubuntu-latest') &&
    githubCiR30.includes('rescue:local:up -- --env=.env') &&
    githubCiR30.includes('rescue:broker:smoke -- --env=.env'),
);
check(
  'GitHub rescue job fails fast on targeted database stability before one full acceptance',
  githubCiR30.includes('Targeted PostgreSQL integration stability gate') &&
    githubCiR30.indexOf('Targeted PostgreSQL integration stability gate') <
      githubCiR30.indexOf('Full automated acceptance once') &&
    githubCiR30.includes('npm run test:integration:db') &&
    githubCiR30.includes('npm run rescue:acceptance -- --env=.env --full'),
);
check(
  'live broker smoke uses one-shot negative ACL clients and explicit denial signals',
  read('package.json').includes('rescue:broker:smoke:self-test') &&
    read('scripts/run-rescue-live-broker-smoke.mjs').includes("from './lib/rescue-mqtt-operations.mjs'") &&
    read('scripts/run-rescue-live-broker-smoke.mjs').includes('expectSubscribeDeniedFresh') &&
    read('scripts/run-rescue-live-broker-smoke.mjs').includes('expectPublishDeniedFresh') &&
    read('scripts/run-rescue-live-broker-smoke.mjs').includes("'publisher-negative-subscribe'") &&
    read('scripts/run-rescue-live-broker-smoke.mjs').includes("'publisher-negative-publish'") &&
    read('scripts/run-rescue-live-broker-smoke.mjs').includes("'cross-device-subscribe'") &&
    read('scripts/run-rescue-live-broker-smoke.mjs').includes("'cross-device-publish'") &&
    read('scripts/run-rescue-live-broker-smoke.mjs').includes("'wrong-device-ack-publish'") &&
    read('scripts/lib/rescue-mqtt-operations.mjs').includes('disconnect-not-authorized') &&
    read('scripts/lib/rescue-mqtt-operations.mjs').includes('MQTT_OPERATION_CLOSED') &&
    read('scripts/run-rescue-live-broker-smoke.mjs').includes('await closeActiveMqttClients()'),
);

check(
  'GitHub rescue broker smoke stays bound to dedicated rescue MQTT endpoint and concrete live negative paths',
  liveBrokerSmokeR30.includes('env.RESCUE_MQTT_BROKER_URL?.trim()') &&
    liveBrokerSmokeR30.includes("'18884'") &&
    liveBrokerSmokeR30.includes('device-wrong-secret-denied') &&
    liveBrokerSmokeR30.includes('publisher-non-command-operations-denied') &&
    liveBrokerSmokeR30.includes('telemetry-webhook-idempotent') &&
    liveBrokerSmokeR30.includes('ack-bound-to-matching-device-command') &&
    liveBrokerSmokeR30.includes('wrong-webhook-secret-denied') &&
    liveBrokerSmokeR30.includes('revoked-device-denied'),
);
check(
  'GitHub rescue CI captures failure evidence and tears down only ephemeral CI volumes',
  read('package.json').includes('rescue:github-ci:self-test') &&
    read('package.json').includes('rescue:broker:smoke') &&
    githubCiR30.includes('actions/upload-artifact@v4') &&
    githubCiR30.includes('docker-compose.log') &&
    githubCiR30.includes('down --volumes --remove-orphans') &&
    githubCiSelfTestR30.includes('RESCUE GITHUB CI SELF-TEST PASS'),
);

for (const result of checks) {
  console.log(`${result.pass ? 'PASS' : 'FAIL'}  ${result.name}${result.detail ? ` (${result.detail})` : ''}`);
}

if (failures.length > 0) {
  console.error(`\nRESCUE VALIDATION FAILED (${failures.length})`);
  process.exit(1);
}
console.log(`\nRESCUE VALIDATION PASS (${checks.length}/${checks.length})`);


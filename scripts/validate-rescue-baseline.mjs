import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const root = resolve(process.cwd());
const failures = [];
const checks = [];

function check(name, condition, detail = '') {
  checks.push({ name, pass: Boolean(condition), detail });
  if (!condition) failures.push(`${name}${detail ? `: ${detail}` : ''}`);
}

/**
 * Strips comments before checking for forbidden content.
 *
 * The surfaces that had to be corrected carry doc comments naming the exact fabricated
 * strings they used to contain, so a naive substring scan reports the correction as the
 * defect. A comment is never rendered, so content inside one cannot reach a user, and
 * stripping it makes the guardrail test what actually ships.
 */
function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
}

function listFiles(dir) {
  const out = [];
  const walk = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === '.next') continue;
      const path = join(current, entry.name);
      if (entry.isDirectory()) walk(path);
      else out.push(path);
    }
  };
  walk(dir);
  return out;
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
// These four checks previously asserted the *pre-AppShell* mechanism: a `direct:` nav entry and
// per-shell usePathname()/isActiveRoute(). Active tracking moved into the shared AppShell
// (isActive + prefix match + aria-current) driven by an `active` prop each page passes, so the
// old literals could never match again. They are rewritten to test the mechanism that actually
// ships, which is strictly stronger: every page must pass `active`, not just the shell.
check(
  'platform command monitor is reachable and backed by a real component',
  /href:\s*'\/super\/commands'/.test(superShell) &&
    existsSync(join(root, 'apps/admin-web/components/super-command-monitor-content.tsx')),
);
const superPagesWithoutActive = listFiles(join(root, 'apps/admin-web/app/super'))
  .filter((file) => file.endsWith('page.tsx'))
  .filter((file) => !readFileSync(file, 'utf8').includes('active='));
check(
  'every super admin page declares its own active nav entry',
  superPagesWithoutActive.length === 0,
  superPagesWithoutActive
    .map((file) => relative(join(root, 'apps/admin-web/app/super'), file))
    .join(', '),
);
const appShell = read('apps/admin-web/components/app-shell.tsx');
check(
  'shared app shell tracks the active route with prefix matching and aria-current',
  /const isActive = \(href: string\)/.test(appShell) &&
    /activePath\.startsWith\(/.test(appShell) &&
    /aria-current/.test(appShell) &&
    // A call that is present but short-circuited never runs, so every /super/xxx page would
    // render with no nav item highlighted while the text still looks correct. The plain
    // `activePath.startsWith(` presence test cannot see that, so dead code in this function is
    // rejected outright.
    !/false\s*&&\s*activePath\.startsWith\(/.test(appShell) &&
    !/activePath\.startsWith\([^)]*\)\s*&&\s*false/.test(appShell),
  'active tracking lives here, so a per-shell usePathname assertion is the wrong guard',
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
// Role gating is per shell; route tracking is per shell via the `active` prop into AppShell.
check(
  'canonical admin shells fail closed on role hints',
  tenantShell.includes('useAdminSessionRole()') &&
    superShell.includes('useAdminSessionRole()') &&
    compatibilityShell.includes('useAdminSessionRole()'),
);
const tenantPagesWithoutActive = listFiles(join(root, 'apps/admin-web/app/tenant'))
  .filter((file) => file.endsWith('page.tsx'))
  .filter((file) => !readFileSync(file, 'utf8').includes('active='));
check(
  'every tenant admin page declares its own active nav entry',
  tenantPagesWithoutActive.length === 0,
  tenantPagesWithoutActive
    .map((file) => relative(join(root, 'apps/admin-web/app/tenant'), file))
    .join(', '),
);
check(
  'super navigation keeps nested routes active',
  /activePath\.startsWith\(/.test(read('apps/admin-web/components/app-shell.tsx')),
  'prefix matching lives in AppShell; the super shell no longer owns it',
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

const notificationController = read('src/notification/notification.controller.ts');
check(
  'notification delivery log is administrator-only and cannot leak tenant-wide destinations to MEMBER',
  notificationController.includes('AdminRoleGuard') &&
    notificationController.includes('@UseGuards(JwtAuthGuard, TenantContextGuard, AdminRoleGuard)'),
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
  scheduleController.includes('this.scenes.findTenantScene(tenantId, targetSceneId)') &&
    scheduleController.includes("this.sceneAccess.assertSceneAccess(this.accessContext(request), targetScene, 'CONTROL')") &&
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
  'runtime evidence keeps simulated-hardware software UAT distinct from optional physical field evidence',
  evidenceValidator.includes('REQUIRED_RUNTIME_FLOW') &&
    evidenceValidator.includes('REQUIRED_BROKER') &&
    evidenceValidator.includes('REQUIRED_HARDWARE') &&
    evidenceValidator.includes('SIMULATED_HARDWARE_LIVE_SERVICE') &&
    evidenceValidator.includes("['DEFERRED', 'PASS']") &&
    acceptanceGuide.includes('simulated-hardware / physical field evidence') &&
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
    /commandFeedback\((?:dashboardCopy|copy), result\.status\)/.test(mobileWidgetR4) &&
    read('apps/user-mobile/src/localization/messages.ts').includes('Command masih menunggu ACK perangkat'),
);

check(
  'canonical mobile shell preserves five-tab blueprint on the secure Expo root',
  // The tab labels come from the active locale's copy, so the five tabs are pinned by key and by the
  // copy key each one renders. Asserting the literal `label: 'Home'` string would fail the moment the
  // chrome is translated, which is the defect this wave closed -- and it would then be "fixed" by
  // hardcoding English again. Both locales are checked so neither can drop a tab.
  ['home', 'devices', 'realtime', 'alerts', 'profile'].every((key) =>
    read('apps/user-mobile/src/ui/mobile-authenticated-shell.tsx').includes(
      `{ key: '${key}', labelKey:`,
    ),
  ) &&
    ['id', 'en'].every((locale) =>
      ['home', 'devices', 'realtime', 'alerts', 'profile'].every((key) =>
        new RegExp(`nav:\\s*\\{[^}]*\\b${key}:`).test(
          read('apps/user-mobile/src/localization/messages.ts'),
        ),
      ),
    ) &&
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
// This check previously REQUIRED the string 'VIEW: owner/VIEW/CONTROL share' to be present and
// the corrected phrasing to be absent. That pinned the fabricated ROLE_META content in place:
// deleting the fabrication would have failed this gate, which is one reason it survived so
// long. The legitimate intent — never render a role count as zero when the platform directory
// could not be read — is kept, and the invented-content assertions are gone. The real
// replacement is enforced by the permission-catalog checks and rbac-permission-catalog.spec.ts.
check(
  'super role directory does not report zero users when the platform directory fails',
  superRolesR6.includes('const [error, setError]') &&
    /users\s*===\s*null/.test(superRolesR6) &&
    !/String\(\s*users\.filter/.test(superRolesR6),
  'role counts must be gated on a successful directory read, not defaulted to a number',
);
check(
  'super roles content no longer pins the fabricated permission descriptions',
  !superRolesR6.includes('VIEW: owner/VIEW/CONTROL share'),
  'this description describes device-level VIEW/CONTROL access, not an enforced permission',
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
    // The menu item for /tenant/notifikasi is deliberately present: the page is a real
    // notification-delivery log (queue, worker attempts, failure codes), verified by reading
    // the page, and docs/UI-ROUTE-MAP.md classifies it KEEP rather than MERGE. The old check
    // asserted its absence, which is the opposite of the verified decision.
    tenantShell.includes("href: '/tenant/notifikasi'"),
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
    // Was pinned to the local `TERMINAL_COMMAND_STATES` list. The behaviour it protects — the
    // view reconciling a terminal ACK instead of assuming success — is still required, but the
    // literal list is now derived from the enum in lib/contracts so an added status cannot be
    // missed. The terminal-set rule itself is enforced by the command status checks.
    userDeviceDetailFoundation.includes('TERMINAL_COMMAND_STATUSES') &&
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
  'capability registry surfaces persisted definitions and the real template lifecycle without inventing device mutation on publish',
  platformDeviceController.includes('schemaVersion: true') &&
    platformDeviceController.includes('constraints: true') &&
    platformDeviceController.includes('unit: true') &&
    superCapabilitiesF8.includes('observed per-device definitions') &&
    superCapabilitiesF8.includes('Template/version lifecycle tenant juga tersedia') &&
    read('apps/admin-web/components/super-capability-versions-panel.tsx').includes('Buat template + draft 1.0.0') &&
    read('apps/admin-web/components/super-capability-versions-panel.tsx').includes('Deprecate v') &&
    read('apps/admin-web/app/api/admin/capability-templates/route.ts').includes('export async function POST') &&
    read('apps/admin-web/app/api/admin/capability-templates/[templateId]/versions/route.ts').includes('export async function POST') &&
    read('apps/admin-web/app/api/admin/capability-templates/[templateId]/deprecate/route.ts').includes('export async function POST'),
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
  'production approval is a separate source-bound gate with simulated-hardware and legacy physical evidence modes',
  existsSync(join(root, 'scripts/verify-production-approval.mjs')) &&
    read('package.json').includes('release:approve') &&
    productionApprovalR2.includes('validate-rescue-02b-evidence.mjs') &&
    productionApprovalR2.includes('--simulated-hardware=') &&
    productionApprovalR2.includes('--environment=') &&
    productionApprovalR2.includes('Repository/UAT green is not environment approval') &&
    productionApprovalR2.includes('SIMULATED_HARDWARE_LIVE_SERVICE') &&
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
    read('ops/acceptance/README.md').includes('Release artifact integrity is separate from production approval'),
);


// RESCUE-02B runtime-readiness R6 — installation requires manifest-bound production approval receipt.
const releaseApprovalReceiptR6 = read('scripts/verify-production-approval.mjs');
const releaseVerifierReceiptR6 = read('scripts/verify-production-release.mjs');
const installReleaseReceiptR6 = read('ops/scripts/install-release.sh');
check(
  'production approval writes a manifest-bound receipt containing source-bound simulated hardware or legacy physical evidence',
  releaseApprovalReceiptR6.includes("'production-approval.json'") &&
    releaseApprovalReceiptR6.includes('releaseManifestSha256') &&
    releaseApprovalReceiptR6.includes('environmentEvidenceSha256') &&
    releaseApprovalReceiptR6.includes('environmentObservedAt') &&
    releaseApprovalReceiptR6.includes('evidenceSha256') &&
    releaseApprovalReceiptR6.includes('hardwareEvidence') &&
    releaseApprovalReceiptR6.includes('SIMULATED_HARDWARE_LIVE_SERVICE') &&
    releaseApprovalReceiptR6.includes('otaDigestVerification') &&
    releaseApprovalReceiptR6.includes("'--require-approved'"),
);
check(
  'release verifier supports fail-closed approved-install mode without weakening exact payload coverage',
  releaseVerifierReceiptR6.includes("const requireApproved = process.argv.slice(2).includes('--require-approved')") &&
    releaseVerifierReceiptR6.includes('Production approval receipt is required for installation') &&
    releaseVerifierReceiptR6.includes('Production approval receipt is not bound to this release manifest') &&
    releaseVerifierReceiptR6.includes('Production approval requires production-environment-evidence.json sidecar') &&
    releaseVerifierReceiptR6.includes('Production environment evidence sidecar digest does not match approval receipt') &&
    releaseVerifierReceiptR6.includes('Production approval simulated-hardware source fingerprint mismatch') &&
    releaseVerifierReceiptR6.includes('valid simulated-hardware evidence or legacy physical OTA digest proof') &&
    releaseVerifierReceiptR6.includes("const reservedSidecars = new Set(['production-approval.json', 'production-environment-evidence.json'])") &&
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
  'production approval requires environment evidence and installer rejects environment drift before migration',
  existsSync(join(root, 'scripts/create-production-environment-evidence.mjs')) &&
    existsSync(join(root, 'scripts/verify-production-environment-evidence.mjs')) &&
    existsSync(join(root, 'scripts/verify-production-environment-current.mjs')) &&
    releaseApprovalReceiptR6.includes('--environment=') &&
    releaseApprovalReceiptR6.includes('environmentEvidenceSha256') &&
    releaseVerifierReceiptR6.includes('production-environment-evidence.json') &&
    installReleaseReceiptR6.includes('verify-production-environment-current.mjs') &&
    installReleaseReceiptR6.indexOf('verify-production-environment-current.mjs') < installReleaseReceiptR6.indexOf('npm --prefix "$release_dir" ci'),
);
check(
  'production template enables business runtimes and Redis host prerequisite is source-controlled',
  read('ops/env/iot-platform.env.example').includes('SCHEDULER_RUNTIME_ENABLED=true') &&
    read('ops/env/iot-platform.env.example').includes('AUTOMATION_RUNTIME_ENABLED=true') &&
    read('ops/env/iot-platform.env.example').includes('NOTIFICATION_RUNTIME_ENABLED=true') &&
    read('ops/env/iot-platform.env.example').includes('EMAIL_RELAY_TOKEN=REPLACE_WITH_AT_LEAST_32_RANDOM_BYTES') &&
    read('ops/sysctl/99-iot-platform.conf').includes('vm.overcommit_memory = 1'),
);
check(
  'migration rollback compatibility gate is fail-closed for future destructive SQL',
  read('package.json').includes('migration:compatibility:verify') &&
    read('scripts/verify-migration-compatibility.mjs').includes('forbidden after historical cutoff') &&
    read('scripts/self-test-migration-compatibility.mjs').includes('future destructive migration was bypassed'),
);
check(
  'GitHub core actions use the reviewed Node 24 generation and are self-tested',
  read('package.json').includes('github:actions-runtime:self-test') &&
    read('.github/workflows/ci.yml').includes('actions/checkout@v7') &&
    read('.github/workflows/ci.yml').includes('actions/setup-node@v7') &&
    read('.github/workflows/ci.yml').includes('actions/cache@v5') &&
    read('.github/workflows/ci.yml').includes('actions/upload-artifact@v7') &&
    read('.github/workflows/ci.yml').includes('actions/download-artifact@v7'),
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
    // 'go2rtc' is named explicitly alongside the other three, not left to a bare `up`. A bare `up`
    // would start whatever a later commit adds to the compose file, which is how a media runtime
    // ends up running in a gate that never decided to run it.
    localRuntimeManagerR7.includes(
      "composeArgs(compose, ['up', '-d', 'postgres', 'redis', 'emqx', 'go2rtc'])",
    ) &&
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
const uatSeedSource = read('scripts/seed-uat-baseline.mjs');
const probeWrapperSources = readdirSync(resolve(root, 'scripts'))
  .filter((name) => name.startsWith('run-') && name.endsWith('probe.sh'))
  .map((name) => read(`scripts/${name}`));
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
    webFrameworkContractSyncVerifierR30.includes("const expected = '16.3.8'") &&
    read('test/module-10-web-workspace-design-system-foundation.contract.spec.ts').includes(
      "expect(app.dependencies.next).toBe('16.3.8')",
    ) &&
    read('docs/module-10-web-workspace-design-system-foundation.md').includes('Next.js `16.3.8`'),
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
// Registered so the fix cannot be silently undone. Without this, deleting the resolution or dropping
// the self-test from the CI gate is a two-line diff that nothing in this repository would object to --
// and the next runner to lack a DATABASE_URL dies at the seed again, after the whole acceptance job
// has been waiting on it.
// One check per condition, deliberately. Bundled into a single `&&` chain these conditions propped
// each other up: deleting any single one still left four satisfied ones, so the check stayed green and
// caught nothing. Every condition here was mutation-tested individually for exactly that reason.
// Every live probe wrapper used to `cd /home/ivo/Desktop/program/iot`, which exists on exactly one
// machine. On a runner that line fails outright, so the Wave 9 media, camera and location probes
// could never have executed in CI -- they had only ever been run locally. Each wrapper now resolves
// its own repository root, which is the same fix applied to the contract specs.
// The wrappers also minted their session file into a scratch directory that exists on one machine.
// probe_login writes curl's response there, so on a runner curl could not create the file and the probe
// died as a mystery rather than as a configuration error. A session response belongs under the
// git-ignored reports/ tree, and PROBE_LOGIN_FILE still overrides it.
check(
  'live probe wrappers keep their session file inside the repository',
  probeWrapperSources.every((source) => !source.includes('/home/ivo/')),
);

check(
  'no tracked script hardcodes this machine as its repository root',
  readdirSync(resolve(root, 'scripts')).every((name) => {
    if (!name.endsWith('.mjs') && !name.endsWith('.sh')) return true;
    const source = read(`scripts/${name}`);
    // The one remaining mention is prose in this validator explaining why the check exists.
    return !/^const ROOT = '\/home\/ivo/m.test(source) && !/^cd \/home\/ivo/m.test(source);
  }),
);

check(
  'live probe wrappers resolve their own repository root',
  probeWrapperSources.every(
    (source) =>
      source.includes('cd "$(dirname "${BASH_SOURCE[0]}")/.."') &&
      !/^cd \/home\/[^\s]/m.test(source),
  ),
);

check('UAT seed is registered as an npm script', read('package.json').includes('uat:seed:env:self-test'));
check('UAT seed resolves DATABASE_URL from a .env file', /const databaseUrl = resolveDatabaseUrl\('\.env'\);/.test(uatSeedSource));
check('UAT seed fails with the missing-DATABASE_URL cause named', /^if \(!databaseUrl\) \{/m.test(uatSeedSource));
check(
  'UAT seed env self-test asserts the resolution order',
  read('scripts/self-test-uat-seed-env.mjs').includes('parseEnv(envFile).DATABASE_URL'),
);
check('CI runs the UAT seed env self-test in the gate step', githubCiR30.includes('npm run uat:seed:env:self-test'));

check(
  'secure Next.js boundary is source-controlled at the August 2026 patched line',
  read('package.json').includes('security:web-stack:verify') &&
    adminWebPackageR30.dependencies?.next === '16.3.8' &&
    userWebPackageR30.dependencies?.next === '16.3.8' &&
    secureNextVerifierR30.includes("const REQUIRED = '16.3.8'") &&
    secureNextVerifierR30.includes("const MINIMUM = '16.3.3'"),
);
check(
  'secure NestJS/Fastify boundary is source-controlled and has no standing critical acceptance',
  read('package.json').includes('security:stack:verify') &&
    // Assert the ADVISORY FLOORS, not the versions that happened to be pinned when this check was written.
    // Pinning a literal here made the guard fail the moment the security fix landed, which is the wrong
    // moment for a source-bound rescue guard to change. The floors are what the guarantee actually is.
    //   GHSA-9c5c-9qcx-q35q  middleware bypass  (@nestjs/platform-fastify < 11.2.4)
    //   GHSA-p68q-wchp-6fh7  auth bypass       (fastify < 5.12.2)
    //   GHSA-4mh8-r7rc-xpvc  HTTP/2 trailer DoS (fastify < 5.12.5)
    secureFastifyVerifierR30.includes("'@nestjs/platform-fastify', '11.2.4'") &&
    secureFastifyVerifierR30.includes("'fastify', '5.12.5'") &&
    // The override is what actually closes the chain: platform-fastify resolves its own fastify.
    secureFastifyVerifierR30.includes('pkg.overrides?.fastify') &&
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
    githubCiR30.includes('actions/upload-artifact@v7') &&
    githubCiR30.includes('docker-compose.log') &&
    githubCiR30.includes('down --volumes --remove-orphans') &&
    githubCiSelfTestR30.includes('RESCUE GITHUB CI SELF-TEST PASS'),
);

check(
  'TLS protocol probe captures stdout stderr and exit status across OpenSSL output formats',
  read('scripts/verify-tls-terminator.mjs').includes("spawnSync('openssl'") &&
    read('scripts/verify-tls-terminator.mjs').includes('Protocol(?:\\s+version)?') &&
    read('scripts/verify-tls-terminator.mjs').includes('New,\\s*(TLSv1') &&
    read('scripts/verify-tls-terminator.mjs').includes('tlsProbeRefused'),
);
const tlsPackageJson = JSON.parse(read('package.json'));
check(
  'TLS protocol parser self-test is mandatory in local prepush and core CI',
  tlsPackageJson.scripts?.['tls:protocol:self-test'] === 'node scripts/verify-tls-terminator.mjs --self-test' &&
    tlsPackageJson.scripts?.['wave1:prepush:check']?.includes('tls:protocol:self-test') &&
    read('.github/workflows/ci.yml').includes('npm run tls:protocol:self-test'),
);

check(
  'Wave 5 public API probes consume the seeded UAT identity through one fail-closed wrapper',
  read('scripts/run-wave5-public-api-probes.sh').includes('probe_export_uat_admin_env') &&
    read('scripts/probe-common.sh').includes('probe_export_uat_admin_env()') &&
    read('scripts/probe-webhook-event-vocabulary.sh').includes('PROBE_EMAIL is required') &&
    read('scripts/probe-public-api-sdk.mts').includes('requireProbeCredential'),
);
check(
  'Wave 5 UAT credential contract is tested locally and in core CI before the live Wave 5 gate',
  tlsPackageJson.scripts?.['wave5:public-api:self-test'] === 'node scripts/self-test-wave5-public-api-probes.mjs' &&
    tlsPackageJson.scripts?.['wave1:prepush:check']?.includes('wave5:public-api:self-test') &&
    read('.github/workflows/ci.yml').includes('npm run wave5:public-api:self-test') &&
    read('.github/workflows/ci.yml').includes('npm run wave5:public-api:probe'),
);

check(
  'cross-wave live probes use canonical fail-closed orchestration before GitHub live acceptance',
  tlsPackageJson.scripts?.['live-probe:contracts:self-test'] === 'node scripts/self-test-live-probe-contracts.mjs' &&
    tlsPackageJson.scripts?.['wave1:prepush:check']?.includes('live-probe:contracts:self-test') &&
    githubCiR30.includes('npm run live-probe:contracts:self-test') &&
    githubCiR30.includes('npm run wave4:staging:probe') &&
    githubCiR30.includes('npm run wave6:management:probe') &&
    githubCiR30.includes('npm run wave7:operations:probe') &&
    githubCiR30.includes('npm run wave8:billing:probe') &&
    githubCiR30.includes('npm run wave9:simulated-hardware:probe'),
);
check(
  'Wave 6 credential seeding is single-source and does not print generated passwords on the probe path',
  read('scripts/probe-common.sh').includes('probe_export_demo_admin_env()') &&
    read('scripts/probe-common.sh').includes('--credentials-file=$credential_file') &&
    read('scripts/probe-common.sh').includes('--quiet >/dev/null') &&
    read('scripts/seed-demo-accounts.mjs').includes('{ mode: 0o600 }') &&
    !['run-capability-template-probe.sh','run-saved-reports-probe.sh','run-mqtt-management-probe.sh','run-noc-probe.sh']
      .some((name) => read(`scripts/${name}`).includes('SEED_OUT=')),
);
check(
  'Wave 6 MQTT recovery requires broker and platform publisher recovery inside a bounded polling window',
  read('scripts/probe-mqtt-management.mts').includes('mqttPublisherRecoveryState') &&
    read('scripts/probe-mqtt-management.mts').includes('state.brokerReachable && state.publisherReady') &&
    read('scripts/probe-runtime-contract.mjs').includes('advertisedCount >= 1') &&
    read('scripts/probe-runtime-contract.mjs').includes('connectedAt'),
);
check(
  'Wave 7-9 UAT wrappers share one credential parser and preserve failures through cleanup',
  ['run-mobile-notification-probe.sh','run-device-maintenance-probe.sh','run-billing-probe.sh','run-camera-probe.sh','run-device-location-probe.sh']
    .every((name) => read(`scripts/${name}`).includes('probe-common.sh')) &&
    ['run-mobile-notification-probe.sh','run-device-maintenance-probe.sh','run-billing-probe.sh','run-camera-probe.sh','run-device-location-probe.sh']
    .every((name) => !read(`scripts/${name}`).includes("awk '/uat.admin@iot.local")) &&
    read('scripts/run-device-maintenance-probe.sh').includes('|| PROBE_STATUS=$?') &&
    read('scripts/run-billing-probe.sh').includes('|| PROBE_STATUS=$?'),
);

check(
  'Wave 5-9 live UAT reuses validated sessions instead of exhausting the production auth limiter',
  read('scripts/probe-common.sh').includes('probe_session_is_usable()') &&
    read('scripts/probe-common.sh').includes('$api/users/profile') &&
    read('scripts/run-wave5-public-api-probes.sh').includes('PROBE_ACCESS_TOKEN="$(probe_session_token') &&
    read('scripts/run-wave6-management-probes.sh').includes('PROBE_TENANT_ACCESS_TOKEN="$(probe_session_token') &&
    ['probe-capability-template-lifecycle.mts','probe-saved-reports.mts','probe-mqtt-management.mts','probe-noc-operations.mts']
      .every((name) => read(`scripts/${name}`).includes('PROBE_ACCESS_TOKEN')) &&
    ['probe-capability-template-lifecycle.mts','probe-saved-reports.mts','probe-mqtt-management.mts','probe-noc-operations.mts']
      .every((name) => read(`scripts/${name}`).includes('PROBE_TENANT_ACCESS_TOKEN')),
);
check(
  'live UAT session reuse does not weaken the sensitive authentication limiter',
  !githubCiR30.includes('SENSITIVE_RATE_LIMIT_MAX:') &&
    !githubCiR30.includes('SENSITIVE_RATE_LIMIT_WINDOW_MS:') &&
    read('scripts/probe-common.sh').includes('probe login failed for $email: HTTP $status') &&
    read('scripts/self-test-live-probe-contracts.mjs').includes('real login rate-limit response remains a hard failure') &&
    read('docs/SESSION-HANDOFF-PROTOCOL.md').includes('Do not raise/disable the production limiter'),
);

check(
  'camera and device-location probe wrappers fail closed while still cleaning residue',
  read('scripts/run-camera-probe.sh').includes('set -euo pipefail') &&
    read('scripts/run-camera-probe.sh').includes('trap cleanup_probe EXIT') &&
    read('scripts/run-device-location-probe.sh').includes('set -euo pipefail') &&
    read('scripts/run-device-location-probe.sh').includes('trap cleanup_probe EXIT'),
);
check(
  'simulated hardware UAT is a source-controlled fail-closed live evidence gate',
  read('package.json').includes('uat:simulated-hardware:verify') &&
    read('package.json').includes('uat:simulated-hardware:self-test') &&
    read('scripts/verify-simulated-hardware-uat.mjs').includes('SIMULATED_HARDWARE_UAT') &&
    read('scripts/verify-simulated-hardware-uat.mjs').includes('qos1DuplicateTelemetryDedupe') &&
    read('scripts/verify-simulated-hardware-uat.mjs').includes('camera onboarding') &&
    read('scripts/verify-simulated-hardware-uat.mjs').includes('RTSP-to-WebRTC') &&
    githubCiR30.includes('Seal simulated hardware UAT evidence'),
);

// ---------------------------------------------------------------------------
// Stray non-Latin characters in user-facing source.
//
// The console is Indonesian. During the governance work a CJK ideograph slipped into
// user-facing copy three separate times, each one shipping past typecheck, lint, jest and both
// builds because every one of them is a perfectly valid character in a valid string literal.
// No existing gate can see this class of defect, so it is checked directly: these source trees
// are Indonesian/English only, with a small allow-list of typographic punctuation and the
// geometric icons the technician tabs use as glyphs.
// ---------------------------------------------------------------------------

const UI_SOURCE_ROOTS = ['apps/admin-web', 'apps/user-web', 'apps/user-mobile/src'];
const ALLOWED_NON_LATIN = new Set([
  '—', '·', '×', '→', '≥', '≤', '°', '±',
  '‘', '’', '“', '”', '…', '§', '•',
  '◈', '⚙', '⛭', '≣',
  '✓', '✗', '✔', '✘',
]);
const STRAY_CHARACTER_PATTERN =
  /[^\u0000-\u007f\u00a0-\u00ff\u2010-\u27bf\u2b00-\u2bff\ufeff]/g;

function findStrayCharacters() {
  const found = [];
  for (const relativeRoot of UI_SOURCE_ROOTS) {
    const absoluteRoot = join(root, relativeRoot);
    if (!existsSync(absoluteRoot)) continue;
    for (const file of listFiles(absoluteRoot)) {
      if (!/\.(ts|tsx)$/.test(file)) continue;
      for (const match of readFileSync(file, 'utf8').matchAll(STRAY_CHARACTER_PATTERN)) {
        const code = match[0].codePointAt(0);
        const character = String.fromCodePoint(code);
        if (ALLOWED_NON_LATIN.has(character)) continue;
        const hex = code.toString(16).toUpperCase().padStart(4, '0');
        // listFiles returns absolute paths, so this must be relative(root, file) and not
        // relative(join(root, file)): the single-argument form throws the moment a stray
        // character is found, which killed the validator instead of reporting a failure. A
        // guardrail that crashes is a guardrail that reports nothing.
        found.push(relative(root, file) + ': U+' + hex + ' ' + character);
      }
    }
  }
  return found;
}

const strayCharacters = findStrayCharacters();
check(
  'user-facing source contains no stray non-Latin characters',
  strayCharacters.length === 0,
  strayCharacters.slice(0, 10).join(' | '),
);

// ---------------------------------------------------------------------------
// A quarantined page must state its own non-production status.
//
// The console nav already groups /noc, /technician, /cctv and /mobile-preview under an honest
// "belum produksi" label, but that label is only visible in the menu. Anyone arriving from a
// bookmark, a shared link or a support ticket saw the page presented as a finished product —
// subtitles like "Global operations monitoring" and "Daftarkan & pasangkan via scan QR" imply
// capabilities the surfaces do not have: /noc has no map or geolocation at all, /cctv has no
// RTSP/ONVIF/WebRTC/HLS implementation anywhere, and /mobile-preview reads the device directory
// rather than any telemetry stream.
// ---------------------------------------------------------------------------

const QUARANTINE_PAGES = [
  ['/noc', 'apps/admin-web/components/noc-content.tsx'],
  ['/technician', 'apps/admin-web/app/technician/page.tsx'],
  ['/cctv', 'apps/admin-web/app/cctv/page.tsx'],
  ['/mobile-preview', 'apps/admin-web/app/mobile-preview/page.tsx'],
];
for (const [route, path] of QUARANTINE_PAGES) {
  check(`quarantine page ${route} source is controlled`, existsSync(join(root, path)));
  if (!existsSync(join(root, path))) continue;
  const pageSource = read(path);
  check(
    `quarantine page ${route} states its own non-production status`,
    pageSource.includes('<QuarantineBanner') && pageSource.includes('doesNotWork'),
    'the nav group label is invisible to anyone arriving by direct link',
  );
}
check(
  'quarantine banner component is source-controlled',
  existsSync(join(root, 'apps/admin-web/components/quarantine-banner.tsx')),
);
if (existsSync(join(root, 'apps/admin-web/components/quarantine-banner.tsx'))) {
  const banner = read('apps/admin-web/components/quarantine-banner.tsx');
  check(
    'quarantine banner demands both what works and what does not',
    /works:/.test(banner) && /doesNotWork:/.test(banner) && /Laboratorium/.test(banner),
    'a generic disclaimer is not a truthful statement of the surface contract',
  );
}
// Banner truthfulness, decided from implementation markers rather than topic words.
//
// The first version of this check searched the page for "rtsp|onvif|webrtc" and reported a
// violation — because the banner NAMES those transports in order to say they are absent, so
// the search matched the correction instead of the implementation. The lesson is the same one
// the fabricated-permission checks taught: a guardrail that searches for content a fix
// legitimately contains will fail on the fix.
//
// So the test is for constructs that only exist in real code: a <video> element, a MediaSource,
// an RTCPeerConnection, a stream-URL fetch. Prose cannot satisfy those, and adding any of them
// genuinely does mean the banner needs rewriting.
const cctvBannerSource = read('apps/admin-web/app/cctv/page.tsx');
const cctvHasTransport = /<video\b|MediaSource|RTCPeerConnection|\.m3u8|['"`]rtsp:\/\//.test(
  cctvBannerSource,
);
const cctvClaimsNoStreaming = /tidak ada streaming/i.test(cctvBannerSource);
check(
  'cctv banner agrees with the cctv implementation about streaming',
  cctvHasTransport ? !cctvClaimsNoStreaming : cctvClaimsNoStreaming,
  cctvHasTransport
    ? 'a real streaming construct exists but the banner still claims there is none'
    : 'no streaming construct exists, so the banner must say so rather than imply a viewer',
);
const nocBannerSource = read('apps/admin-web/components/noc-content.tsx');
const nocHasMap = /from ['"]leaflet['"]|<MapContainer|navigator\.geolocation/.test(nocBannerSource);
const nocClaimsNoMap = /tidak ada peta dunia/i.test(nocBannerSource);
check(
  'noc banner agrees with the noc implementation about maps and location',
  nocHasMap ? !nocClaimsNoMap : nocClaimsNoMap,
  nocHasMap
    ? 'a real map or geolocation construct exists but the banner still claims there is none'
    : 'no map or geolocation construct exists, so the banner must say so rather than imply one',
);

// ---------------------------------------------------------------------------
// Usage against quota is real: the billing endpoint already returns persisted BillingUsage
// rows. The Quotas page previously rendered entitlement only, and its doc comment claimed the
// usage read model "does not exist" — it does, the component simply did not declare it. These
// checks stop the entitlement-only rendering, and that false claim, from returning.
// ---------------------------------------------------------------------------

const BILLING_COMPONENT = 'apps/admin-web/components/super-subscriptions-content.tsx';
if (existsSync(join(root, BILLING_COMPONENT))) {
  const billingSource = stripComments(read(BILLING_COMPONENT));
  check(
    'billing component declares the usage rows the api already returns',
    /interface UsageRow/.test(billingSource) && /usage\?:\s*UsageRow\[\]/.test(billingSource),
    'GET /admin/billing/subscriptions returns usage rows; the component must consume them',
  );
  check(
    'billing component renders usage against quota',
    /Pemakaian vs Kuota/.test(billingSource) &&
      /latestUsageByTenant/.test(billingSource) &&
      /deviceCount/.test(billingSource),
  );
  check(
    'billing component selects the newest usage period instead of summing periods',
    /row\.periodStart\s*>\s*current\.periodStart/.test(billingSource),
    'summing periods would report cumulative devices as if they were live',
  );
  check(
    'billing component reports an over-quota state',
    /Melebihi kuota/.test(billingSource) && /used\s*>\s*quota/.test(billingSource),
  );
}
// Read WITHOUT stripping comments here, deliberately. The fabricated-permission checks strip
// comments because a fix's own doc comment names the strings it removed, but a false claim
// lives in prose — reusing one stripped source for both makes the false-claim guardrail
// incapable of seeing the thing it exists to catch.
const billingPageProse = read('apps/admin-web/app/super/quotas/page.tsx');
check(
  'quotas page does not claim the usage read model is missing',
  !/usage[^.]{0,80}read model[^.]{0,30}does not exist/.test(billingPageProse),
  'BillingUsage rows are persisted and returned; claiming usage is unavailable is false',
);
check(
  'usage read model is persisted and served by the billing endpoint',
  /model BillingUsage/.test(read('prisma/schema.prisma')) &&
    /usage:\s*usage\.map\(/.test(
      read('src/admin-operations/admin-billing-directory.controller.ts'),
    ),
);

// ---------------------------------------------------------------------------
// Governance surfaces: the permission catalog, capability versioning, workers and platform
// dispatch (blueprint §1).
//
// Each guardrail here exists because a real defect was found and fixed, and each is written so
// the defect cannot come back quietly. The permission guardrails matter most: the console
// displayed `dashboard:*, device:*, scene:*, automation:*, schedule:*` for ADMIN, none of which
// appear anywhere in the API.
// ---------------------------------------------------------------------------

const RBAC_CATALOG_PATH = 'src/rbac/rbac-permission-catalog.ts';

function collectRequirePermissionStrings() {
  const found = new Set();
  for (const file of listFiles(join(root, 'src'))) {
    if (!file.endsWith('.controller.ts')) continue;
    const source = readFileSync(file, 'utf8');
    // The trailing `[^)]*` is required: `@RequirePermission` accepts an options object
    // (`{ allowOwner: true }`), and requiring `)` straight after the string silently collected
    // nothing from every owner-aware route. The parity check then reported four catalog entries
    // as unenforced while the decorators were present and correct.
    for (const match of source.matchAll(/@RequirePermission\(\s*'([^']+)'[^)]*\)/g)) {
      found.add(match[1]);
    }
  }
  return found;
}

check('rbac permission catalog is source-controlled', existsSync(join(root, RBAC_CATALOG_PATH)));

if (existsSync(join(root, RBAC_CATALOG_PATH))) {
  const catalogSource = read(RBAC_CATALOG_PATH);
  const catalogued = new Set(
    [...catalogSource.matchAll(/permission:\s*'([^']+)'/g)].map((m) => m[1]),
  );
  const decorated = collectRequirePermissionStrings();

  check(
    'rbac permission catalog is non-empty',
    catalogued.size > 0,
    `catalogued=${catalogued.size}`,
  );
  for (const permission of decorated) {
    check(
      `rbac permission catalog covers enforced @RequirePermission ${permission}`,
      catalogued.has(permission),
    );
  }
  for (const permission of catalogued) {
    check(
      `rbac permission catalog advertises only enforced permission ${permission}`,
      decorated.has(permission),
      'catalog entry is not enforced by any @RequirePermission decorator',
    );
  }
  check(
    'rbac permission catalog states base roles as wildcards',
    catalogSource.includes('Wildcard') &&
      /RbacPolicyService short-circuits to allowed=true/.test(catalogSource),
    'ADMIN/PLATFORM_ADMIN must be documented as a blanket wildcard, not a domain grant list',
  );
}

const FABRICATED_PERMISSION_STRINGS = ['dashboard:*', 'scene:*', 'automation:*', 'schedule:*'];
const ROLES_CONTENT_PATH = 'apps/admin-web/components/super-roles-content.tsx';
check(
  'super roles content reads the permission catalog from the backend',
  existsSync(join(root, ROLES_CONTENT_PATH)) &&
    read(ROLES_CONTENT_PATH).includes('/api/super/rbac/permission-catalog'),
);
if (existsSync(join(root, ROLES_CONTENT_PATH))) {
  const rolesCode = stripComments(read(ROLES_CONTENT_PATH));
  for (const fabricated of FABRICATED_PERMISSION_STRINGS) {
    check(
      `super roles content does not hard-code fabricated permission ${fabricated}`,
      !rolesCode.includes(fabricated),
      'this permission is enforced nowhere in the API',
    );
  }
  check(
    'super roles content has no hard-coded permission matrix',
    !/ROLE_META/.test(rolesCode),
    'ROLE_META is the fabricated matrix this guardrail was written for',
  );
  check(
    'super roles content reads the base role list from the backend instead of hard-coding it',
    !/const\s+BASE_ROLES\s*(?::[^=]+)?=/.test(rolesCode) &&
      /Object\.entries\(catalog\.baseRoleModel\)/.test(rolesCode),
    'a pinned role list silently omits any base role the backend later adds',
  );
}

const GOVERNANCE_BACKEND = [
  ['admin governance controller', 'src/admin-operations/admin-governance.controller.ts'],
  ['admin governance service', 'src/admin-operations/admin-governance.service.ts'],
];
for (const [label, path] of GOVERNANCE_BACKEND) {
  check(`${label} is source-controlled`, existsSync(join(root, path)));
}

const GOVERNANCE_ROUTES = [
  'admin/platform-rbac/permission-catalog',
  'admin/platform-rbac/custom-roles',
  'admin/platform-rbac/audit',
  'admin/platform-capabilities/versions',
  'admin/platform-runtime-signals',
  'admin/platform-commands/dispatch',
];
if (existsSync(join(root, 'src/admin-operations/admin-governance.controller.ts'))) {
  const controllerSource = read('src/admin-operations/admin-governance.controller.ts');
  for (const route of GOVERNANCE_ROUTES) {
    // GOVERNANCE_ROUTES records the full path (`admin` + the @Get segment), while the
    // controller declares @Controller('admin') and @Get('<fragment>'), so the fragment is what
    // actually appears in the source.
    const fragment = route.replace(/^admin\//, '');
    check(
      `governance controller exposes ${route}`,
      controllerSource.includes(fragment),
      `missing @Get('${fragment}')`,
    );
  }
  // Must test the @UseGuards decorator itself. Checking for the identifiers anywhere in the
  // file was not enough: deleting the guard from the decorator while leaving the import intact
  // still satisfied the old assertion.
  const useGuardsMatch = stripComments(controllerSource).match(/@UseGuards\(([^)]*)\)/);
  const useGuardsLine = useGuardsMatch ? useGuardsMatch[0] : '';
  check(
    'governance controller is platform-guarded',
    /AdminRoleGuard/.test(useGuardsLine) && /PlatformRoleGuard/.test(useGuardsLine),
    `@UseGuards is: ${useGuardsLine || '(absent)'}`,
  );
  // The service receives the actor as a parameter and cannot know where the controller got it
  // from, so the guarantee is asserted where it is established.
  const controllerCode = stripComments(controllerSource);
  const actorAssignments = [
    ...controllerCode.matchAll(/actorMembershipId\s*:\s*([^,\n]+)/g),
  ].map((match) => match[1].trim());

  // Two assertions, because the controller grew. Originally this checked `length === 1` with the
  // value `request.user.tenantContext.membershipId`, which was exact when `platform-commands/dispatch`
  // was the only platform route writing an audit record. The capability template lifecycle added
  // four more, so the count check started failing on routes the original guarantee never covered --
  // and the tempting fix, loosening it to "at least one", would have stopped asserting anything
  // about the four new ones.
  //
  // So the guarantee is now stated for what it actually is: *every* actor read in this controller
  // comes from the session, and never from a request body. A count is not the invariant; a count
  // was a proxy for it that happened to hold when there was one route.
  check(
    'every platform audit route reads the actor from the authenticated session',
    actorAssignments.length > 0 &&
      actorAssignments.every(
        (value) =>
          value === 'request.user.tenantContext.membershipId' ||
          // Lifecycle routes call the private helper, which reads the session and nothing else.
          // Asserted here so adding a second definition of `actorOf` cannot quietly start
          // taking the actor from somewhere else.
          value === 'this.actorOf(request)',
      ),
    `actorMembershipId assignments: ${JSON.stringify(actorAssignments)}`,
  );
  check(
    'the actor helper reads the session and takes nothing from the body',
    /private actorOf\(request: AdminOperationsRequest\): string \{\s*return request\.user\.tenantContext\.membershipId;/.test(
      controllerCode,
    ),
  );
  check(
    'platform dispatch does not read the actor from the request body',
    !/body\.actorMembershipId/.test(controllerCode) &&
      !/actorMembershipId\s*:\s*body\b/.test(controllerCode),
  );
}

if (existsSync(join(root, 'src/admin-operations/admin-governance.service.ts'))) {
  const governanceSource = read('src/admin-operations/admin-governance.service.ts');
  check(
    'platform dispatch requires an explicit target tenant',
    /if\s*\(!tenantId\s*\|\|\s*!deviceId\)/.test(governanceSource),
    'dispatch must fail closed when tenant or device is missing, never infer one',
  );
  check(
    'platform dispatch requires a non-empty reason',
    /if\s*\(!reason\)/.test(governanceSource),
    'every cross-tenant actuation must be attributable',
  );
  check(
    'platform dispatch verifies device ownership against the named tenant',
    /findFirst\(\{[\s\S]{0,200}id:\s*deviceId,\s*tenantId\s*\}/.test(governanceSource),
  );
  check(
    'platform dispatch service requires an actor membership and audits with it',
    /actorMembershipId:\s*string;/.test(governanceSource) &&
      /actorMembershipId:\s*input\.actorMembershipId/.test(governanceSource) &&
      !/actorMembershipId\s*\?\s*:/.test(governanceSource),
  );
  check(
    'platform dispatch writes an audit record',
    (governanceSource.match(/rbacAuditLog\.create/g) ?? []).length >= 2,
    'both the success and the failure path must be audited',
  );
  check(
    'workers surface refuses to invent liveness',
    governanceSource.includes('UNAVAILABLE_BY_CONTRACT') &&
      governanceSource.includes('livenessSignal'),
  );
  // The invariant is that the listing is labelled as per-device *observed* metadata and that
  // the console is told the truth about templates -- not that templates are absent.
  //
  // It used to assert `templateEntity: 'ABSENT'`, which was correct until
  // `CapabilityTemplate` landed. Left in place it would have failed every future run while
  // teaching the wrong lesson: the obvious "fix" is to put the string back, and then the console
  // tells operators a product with a template lifecycle has no templates. Asserting the invariant
  // instead means the guard survives the next lifecycle change -- and if someone does make the
  // two claims contradict each other, the second half of this check is what notices.
  check(
    'capability versioning is labelled as per-device observed metadata',
    governanceSource.includes('PER_DEVICE_METADATA') &&
      governanceSource.includes('per-device observed metadata'),
  );
  check(
    'the capability lifecycle contract does not claim templates are absent while they exist',
    !governanceSource.includes("templateEntity: 'ABSENT'"),
  );
}

if (existsSync(join(root, 'src/metrics/metrics.service.ts'))) {
  const metricsSource = read('src/metrics/metrics.service.ts');
  check('metrics service exposes a structured snapshot', /snapshot\(\)/.test(metricsSource));
  // snapshot() emits one family per counter and one per histogram, so both branches must
  // derive `recorded` from the values map. Matching the regex once was not enough.
  const recordedAssignments = [
    ...stripComments(metricsSource).matchAll(/recorded:\s*([^,\n;]+)[,;]/g),
  ]
    .map((match) => match[1].trim())
    .filter((value) => value !== 'boolean');
  check(
    'metrics snapshot derives recorded for every family branch',
    recordedAssignments.length === 2,
    `expected 2 recorded assignments, found ${recordedAssignments.length}`,
  );
  check(
    'metrics snapshot distinguishes unrecorded families from zero',
    recordedAssignments.length === 2 &&
      recordedAssignments.every((value) => /definition\.values\.size\s*>\s*0/.test(value)),
    `recorded assignments: ${JSON.stringify(recordedAssignments)}`,
  );
}

// The prepush gate runs `wave2:test:targeted`, which uses jest --runTestsByPath with an
// explicit file list. A spec that is not in that list is never executed by the gate, so the
// catalog's bidirectional test would silently stop protecting anything while still passing when
// run by hand.
const packageJson = JSON.parse(read('package.json'));
const targetedTests = (packageJson.scripts?.['wave2:test:targeted'] ?? '')
  .split('--runTestsByPath')[1]
  ?.trim()
  .split(/\s+/) ?? [];
check(
  'rbac permission catalog spec runs in the prepush gate',
  targetedTests.includes('src/rbac/rbac-permission-catalog.spec.ts'),
  'wave2:test:targeted uses --runTestsByPath, so an unlisted spec is never executed by the gate',
);
check(
  'device-derived domain access contract runs in the prepush gate',
  targetedTests.includes('src/rbac/domain-access-model.spec.ts'),
  'GitHub Full Jest previously caught stale Scene/Schedule authorization assertions that local pre-push missed',
);
check(
  'Development Kit execution-workflow contract runs in the prepush gate',
  targetedTests.includes('test/module-execution-efficiency.contract.spec.ts'),
  'GitHub Full Jest previously caught stale session/workflow assertions that local pre-push missed',
);
check('wave2 targeted test list is not empty', targetedTests.length > 0);

for (const requiredTest of [
  'src/admin-operations/tenant-creation-meters.contract.spec.ts',
  'test/historical-contract-transition-safety.contract.spec.ts',
  'test/module-10-admin-web-operational-summary-route.spec.ts',
  'test/module-10-admin-web-operational-dashboard-ui-foundation.contract.spec.ts',
]) {
  check(
    `GitHub regression suite is covered by targeted prepush: ${requiredTest}`,
    targetedTests.includes(requiredTest),
    'GitHub run 37206734123 exposed this suite after the previous local gate had already passed',
  );
}
check(
  'wave3 full local prepush runs complete Jest before firmware self-test',
  (packageJson.scripts?.['wave3:prepush:check'] ?? '').includes('npm test -- --runInBand'),
  'targeted Jest is an early gate, not a replacement for the GitHub-equivalent full Jest suite',
);

// ---------------------------------------------------------------------------
// Command status vocabulary.
//
// The user-web and mobile clients poll a submitted command until it settles, and they used to
// carry a hand-written list of the three terminal statuses. A status added to the Prisma enum
// later would have been treated as still-in-flight, so the poll would never return and the user
// would see a spinner with no result — a silent failure on a user-facing write path. The
// terminal set is now derived from the full vocabulary, defaulting a new status to terminal so
// it fails safe.
// ---------------------------------------------------------------------------

function prismaEnumValues(enumName) {
  const schema = read('prisma/schema.prisma');
  const match = new RegExp(`enum\\s+${enumName}\\s*\\{([^}]*)\\}`).exec(schema);
  if (!match) return null;
  return match[1]
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('//'));
}

function constArrayValues(source, constName) {
  const match = new RegExp(`${constName}\\s*(?::[^=]+)?=\\s*\\[([\\s\\S]*?)\\]`).exec(source);
  if (!match) return null;
  return [...match[1].matchAll(/'([^']+)'/g)].map((entry) => entry[1]);
}

const commandStatusEnum = prismaEnumValues('CommandStatus');
check('prisma CommandStatus enum is readable', Array.isArray(commandStatusEnum));

const COMMAND_STATUS_SOURCES = [
  ['admin-web contracts', 'apps/admin-web/lib/contracts.ts'],
  ['user-web contracts', 'apps/user-web/lib/contracts.ts'],
  ['user-mobile contracts', 'apps/user-mobile/src/contracts.ts'],
];
for (const [label, path] of COMMAND_STATUS_SOURCES) {
  if (!existsSync(join(root, path))) {
    check(`${label} exists`, false);
    continue;
  }
  const source = read(path);
  const mirrored = constArrayValues(source, 'COMMAND_STATUSES');
  check(
    `${label} mirrors the prisma CommandStatus enum exactly`,
    Array.isArray(mirrored) &&
      Array.isArray(commandStatusEnum) &&
      mirrored.length === commandStatusEnum.length &&
      mirrored.every((value, index) => value === commandStatusEnum[index]),
    `mirrored=${JSON.stringify(mirrored)} enum=${JSON.stringify(commandStatusEnum)}`,
  );
  const inFlight = constArrayValues(source, 'IN_FLIGHT_COMMAND_STATUSES');
  check(`${label} declares the in-flight command statuses`, Array.isArray(inFlight) && inFlight.length > 0);
  check(
    `${label} derives the terminal command set instead of hard-coding it`,
    /TERMINAL_COMMAND_STATUSES[\s\S]{0,400}COMMAND_STATUSES\.filter\(/.test(source) &&
      !/TERMINAL_COMMAND_STATUSES\s*[:=][\s\S]{0,120}['"]ACKNOWLEDGED['"]/.test(source),
    'a literal terminal list silently ignores enum members added later',
  );
}

const COMMAND_CLIENTS = [
  'apps/user-web/components/device-detail-experience.tsx',
  'apps/user-web/components/widget-card.tsx',
  'apps/user-mobile/src/device-control/mobile-device-client.ts',
];
for (const path of COMMAND_CLIENTS) {
  check(
    `command polling client ${path} has no hand-written terminal status list`,
    existsSync(join(root, path)) &&
      !read(path).includes('TERMINAL_COMMAND_STATES') &&
      !/'ACKNOWLEDGED',\s*\n?\s*'FAILED',\s*\n?\s*'TIMED_OUT'/.test(read(path)),
  );
}

// ---------------------------------------------------------------------------
// Every API proxy must resolve to a real backend route.
//
// A proxy whose backend target does not exist is a page that can only ever fail: the fetch
// resolves, the route runs, and the operator sees an error with no way to tell it apart from a
// genuine backend outage. The route is composed of @Controller('<prefix>') plus the segment in
// @Get/@Post, so a plain search for the joined path never matches.
//
// Note on routes with no in-app caller: that is not automatically dead. A stateless endpoint
// such as the email-verification landing route is entered from a link in an email.
// ---------------------------------------------------------------------------

function backendRoutes() {
  const routes = new Set();
  for (const file of listFiles(join(root, 'src'))) {
    if (!file.endsWith('.controller.ts')) continue;
    const source = stripComments(readFileSync(file, 'utf8'));
    const controller = /@Controller\(\s*'([^']+)'\s*\)/.exec(source);
    if (!controller) continue;
    const prefix = controller[1].replace(/\/$/, '');
    for (const verb of source.matchAll(/@(Get|Post|Patch|Put|Delete)\(\s*'([^']*)'\s*\)/g)) {
      const segment = verb[2].replace(/^\//, '').replace(/\/$/, '');
      routes.add('/' + [prefix, segment].filter(Boolean).join('/'));
    }
  }
  return routes;
}

const BACKEND_ROUTES = backendRoutes();
check('backend route table is non-empty', BACKEND_ROUTES.size > 0, `discovered ${BACKEND_ROUTES.size} routes`);

const TARGET_HINTS = [
  { matcher: /\/api\/auth\/verify-email/, reason: 'external email-link entry point' },
  { matcher: /\/api\/auth\/(login|logout|refresh)/, reason: 'session bootstrap' },
];

function collectProxyTargets() {
  const found = [];
  for (const app of ['admin-web', 'user-web']) {
    const apiRoot = join(root, 'apps', app, 'app', 'api');
    if (!existsSync(apiRoot)) continue;
    for (const dir of listFiles(apiRoot)) {
      if (!dir.endsWith('route.ts')) continue;
      const source = stripComments(readFileSync(dir, 'utf8'));
      const proxyPath = '/' + relative(apiRoot, dir).replace(/route\.ts$/, '');
      for (const match of source.matchAll(/client\.request\(\s*[`'"]([^`'"]+)[`'"]/g)) {
        found.push({ file: relative(join(root, 'apps', app), dir), proxyPath, target: match[1] });
      }
      for (const match of source.matchAll(/backendFetch\(\s*[`'"]([^`'"]+)[`'"]/g)) {
        found.push({ file: relative(join(root, 'apps', app), dir), proxyPath, target: match[1] });
      }
    }
  }
  return found;
}

const proxyTargets = collectProxyTargets();
const unresolvedProxyTargets = proxyTargets.filter((entry) => {
  if (TARGET_HINTS.some((hint) => hint.matcher.test(entry.proxyPath))) return false;
  const staticTarget = entry.target.split('?')[0].split('`')[0];
  if (/\$\{/.test(staticTarget)) return false;
  const bare = staticTarget.replace(/\$\{[^}]*\}/g, '').replace(/\/$/, '');
  return !(
    BACKEND_ROUTES.has(bare) ||
    [...BACKEND_ROUTES].some(
      (route) => route.startsWith(bare + '/') || bare.startsWith(route + '/'),
    )
  );
});
check(
  'api proxy coverage is non-trivial',
  proxyTargets.length >= 40,
  `discovered ${proxyTargets.length} proxy targets`,
);
check(
  'every statically-checkable api proxy target resolves to a real backend route',
  unresolvedProxyTargets.length === 0,
  `${proxyTargets.length - unresolvedProxyTargets.length}/${proxyTargets.length} resolved; unresolved: ${JSON.stringify(
    unresolvedProxyTargets.map((entry) => entry.proxyPath + ' -> ' + entry.target),
  )}`,
);

// ---------------------------------------------------------------------------
// Billing routes must not render one surface under two menu labels.
// ---------------------------------------------------------------------------

const BILLING_PAGES = [
  'apps/admin-web/app/super/subscriptions/page.tsx',
  'apps/admin-web/app/super/quotas/page.tsx',
];
for (const path of BILLING_PAGES) {
  check(`billing page ${path} is source-controlled`, existsSync(join(root, path)));
}
if (BILLING_PAGES.every((path) => existsSync(join(root, path)))) {
  const subscriptionPage = read(BILLING_PAGES[0]);
  const quotasPage = read(BILLING_PAGES[1]);
  check(
    'subscriptions page renders only the subscription view',
    /<SuperSubscriptionsContent\s+view="subscriptions"\s*\/>/.test(subscriptionPage),
  );
  check(
    'quotas page renders only the plan/quota view',
    /<SuperSubscriptionsContent\s+view="plans"\s*\/>/.test(quotasPage),
  );
  check(
    'billing routes no longer render an unscoped duplicate surface',
    !/<SuperSubscriptionsContent\s*\/>/.test(subscriptionPage) &&
      !/<SuperSubscriptionsContent\s*\/>/.test(quotasPage),
  );
}

const GOVERNANCE_UI = [
  ['capability versioning panel', 'SuperCapabilityVersionsPanel', 'apps/admin-web/app/super/capabilities/page.tsx'],
  ['workers panel', 'SuperWorkersPanel', 'apps/admin-web/app/super/monitoring/page.tsx'],
  ['platform dispatch panel', 'SuperCommandDispatchPanel', 'apps/admin-web/app/super/commands/page.tsx'],
];
for (const [label, component, path] of GOVERNANCE_UI) {
  if (!existsSync(join(root, path))) {
    check(`${label} page is source-controlled`, false);
    continue;
  }
  const pageSource = read(path);
  check(
    `${label} is imported on its page`,
    pageSource.includes(`from '@/components/${component.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()}'`),
    `expected import of ${component} from @/components/`,
  );
  check(
    `${label} is rendered on its page`,
    new RegExp(`<${component}\\s*/?>`).test(pageSource),
    'a built surface that is not mounted is unreachable',
  );
}

const GOVERNANCE_UI_SOURCES = [
  ['capability versioning panel', 'apps/admin-web/components/super-capability-versions-panel.tsx'],
  ['workers panel', 'apps/admin-web/components/super-workers-panel.tsx'],
  ['platform dispatch panel', 'apps/admin-web/components/super-command-dispatch-panel.tsx'],
];
for (const [label, path] of GOVERNANCE_UI_SOURCES) {
  check(`${label} is source-controlled`, existsSync(join(root, path)));
}

const GOVERNANCE_PROXIES = [
  'apps/admin-web/app/api/super/rbac/permission-catalog/route.ts',
  'apps/admin-web/app/api/super/rbac/custom-roles/route.ts',
  'apps/admin-web/app/api/super/rbac/audit/route.ts',
  'apps/admin-web/app/api/super/capabilities/versions/route.ts',
  'apps/admin-web/app/api/super/runtime-signals/route.ts',
  'apps/admin-web/app/api/super/commands/dispatch/route.ts',
];
for (const path of GOVERNANCE_PROXIES) {
  check(`governance proxy ${path} exists`, existsSync(join(root, path)));
  if (!existsSync(join(root, path))) continue;
  const proxySource = read(path);
  // Checking only for the identifier was not enough: a mutation that rewrites the call site
  // but leaves the import satisfies `includes('proxyBackend')`.
  check(
    `governance proxy ${path} forwards to the backend`,
    /proxyBackend\(/.test(proxySource) &&
      /export\s+async\s+function\s+(GET|POST)/.test(proxySource),
  );
}

// ---------------------------------------------------------------------------
// Menu foundation: every product page is reachable, and every menu entry resolves.
//
// These were lost when a file was truncated and only the last committed generation was
// recoverable. They are the guardrails written for the original complaint — menus that did
// not match the program foundation — so they are rebuilt here and, unlike the rest, every one
// is re-proven below by a real mutation rather than by a green run.
//
// Three page classes are deliberately excluded from reachability: the app root and any page
// that only forwards elsewhere, dynamic route segments (resolved to their static prefix), and
// API routes, which are not navigation.
// ---------------------------------------------------------------------------

const NON_PRODUCTION_LABEL = /belum produksi|beta|laboratorium|quarantine|experimental/i;

/** Shell component -> the app route tree it owns. */
const ADMIN_SHELLS = [
  { file: 'apps/admin-web/components/admin-shell-v3.tsx', app: 'apps/admin-web/app' },
  { file: 'apps/admin-web/components/super-admin-shell.tsx', app: 'apps/admin-web/app' },
  { file: 'apps/admin-web/components/tenant-shell.tsx', app: 'apps/admin-web/app' },
];
const SHELL_ROUTE_PREFIX = {
  'admin-shell-v3.tsx': /^\/field/,
  'super-admin-shell.tsx': /^\/super/,
  'tenant-shell.tsx': /^\/tenant/,
};

/** Splits a shell's nav array into labelled groups of hrefs. */
function parseNavGroups(source) {
  const groups = [];
  for (const match of source.matchAll(
    /label:\s*'([^']+)'[\s\S]{0,200}?items:\s*\[([\s\S]*?)\]/g,
  )) {
    const hrefs = [...match[2].matchAll(/href:\s*'([^']+)'/g)].map((entry) => entry[1]);
    groups.push({ label: match[1], hrefs });
  }
  return groups;
}

function pageRoutes(appRoot) {
  const routes = [];
  for (const file of listFiles(join(root, appRoot))) {
    if (!file.endsWith('page.tsx')) continue;
    // relative() returns the app root as bare 'page.tsx', with no leading separator, so the
    // replacement below does not match it. Anchoring on the optional separator is what keeps
    // the root from being reported as a route literally named '/page.tsx'.
    const relativePath = relative(join(root, appRoot), file);
    // The separator is optional on the left because the app root yields a bare 'page.tsx'.
    const trimmed = relativePath.replace(/(^|[/\\])page\.tsx$/, '');
    routes.push({
      route: trimmed === '' ? '/' : '/' + trimmed.replace(/\/$/, ''),
      file: relative(root, file),
      source: readFileSync(file, 'utf8'),
    });
  }
  return routes;
}

const ALL_ADMIN_PAGES = pageRoutes('apps/admin-web/app');
const USER_WEB_PAGES = pageRoutes('apps/user-web/app');

/** A page is a forwarding page if it exists only to redirect or hand off elsewhere. */
function isForwardingPage(entry) {
  return /redirect\(/.test(entry.source) || /<Redirect\s*\/?>/.test(entry.source);
}

// Route segments that are dynamic resolve to their static prefix: /perangkat-saya/[deviceId]
// is reachable once /perangkat-saya is in the menu, so the dynamic leaf is not a separate
// navigation target.
function staticRoute(route) {
  return route.replace(/\/\[[^\]]+\]/g, '');
}

const allNavHrefs = new Set();
for (const shell of ADMIN_SHELLS) {
  if (!existsSync(join(root, shell.file))) continue;
  for (const group of parseNavGroups(read(shell.file))) {
    for (const href of group.hrefs) allNavHrefs.add(href);
  }
}

// Pre-login routes are destinations an operator types or follows from an error, never
// navigation targets, so requiring them in a signed-in menu would be wrong. auth-shell is a
// bare frame with no menu at all, which is the correct shape for the unauthenticated state.
// `/verifikasi` belongs here for the same reason as the other three: it is reached from the
// registration success message and from the login page, and an unverified account cannot
// hold a session, so it can never appear in a signed-in shell menu.
const PRE_LOGIN_ROUTES = [
  '/login',
  '/daftar',
  '/lupa-password',
  '/reset-password',
  '/verifikasi',
];

const UNREACHABLE_ADMIN_PAGES = ALL_ADMIN_PAGES.filter(
  (entry) =>
    entry.route !== '/' &&
    !entry.route.startsWith('/api') &&
    !PRE_LOGIN_ROUTES.includes(entry.route) &&
    !isForwardingPage(entry) &&
    ![...allNavHrefs].some((href) => staticRoute(href) === staticRoute(entry.route)),
);
check(
  'every non-legacy product page is reachable from a shell menu',
  UNREACHABLE_ADMIN_PAGES.length === 0,
  UNREACHABLE_ADMIN_PAGES.map((entry) => entry.route).join(', '),
);

// Every href a user can click must resolve to a real page or a real API route. A menu entry
// that 404s is worse than a missing one: it advertises a capability that does not exist.
const DEAD_MENU_ENTRIES = [];
for (const shell of ADMIN_SHELLS) {
  if (!existsSync(join(root, shell.file))) continue;
  for (const group of parseNavGroups(read(shell.file))) {
    for (const href of group.hrefs) {
      const target = href.split('?')[0].split('#')[0].replace(/\/$/, '') || '/';
      if (target.startsWith('/api')) continue;
      const candidate = join(root, shell.app, target.replace(/^\//, ''), 'page.tsx');
      if (existsSync(candidate)) continue;
      // Dynamic segments: /x/[id] resolves if the folder /x exists with any page under it.
      const base = join(root, shell.app, target.replace(/\/\[[^\]]+\]$/, ''));
      if (existsSync(base) && listFiles(base).some((f) => f.endsWith('page.tsx'))) continue;
      DEAD_MENU_ENTRIES.push(shell.file + ' -> ' + href);
    }
  }
}
check(
  'every shell menu entry resolves to a real page',
  DEAD_MENU_ENTRIES.length === 0,
  DEAD_MENU_ENTRIES.slice(0, 8).join(', '),
);

const QUARANTINE_ROUTES = ['/noc', '/technician', '/cctv', '/mobile-preview'];
for (const route of QUARANTINE_ROUTES) {
  let owner = null;
  for (const shell of ADMIN_SHELLS) {
    if (!existsSync(join(root, shell.file))) continue;
    const group = parseNavGroups(read(shell.file)).find((candidate) =>
      candidate.hrefs.includes(route),
    );
    if (group) {
      owner = { shell: shell.file, group };
      break;
    }
  }
  check(
    `quarantined ${route} stays reachable from a labelled non-production group`,
    owner !== null && NON_PRODUCTION_LABEL.test(owner.group.label),
    owner === null
      ? 'the route is not in any nav group at all'
      : `found in group "${owner.group.label}", which is not labelled non-production`,
  );
}

const QUARANTINE_IN_PRODUCT_GROUP = [];
for (const shell of ADMIN_SHELLS) {
  if (!existsSync(join(root, shell.file))) continue;
  for (const group of parseNavGroups(read(shell.file))) {
    if (NON_PRODUCTION_LABEL.test(group.label)) continue;
    for (const href of group.hrefs) {
      if (QUARANTINE_ROUTES.includes(href)) QUARANTINE_IN_PRODUCT_GROUP.push(href);
    }
  }
}
check(
  'quarantined pages never sit in an unlabelled product navigation group',
  QUARANTINE_IN_PRODUCT_GROUP.length === 0,
  QUARANTINE_IN_PRODUCT_GROUP.join(', '),
);

// ---------------------------------------------------------------------------
// User Web foundation.
//
// User Web originally shipped with no navigation at all: two competing frames, a dashboard that
// rendered neither, the design-system stylesheet never loaded, and the documented light theme
// never applied. These four checks hold that closed.
// ---------------------------------------------------------------------------

const USER_SHELL = 'apps/user-web/components/user-shell.tsx';
check('User Web shell is source-controlled', existsSync(join(root, USER_SHELL)));
if (existsSync(join(root, USER_SHELL))) {
  const userShellSource = read(USER_SHELL);
  check(
    'User Web uses the shared design-system frame and one navigable menu',
    /design-system/.test(userShellSource) &&
      /from 'next\/link'/.test(userShellSource) &&
      /aria-current/.test(userShellSource),
    'a menu built on plain anchors cannot report its own active route to assistive tech',
  );
  check(
    'User Web owns session logout in the shell',
    /(logout|signOut|keluar)/i.test(userShellSource),
  );
  check(
    'User Web page content does not duplicate session logout',
    listFiles(join(root, 'apps/user-web'))
      .filter((file) => file.endsWith('.tsx'))
      .filter((file) => !file.endsWith(USER_SHELL))
      .filter((file) => /(logout|signOut)/i.test(readFileSync(file, 'utf8')))
      .filter((file) => !file.endsWith('page.tsx') || isForwardingPage({ source: readFileSync(file, 'utf8') }))
      .map((file) => relative(root, file))
      .join(', ') === '',
    'two logout controls means two session handlers that can disagree',
  );
}

const USER_PAGES_WITHOUT_SHELL = USER_WEB_PAGES.filter(
  (entry) => entry.route !== '/' && !isForwardingPage(entry) && !entry.source.includes('<UserShell'),
);
check(
  'every User Web page renders the one UserShell instead of a menu-less product frame',
  USER_PAGES_WITHOUT_SHELL.length === 0,
  USER_PAGES_WITHOUT_SHELL.map((entry) => entry.route).join(', '),
);

const userWebLayout = read('apps/user-web/app/layout.tsx');
const userWebGlobals = read('apps/user-web/app/globals.css');
check(
  'User Web loads the design-system stylesheet and opts into the documented light theme',
  /@iot-platform\/design-system\/styles\.css/.test(userWebGlobals) &&
    /<html[^>]*\bdata-theme="light"/.test(userWebLayout),
  'without the import the shell renders unstyled, and without the attribute it renders in the wrong theme',
);

// ---------------------------------------------------------------------------
// Declared-but-unproduced response fields.
//
// Three real defects of exactly this shape existed and none of the earlier guardrails could
// see them, because each one is a perfectly valid optional property:
//
//   - tenant-historical-content.tsx declared numericValue/boolValue/textValue/recordedAt and
//     quality. The telemetry service emits value, unit and createdAt only, so `quality`
//     rendered a table column that could only ever be an em dash, and readingValue() walked
//     three permanently dead branches before reaching the field that did exist.
//   - device-control.ts declared lastSeenAt. Device has lastHeartbeatAt; there is no
//     lastSeenAt column.
//   - super-command-dispatch-panel.tsx declared TenantRow.slug. Tenant has id, name and
//     timestamps; there is no slug column.
//
// The test is a field-name cross-reference: every property on a non-presentational interface
// in the three apps must occur somewhere in backend source or in the Prisma schema. Comments
// are stripped first, because these fixes name the fields they removed in their own doc
// comment and that is not a defect.
// ---------------------------------------------------------------------------

const UI_FIELD_ROOTS = ['apps/admin-web', 'apps/user-web', 'apps/user-mobile/src'];
const NON_RESPONSE_INTERFACE_NAMES = /(Props|State|Options|Config|Context|Variant|Theme|Tokens?)$/;
// Names that are legitimately not columns and not backend properties: React and layout keys, and
// fields a client derives or invents about its own request.
//
// The Wave 7 entries are the second kind, and each is load-bearing rather than convenient — they are
// the fields whose absence was the defect. `wasSent` exists so a row cannot claim delivery on the
// strength of a stale `status` label; `destinationListed` states that the list route omits the
// address on purpose; `droppedRows` lets the server's `total` and the client's rendered count be
// reconciled; `appliedStatus` names the filter that actually went out, so a silently dropped filter
// cannot pass for a working one. Each is pinned by a spec assertion, which is what distinguishes
// them from the unproduced fields this check exists to catch.
const NON_RESPONSE_FIELD_NAMES = new Set([
  'children', 'key', 'ref', 'className', 'style', 'id', 'type', 'name', 'label', 'value',
  'icon', 'href', 'path', 'title', 'description', 'error', 'message', 'ok', 'total', 'items',
  'badge', 'tone', 'fetcher', 'sessionStore', 'apiOrigin', 'widgetData', 'selectedDashboardId',
  'wasSent', 'destinationListed', 'droppedRows', 'appliedStatus',
  // Device-local display settings. `locale` and `appearance` are read from the phone's own secure
  // storage and never cross the wire, so no backend property of those names exists or should.
  'locale', 'appearance',
]);

function backendCorpus() {
  let corpus = '';
  for (const relativeRoot of ['src', 'prisma']) {
    const absoluteRoot = join(root, relativeRoot);
    if (!existsSync(absoluteRoot)) continue;
    for (const file of listFiles(absoluteRoot)) {
      if (file.endsWith('.spec.ts')) continue;
      corpus += readFileSync(file, 'utf8');
    }
  }
  return corpus;
}

function unproducedUiFields(corpus) {
  const found = [];
  for (const relativeRoot of UI_FIELD_ROOTS) {
    const absoluteRoot = join(root, relativeRoot);
    if (!existsSync(absoluteRoot)) continue;
    for (const file of listFiles(absoluteRoot)) {
      if (!/\.(ts|tsx)$/.test(file) || file.endsWith('.spec.ts')) continue;
      const code = stripComments(readFileSync(file, 'utf8'));
      for (const match of code.matchAll(
        /\b(?:interface|type)\s+([A-Z]\w*)\s*(?:=\s*)?\{([^}]{0,1400})\}/g,
      )) {
        const name = match[1];
        if (NON_RESPONSE_INTERFACE_NAMES.test(name)) continue;
        for (const field of match[2].matchAll(/^\s*([a-zA-Z_]\w*)\??\s*:/gm)) {
          const property = field[1];
          if (NON_RESPONSE_FIELD_NAMES.has(property)) continue;
          if (new RegExp('\\b' + property + '\\b').test(corpus)) continue;
          // listFiles returns absolute paths. `relative(join(root, file))` — one argument —
          // throws the moment a field is actually unproduced, which kills the validator
          // instead of reporting a failure. Second occurrence of this exact bug in one
          // session, so the whole file is now swept for the pattern rather than just the
          // function being written.
          found.push(relative(root, file) + '::' + name + '.' + property);
        }
      }
    }
  }
  return found;
}

const backendCorpusText = backendCorpus();
const unproducedFields = unproducedUiFields(backendCorpusText);
check(
  'no ui response interface declares a field the backend never produces',
  unproducedFields.length === 0,
  `${unproducedFields.length} unproduced: ${unproducedFields.slice(0, 8).join(', ')}`,
);

// The historical telemetry table is the one place these fields were rendered, so a column
// that can only be empty is asserted directly rather than left to the field cross-reference.
if (existsSync(join(root, 'apps/admin-web/components/tenant-historical-content.tsx'))) {
  const historical = stripComments(
    read('apps/admin-web/components/tenant-historical-content.tsx'),
  );
  check(
    'historical telemetry table declares only fields the telemetry service emits',
    // The optional marker is part of the field, so the pattern must allow it. Written without
    // it the check failed against its own correct fix.
    /value\?:\s*unknown/.test(historical) &&
      /createdAt\?:\s*string/.test(historical) &&
      !/quality|numericValue|boolValue|textValue|recordedAt/.test(historical),
    'GET /telemetry/history emits value, unit and createdAt only',
  );
  check(
    'historical telemetry table has no permanently-empty column',
    !/Kualitas/.test(historical),
    'a column whose only possible value is an em dash is a surface claiming a signal it lacks',
  );
}
check(
  'device list item mirrors the device model heartbeat column',
  /lastHeartbeatAt/.test(read('apps/admin-web/lib/device-control.ts')) &&
    !/lastSeenAt/.test(stripComments(read('apps/admin-web/lib/device-control.ts'))),
  'Device has lastHeartbeatAt and no lastSeenAt',
);
if (existsSync(join(root, 'apps/admin-web/components/super-command-dispatch-panel.tsx'))) {
  const dispatch = stripComments(
    read('apps/admin-web/components/super-command-dispatch-panel.tsx'),
  );
  check(
    'tenant rows do not declare a slug the tenant model does not have',
    !/\bslug\??\s*:/.test(dispatch),
    'Tenant exposes id, name, createdAt and updatedAt',
  );
}

// ---------------------------------------------------------------------------
// Proxy verb fidelity.
//
// A Next route handler whose verb the backend does not serve is either a naming lie or a real
// break, and neither is visible from the proxy file alone. The one case found — a PATCH that
// adapts onto POST /schedules/:id/enable — is legitimate but overstated, and is now documented
// where a reader will see it.
//
// Two rules had to be corrected before this check could be trusted, both of which first
// produced pure noise:
//
//   - Backend paths are declared with `:param`; proxies interpolate `${param}`. Both sides must
//     be canonicalised to the same wildcard or every parameterised route reads as unmatched.
//   - "the called verb must equal the exported verb" is wrong. A GET that adapts a query
//     parameter into a backend POST is a valid stateless entry point (the email-verification
//     link), and flagging it teaches you to ignore the check.
// ---------------------------------------------------------------------------

function canonicalRoutePath(value) {
  return (
    '/' +
    value
      .split('?')[0]
      .replace(/\$\{[^}]*\}/g, ':param')
      .replace(/:[A-Za-z_]\w*/g, ':param')
      .split('/')
      .filter(Boolean)
      .map((segment) => (segment === 'param' ? ':param' : segment))
      .join('/')
  );
}

const backendVerbTable = (() => {
  const table = new Map();
  for (const file of listFiles(join(root, 'src'))) {
    if (!file.endsWith('.controller.ts')) continue;
    const source = stripComments(readFileSync(file, 'utf8'));
    const controller = /@Controller\(\s*'([^']+)'\s*\)/.exec(source);
    if (!controller) continue;
    const prefix = controller[1].replace(/^\//, '').replace(/\/$/, '');
    for (const verb of source.matchAll(/@(Get|Post|Patch|Put|Delete)\(\s*'([^']*)'\s*\)/g)) {
      const full = canonicalRoutePath([prefix, verb[2]].filter(Boolean).join('/'));
      if (!table.has(full)) table.set(full, new Set());
      table.get(full).add(verb[1].toUpperCase());
    }
  }
  return table;
})();

const VERB_ADAPTER_PROXIES = [
  // (file, exported verb, backend verb, backend path) — deliberate adapters, each documented
  // at its definition.
  ['apps/admin-web/app/api/auth/verify-email/route.ts', 'GET', 'POST', '/auth/verify-email'],
  [
    'apps/admin-web/app/api/tenant/schedules/[scheduleId]/route.ts',
    'PATCH',
    'POST',
    '/schedules/:param/enable',
  ],
];

const verbMismatches = [];
let verbCallsChecked = 0;
for (const app of ['admin-web', 'user-web']) {
  const apiRoot = join(root, 'apps', app, 'app', 'api');
  if (!existsSync(apiRoot)) continue;
  for (const file of listFiles(apiRoot)) {
    if (!file.endsWith('route.ts')) continue;
    const relativeFile = relative(root, file);
    const source = stripComments(readFileSync(file, 'utf8'));
    for (const handler of source.matchAll(
      /export\s+async\s+function\s+(GET|POST|PATCH|PUT|DELETE)\s*\([^)]*\)\s*\{/g,
    )) {
      const exported = handler[1];
      const next = /export\s+async\s+function\s+(?:GET|POST|PATCH|PUT|DELETE)\s*\(/.exec(
        source.slice(handler.index + handler[0].length),
      );
      const body = next
        ? source.slice(
            handler.index + handler[0].length,
            handler.index + handler[0].length + next.index,
          )
        : source.slice(handler.index + handler[0].length);
      for (const call of body.matchAll(
        /(?:client\.request|proxyBackend|backendFetch)\(\s*[`'"]([^`'"]+)[`'"]\s*(?:,\s*\{)?([\s\S]{0,240})/g,
      )) {
        const declared = /method:\s*'([A-Z]+)'/.exec(call[2]);
        const verb = (declared ? declared[1] : exported).toUpperCase();
        const path = canonicalRoutePath(call[1]);
        verbCallsChecked += 1;
        const isDocumentedAdapter = VERB_ADAPTER_PROXIES.some(
          (entry) => entry[0] === relativeFile && entry[1] === exported && entry[3] === path,
        );
        if (isDocumentedAdapter) continue;
        if (verb !== exported) {
          verbMismatches.push(relativeFile + ': export ' + exported + ' calls ' + verb);
        }
        const served = backendVerbTable.get(path);
        if (served && !served.has(verb)) {
          verbMismatches.push(
            relativeFile + ': ' + verb + ' ' + path + ' but backend serves ' + [...served].join('/'),
          );
        }
      }
    }
  }
}
check(
  'api proxy call coverage is non-trivial',
  verbCallsChecked >= 60,
  `checked ${verbCallsChecked} backend calls from proxy handlers`,
);
check(
  'api proxy verbs match the backend routes they call',
  verbMismatches.length === 0,
  verbMismatches.slice(0, 8).join(' | '),
);
for (const [file, exported, backendVerb, backendPath] of VERB_ADAPTER_PROXIES) {
  const absolute = join(root, file);
  if (!existsSync(absolute)) {
    check(`verb adapter ${file} is source-controlled`, false);
    continue;
  }
  // An adapter is only acceptable while the mismatch is written down. Otherwise it is an
  // unexplained naming lie, which is how a future caller comes to expect a general update.
  // Read the raw source, comments included: the explanation lives in prose, so stripping
  // comments here would make the check blind to exactly the thing it requires.
  const adapterSource = readFileSync(absolute, 'utf8');
  const handlerIndex = adapterSource.indexOf('export async function ' + exported);
  const precedingComment = handlerIndex > 0 ? adapterSource.slice(Math.max(0, handlerIndex - 900), handlerIndex) : '';
  const body = adapterSource.slice(handlerIndex, handlerIndex + 900);
  check(
    `verb adapter ${file} ${exported}->${backendVerb} ${backendPath} is documented`,
    /(not a general update|stateless|adapts?|link landing|query parameter|only)/i.test(
      precedingComment + body,
    ),
    'an undocumented verb mismatch is an unexplained naming lie: the handler name promises ' +
      backendVerb + ' ' + backendPath + ' semantics it does not implement',
  );
}

// ---------------------------------------------------------------------------
// Superseded proxies must not come back.
//
// Three Next proxies were removed because each one proxied a backend route that a surviving
// proxy already served, and no in-app caller referenced them:
//
//   api/super/users              -> GET /admin/users          (superseded by api/super/platform-users)
//   api/admin/directory/tenants  -> GET /admin/tenants        (superseded by api/super/tenants)
//   api/operational-summary      -> GET /admin/operational-summary (by api/admin/operational-summary)
//
// The third also carried a loader-normalisation layer and a `{state: 'offline'}` envelope that
// nothing read, because both live consumers derive their view state from the HTTP status. That
// made `operational-summary-loader.ts` dead production code, so it went with the route.
//
// What let all three survive is the interesting part: each was referenced by exactly one test
// and by no product code. The test kept asserting the file's existence, so "no caller" looked
// like "covered". Absence is now asserted directly, and the surviving route is asserted too, so
// deleting the wrong one fails.
// ---------------------------------------------------------------------------

const SUPERSEDED_PROXIES = [
  ['apps/admin-web/app/api/super/users/route.ts', 'apps/admin-web/app/api/super/platform-users/route.ts'],
  [
    'apps/admin-web/app/api/admin/directory/tenants/route.ts',
    'apps/admin-web/app/api/super/tenants/route.ts',
  ],
  [
    'apps/admin-web/app/api/operational-summary/route.ts',
    'apps/admin-web/app/api/admin/operational-summary/route.ts',
  ],
];
for (const [removed, surviving] of SUPERSEDED_PROXIES) {
  check(
    `superseded proxy ${removed} stays deleted`,
    !existsSync(join(root, removed)),
    'a proxy with no caller and a surviving twin is a second HTTP contract for one payload',
  );
  check(
    `surviving proxy ${surviving} is present`,
    existsSync(join(root, surviving)),
  );
}
check(
  'the orphaned operational summary loader stays deleted',
  !existsSync(join(root, 'apps/admin-web/lib/operational-summary-loader.ts')),
  'it was only reachable from the deleted duplicate proxy',
);
check(
  'the operational summary contract is asserted against the surviving proxy',
  existsSync(join(root, 'test/module-10-admin-web-operational-dashboard-ui-foundation.contract.spec.ts')) &&
    read('test/module-10-admin-web-operational-dashboard-ui-foundation.contract.spec.ts').includes(
      "client.request('/admin/operational-summary')",
    ),
  'the field contract must be pinned to the route the UI actually reads',
);

// ---------------------------------------------------------------------------
// The per-domain access model, pinned to what the code actually does.
//
// This started as a note that scene, schedule, automation and dashboard had no role or
// permission guard at all. That is no longer true, and the difference between the domains is
// not cosmetic:
//
//   automation  every route declares a permission; addressed routes also allow the owner.
//               AutomationRepository filters every query by ownerMembershipId, so it is
//               owner-only and an admin gets no automatic access to someone else's automation.
//   dashboard   every route declares a permission; addressed routes also allow the owner.
//               DashboardRepository additionally enforces its audience rule — PERSONAL is
//               owner-only, TENANT_SHARED needs an admin role — and remains the authority.
//   scene       no owner column/ownership resolver; VIEW/CONTROL is derived from action devices.
//   schedule    no owner column/ownership resolver; access inherits the target Scene boundary,
//               with targetless schedules restricted to administrators. Mutations are audited.
//
// The scene/schedule asymmetry is a decision, not an oversight: owner-aware RBAC cannot apply
// without an owner column, so these domains use centralized device access instead of being left
// open to every active tenant member.
//
// The check also fails if `allowOwner` is added to a route that addresses no resource, and if a
// collection route is given one — a create route has no id, so ownership cannot apply to it and
// silently allowing would turn it into an open door.
// ---------------------------------------------------------------------------

const OWNED_DOMAINS = [
  ['src/automation/automation.controller.ts', 'automation', 7],
  ['src/dashboard/dashboard.controller.ts', 'dashboard', 7],
];
for (const [controller, domain, expectedRoutes] of OWNED_DOMAINS) {
  const source = read(controller);
  const guardList = [...source.matchAll(/@UseGuards\(([^)]*)\)/g)].map((m) =>
    m[1].replace(/\s+/g, ''),
  );
  check(
    `${controller} runs the permission guard`,
    guardList.some((g) => g.includes('JwtAuthGuard') && g.includes('TenantContextGuard') && g.includes('RbacPermissionGuard')),
  );

  const pairs = [...source.matchAll(/@(Get|Post|Put|Patch|Delete)\(([^)]*)\)[\s\S]{0,80}?@RequirePermission\(\s*'([^']+)'([^)]*)\)/g)];
  check(
    `${controller} declares a permission on every route (${expectedRoutes})`,
    pairs.length === expectedRoutes,
    `${pairs.length} routes carry @RequirePermission`,
  );

  for (const [, , route, permission, options] of pairs) {
    const addressesResource = route.includes(':');
    const allowsOwner = options.includes('allowOwner');
    check(
      `${controller} ${route} declares allowOwner exactly when it addresses a resource`,
      addressesResource === allowsOwner,
      `route "${route}" with ${allowsOwner ? 'allowOwner' : 'no allowOwner'}`,
    );
    check(
      `${controller} ${route} declares a catalogued permission`,
      read('src/rbac/rbac-permission-catalog.ts').includes(`permission: '${permission}'`),
      `${permission} is not in the catalog`,
    );
  }
}

for (const [controller, domain] of [
  ['src/scene/scene.controller.ts', 'scene'],
  ['src/scheduler/schedule.controller.ts', 'schedule'],
]) {
  const source = read(controller);
  check(
    `${controller} stays outside owner-aware permission routing because it has no owner column`,
    !/@RequirePermission\(/.test(source),
    'owner-aware permission routing is not expressible without an owner column; device-derived authorization must remain present instead',
  );
  check(
    `${controller} records every mutation in the audit log`,
    source.includes('RbacAuditService') && source.includes(`resourceType: '${domain}'`),
    'without an audit row these mutations leave no trace at all',
  );
  check(
    `${controller} mutations are constrained by device-level authorization`,
    domain === 'scene'
      ? source.includes('device-level CONTROL authorization') && source.includes('assertSceneAccess')
      : source.includes('target-scene device authorization') && source.includes('assertTargetSceneAccess'),
  );
}

check(
  'ownership is never registered for a domain that has no owner column',
  !read('src/rbac/rbac.module.ts').includes("register('scene'") &&
    !read('src/rbac/rbac.module.ts').includes("register('schedule'"),
  'a resolver that returned true for an ownerless resource would open it to every member',
);
{
  // Every ownership lookup must be tenant-scoped, not just owner-scoped. Without the tenant
  // predicate a membership could claim a resource in another tenant and reach it through the
  // owner path, which is the one failure this whole mechanism must not have.
  const resolver = read('src/rbac/owned-resource.resolver.ts');
  const clauses = [...resolver.matchAll(/where:\s*\{([^}]*)\}/g)].map((m) => m[1]);
  check(
    'every ownership lookup is scoped by tenant as well as by owner',
    clauses.length > 0 && clauses.every((c) => c.includes('tenantId') && c.includes('ownerMembershipId')),
    `clauses found: ${JSON.stringify(clauses)}`,
  );
}

for (const result of checks) {
  console.log(`${result.pass ? 'PASS' : 'FAIL'}  ${result.name}${result.detail ? ` (${result.detail})` : ''}`);
}

if (failures.length > 0) {
  console.error(`\nRESCUE VALIDATION FAILED (${failures.length})`);
  process.exit(1);
}
console.log(`\nRESCUE VALIDATION PASS (${checks.length}/${checks.length})`);

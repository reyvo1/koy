#!/usr/bin/env node
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const requireText = (source, token, label) => {
  if (!source.includes(token)) throw new Error(`FAIL ${label}: missing ${token}`);
};
const rejectText = (source, token, label) => {
  if (source.includes(token)) throw new Error(`FAIL ${label}: forbidden ${token}`);
};


const metricsTypes = read('src/metrics/metrics.types.ts');
requireText(metricsTypes, "| 'retry_replay'", 'command retry replay metric contract');
requireText(metricsTypes, "| 'retry_raced'", 'command retry race metric contract');
requireText(metricsTypes, "| 'retry_claimed'", 'command retry claimed metric contract');

const command = read('src/device/command.service.ts');
requireText(command, 'async retryPublish(', 'command retry API');
requireText(command, 'status: { in: [CommandStatus.FAILED, CommandStatus.TIMED_OUT] }', 'command retry terminal claim');
requireText(command, 'commandId: command.correlationId', 'command correlation identity reuse');

const dispatcher = read('src/automation/automation-command-dispatcher.ts');
requireText(dispatcher, 'action.dispatchAttemptCount > 1', 'automation retry dispatch branch');
requireText(dispatcher, 'this.commands.retryPublish(', 'automation retry republish');

const retryService = read('src/automation/automation-retry-reservation.service.ts');
requireText(retryService, 'listRetryCandidates', 'durable retry scan');
requireText(retryService, 'AutomationExecutionStatus.PARTIALLY_FAILED', 'partial failure retry');
requireText(retryService, "RETRYABLE_ACTION_ERROR_CODES.has(action.errorCode ?? '')", 'claim-time retry allowlist');
requireText(retryService, 'RETRY_CLAIM_RACE', 'atomic retry claim rollback');
requireText(retryService, "errorCode: PRIOR_ACTION_FAILED", 'ordered skipped-action restoration');

const retryWorker = read('src/automation/automation-retry.worker.ts');
requireText(retryWorker, 'isAutomationRuntimeEnabled()', 'automation retry runtime gate');
requireText(retryWorker, 'claimEligibleRetry(candidate)', 'automation database claim');
requireText(retryWorker, 'dispatchExecution', 'automation retry dispatch');

const automationModule = read('src/automation/automation.module.ts');
requireText(automationModule, 'AutomationRetryWorker', 'automation retry worker registration');

const scheduler = read('src/scheduler/schedule.controller.ts');
requireText(scheduler, 'isSchedulerRuntimeEnabled()', 'scheduler activation gate');
requireText(scheduler, "typeof body?.enabled !== 'boolean'", 'scheduler boolean contract');

const schema = read('prisma/schema.prisma');
requireText(schema, 'DELIVERING', 'notification delivery status');
requireText(schema, 'deliveryLeaseId String?', 'notification lease id');
requireText(schema, 'deliveryLeaseAt DateTime?', 'notification lease time');

const migration = read('prisma/migrations/20260915010000_wave2_notification_delivery_runtime/migration.sql');
requireText(migration, "ADD VALUE IF NOT EXISTS 'DELIVERING'", 'notification delivery migration enum');
requireText(migration, 'ADD COLUMN "deliveryLeaseId" TEXT', 'notification delivery migration lease id');
requireText(migration, 'notifications_status_deliveryLeaseAt_idx', 'notification delivery migration lease index');

const notifications = read('src/notification/notification.service.ts');
requireText(notifications, 'limit: number = NOTIFICATION_LIMITS.defaultDeliveryBatch', 'notification batch limit numeric contract');
requireText(notifications, 'claimTimeoutMs: number = NOTIFICATION_LIMITS.defaultClaimTimeoutMs', 'notification claim-timeout numeric contract');
requireText(notifications, 'claimDueBatch(', 'notification durable claim');
requireText(notifications, 'NOTIFICATION_DELIVERY_LEASE_LOST', 'notification stale lease rejection');
requireText(notifications, 'NOTIFICATION_IDEMPOTENCY_CONFLICT', 'notification idempotency conflict');
requireText(notifications, 'isRetryableDeliveryError', 'notification transient retry policy');
requireText(notifications, 'SELECT clock_timestamp()', 'notification database clock');
requireText(notifications, "channel: 'EMAIL'", 'auth email enqueue');
rejectText(notifications, 'async sendVerificationToken(_email', 'legacy auth no-op');

const notificationWorker = read('src/notification/notification-delivery.worker.ts');
requireText(notificationWorker, "NOTIFICATION_RUNTIME_ENABLED", 'notification runtime gate');
requireText(notificationWorker, 'claimDueBatch(', 'notification worker claim');
requireText(notificationWorker, 'deliverAndRecord', 'notification transport completion');

const notificationModule = read('src/notification/notification.module.ts');
requireText(notificationModule, 'NotificationDeliveryWorker', 'notification worker registration');
requireText(notificationModule, 'EmailRelayTransport', 'notification email transport registration');

const emailRelay = read('src/notification/email-relay.transport.ts');
requireText(emailRelay, "url.protocol !== 'https:'", 'email HTTPS boundary');
requireText(emailRelay, 'authorization: `Bearer ${relayToken}`', 'email relay auth');
requireText(emailRelay, 'EMAIL_RELAY_TIMEOUT', 'email bounded timeout');

const auth = read('src/auth/auth.service.ts');
requireText(auth, 'this.prisma.$transaction(async (transaction)', 'auth notification transaction');
requireText(auth, 'sendVerificationToken(', 'verification enqueue');
requireText(auth, 'sendResetToken(', 'reset enqueue');
requireText(auth, 'transaction,', 'auth notification transaction client');


const automationIntegration = read('test/integration/automation-command-dispatch.integration-spec.ts');
requireText(automationIntegration, 're-arms one persisted failed action and republishes the same command identity after backoff', 'automation durable retry integration');
requireText(automationIntegration, 'retryReservations.claimEligibleRetry', 'automation retry database claim integration');
requireText(automationIntegration, "status: 'SENT'", 'automation retry durable command success');

const integrationConfig = read('test/jest-integration.json');
requireText(integrationConfig, 'test/integration/.*', 'database integration discovery contract');

const notificationIntegration = read('test/integration/notification-runtime.integration-spec.ts');
requireText(notificationIntegration, 'two database clients', 'notification multi-client integration');
requireText(notificationIntegration, 'createServer({ key, cert }', 'notification real local HTTPS receiver');
requireText(notificationIntegration, "code: 'WEBHOOK_HTTP_400'", 'notification terminal HTTP integration');
requireText(notificationIntegration, "code: 'WEBHOOK_HTTP_503'", 'notification retryable HTTP integration');
requireText(notificationIntegration, 'retryEndpointCalls).toBe(2)', 'notification retry success integration');
requireText(notificationIntegration, "import { join } from 'node:path';", 'notification integration uses CommonJS-safe named path import');
rejectText(notificationIntegration, "import path from 'node:path';", 'notification integration rejects fragile default node:path import');
requireText(notificationIntegration, 'let server: Server | undefined;', 'notification integration server lifecycle is explicitly nullable');
requireText(notificationIntegration, 'if (server?.listening)', 'notification integration cleanup tolerates setup failure');
requireText(notificationIntegration, 'if (tenantId)', 'notification integration cleanup guards partial tenant setup');

const acceptanceEvidence = read('docs/ENTERPRISE-ACCEPTANCE-EVIDENCE.md');
requireText(acceptanceEvidence, 'STATIC / CONTRACT', 'evidence tier policy');
requireText(acceptanceEvidence, 'LIVE-SERVICE', 'live service evidence tier');
requireText(acceptanceEvidence, 'PHYSICAL / EXTERNAL', 'physical evidence tier');
requireText(acceptanceEvidence, 'Wave 2 minimum evidence matrix', 'Wave 2 evidence matrix');

const packageJson = JSON.parse(read('package.json'));
if (packageJson.scripts?.['wave2:prisma:check'] !== 'node scripts/check-prisma-schema.mjs') {
  throw new Error('FAIL Wave 2 Prisma schema gate must use the environment-safe wrapper');
}
if (packageJson.scripts?.['wave2:prisma:self-test'] !== 'node scripts/self-test-wave2-prisma-schema-check.mjs') {
  throw new Error('FAIL Wave 2 Prisma schema wrapper self-test must be package-exposed');
}
requireText(
  packageJson.scripts?.['wave2:test:targeted'] ?? '',
  'src/metrics/metrics.service.spec.ts',
  'Wave 2 targeted metrics regression',
);
requireText(
  packageJson.scripts?.['wave2:prepush:check'] ?? '',
  'wave2:prisma:self-test',
  'Wave 2 pre-push Prisma wrapper regression',
);

const prismaSchemaCheck = read('scripts/check-prisma-schema.mjs');
requireText(prismaSchemaCheck, 'SCHEMA_ONLY_DATABASE_URL', 'Prisma schema-only fallback');
requireText(prismaSchemaCheck, "String(environment.DATABASE_URL ?? '').trim()", 'Prisma caller DATABASE_URL preservation');
requireText(prismaSchemaCheck, "for (const command of ['validate', 'generate'])", 'Prisma validate/generate sequence');
requireText(prismaSchemaCheck, 'no live database evidence is claimed', 'Prisma evidence-boundary message');

const prismaSchemaCheckSelfTest = read('scripts/self-test-wave2-prisma-schema-check.mjs');
requireText(prismaSchemaCheckSelfTest, 'preserves a caller-provided DATABASE_URL', 'Prisma explicit environment self-test');
requireText(prismaSchemaCheckSelfTest, 'executes validate then generate exactly once', 'Prisma subprocess ordering self-test');

const config = read('src/config/config.validation.ts');
requireText(config, 'NOTIFICATION_RUNTIME_ENABLED = false', 'notification fail-closed default');
requireText(config, 'const emailRequiredValues = {', 'notification required relay fields');
requireText(config, 'EMAIL_RELAY_URL: validatedConfig.EMAIL_RELAY_URL', 'notification relay URL required');
requireText(config, 'EMAIL_RELAY_TOKEN: validatedConfig.EMAIL_RELAY_TOKEN', 'notification relay token required');
requireText(config, 'EMAIL_FROM: validatedConfig.EMAIL_FROM', 'notification sender required');
requireText(config, 'is required when notification runtime is enabled', 'notification configuration gate');


requireText(
  retryService,
  'commandId: null',
  'automation retry claim clears the terminal command link before returning to DISPATCHING',
);
requireText(
  retryService,
  'dispatchStartedAt: databaseNow',
  'automation retry claim timestamps the new dispatch attempt from the PostgreSQL clock',
);
requireText(
  notificationIntegration,
  'notificationId: item.id',
  'notification runtime integration maps the leased claim DTO into the production transport contract',
);

console.log('PASS  Wave 2 core runtime source invariants');

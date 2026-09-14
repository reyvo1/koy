import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function read(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), 'utf8');
}

describe('Module 11 automation persistence foundation contract', () => {
  const schema = read('prisma/schema.prisma');
  const migration = read(
    'prisma/migrations/20260803010000_module_11_automation_persistence_foundation/migration.sql',
  );
  const repository = read('src/automation/automation.repository.ts');
  const moduleSource = read('src/automation/automation.module.ts');
  const appModule = read('src/app.module.ts');
  const integration = read(
    'test/integration/automation-persistence.integration-spec.ts',
  );
  const documentation = read(
    'docs/module-11-automation-persistence-foundation.md',
  );
  const domainContractTest = read(
    'test/module-11-automation-domain-contract.contract.spec.ts',
  );
  const policy = JSON.parse(read('test/contract-surface-policy.json'));

  it('adds a tenant-scoped automation aggregate and normalized action records', () => {
    for (const model of ['Automation', 'AutomationAction']) {
      expect(schema).toContain(`model ${model} {`);
    }
    for (const domainEnum of [
      'AutomationTriggerKind',
      'AutomationActionKind',
    ]) {
      expect(schema).toContain(`enum ${domainEnum} {`);
    }

    expect(schema).toContain('fields: [ownerMembershipId, tenantId]');
    expect(schema).toContain('fields: [triggerDeviceId, tenantId]');
    expect(schema).toContain('fields: [triggerCapabilityId, triggerDeviceId]');
    expect(schema).toContain('fields: [automationId, tenantId]');
    expect(schema).toContain('fields: [capabilityId, deviceId]');
    expect(schema).toContain('@@unique([automationId, actionId])');
    expect(schema).toContain('@@unique([automationId, position])');
    expect(schema).toContain(
      '@@unique([automationId, deviceId, capabilityId])',
    );
  });

  it('keeps the migration additive with cascade only for owned action rows', () => {
    expect(migration).not.toMatch(/\bDROP\s+(TABLE|COLUMN|TYPE)\b/i);
    expect(migration).toContain('CREATE TABLE "automations"');
    expect(migration).toContain('CREATE TABLE "automation_actions"');
    expect(migration).toContain('automations_trigger_lookup_idx');
    expect(migration).toContain('ON DELETE RESTRICT ON UPDATE CASCADE');
    expect(migration).toContain('ON DELETE CASCADE ON UPDATE CASCADE');
    expect(migration).toContain(
      'FOREIGN KEY ("triggerCapabilityId", "triggerDeviceId")',
    );
    expect(migration).toContain('FOREIGN KEY ("capabilityId", "deviceId")');
  });

  it('provides an owner-scoped atomic repository with optimistic revision control', () => {
    expect(repository).toContain('this.prisma.$transaction');
    expect(repository).toContain('transaction.membership.findUnique');
    expect(repository).toContain('transaction.automation.updateMany');
    expect(repository).toContain('revision: { increment: 1 }');
    expect(repository).toContain('transaction.automationAction.deleteMany');
    expect(repository).toContain('transaction.automationAction.createMany');
    expect(repository).toContain('ownerMembershipId');
    expect(repository).toContain('status: { not: DeviceStatus.REVOKED }');
    expect(repository).toContain('AutomationTriggerKind.CAPABILITY_REPORTED');
    expect(repository).toContain('AutomationActionKind.DEVICE_COMMAND');
    expect(repository).not.toContain('MqttService');
    expect(repository).not.toContain('RedisService');

    expect(moduleSource).toContain('AutomationRepository');
    expect(moduleSource).toMatch(
      /exports:\s*\[[^\]]*\bAutomationRepository\b[^\]]*\]/,
    );
    expect(appModule).toContain('AutomationModule');
  });

  it('keeps activation fail-closed and validates every referenced capability', () => {
    expect(repository).toContain('input.enabled === true');
    expect(repository).toContain(
      'AUTOMATION_PERSISTENCE_ERROR_CODES.ActivationNotApproved',
    );
    expect(repository).toContain(
      'Automation trigger capability must be reportable',
    );
    expect(repository).toContain(
      'Automation condition capability must be readable and reportable',
    );
    expect(repository).toContain(
      'Automation action capability must be writable',
    );
    expect(repository).toContain('assertValueCompatible');
  });

  it('proves revision, tenant isolation, restrict, and cascade behavior in PostgreSQL', () => {
    expect(integration).toContain('expectedRevision');
    expect(integration).toContain(
      'AUTOMATION_PERSISTENCE_ERROR_CODES.RevisionConflict',
    );
    expect(integration).toContain(
      'AUTOMATION_PERSISTENCE_ERROR_CODES.MembershipInvalid',
    );
    expect(integration).toContain(
      'AUTOMATION_PERSISTENCE_ERROR_CODES.TargetInvalid',
    );
    expect(integration).toContain(
      'AUTOMATION_PERSISTENCE_ERROR_CODES.ActivationNotApproved',
    );
    expect(integration).toContain("code: 'P2003'");
    expect(integration).toContain('prisma.automation.delete');
    expect(integration).toContain('prisma.automationAction.count');
  });

  it('documents the bounded foundation and preserves future runtime gates', () => {
    expect(documentation).toContain('Slice 11.2');
    expect(documentation).toContain('enabled=false');
    expect(documentation).toContain('optimistic revision');
    expect(documentation).toContain('does not add an HTTP controller');
    expect(documentation).toContain('does not evaluate triggers');
    expect(documentation).toContain(
      'Production deployment remains **NOT APPROVED**',
    );
  });

  it('keeps the closed Slice 11.1 proof historical instead of freezing current repository state', () => {
    expect(domainContractTest).not.toContain("read('prisma/schema.prisma')");
    expect(domainContractTest).not.toContain("read('src/app.module.ts')");
    expect(domainContractTest).toContain(
      'records the Slice 11.1 contract-only boundary without blocking approved later persistence',
    );
    expect(domainContractTest).toContain(
      'Slice 11.2 persists this exact bounded contract',
    );
  });

  it('classifies the new repository contract before the full Jest gate', () => {
    expect(
      policy.contractClasses[
        'test/module-11-automation-persistence-foundation.contract.spec.ts'
      ],
    ).toBe('stable-contract');
  });
});

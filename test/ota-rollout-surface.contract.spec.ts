/**
 * Pins the OTA surface so the three gaps that made it unreachable cannot return silently.
 *
 * Each assertion here corresponds to a specific failure this repo has already exhibited:
 *
 *  1. `OtaRolloutRepository` existed with a full state machine and six passing tests, and
 *     was absent from `OtaModule.providers`. Nothing could inject it, so no rollout route
 *     could exist. A green repository spec says nothing about reachability.
 *  2. A repository with no caller typechecks and passes every unit test. Only a caller
 *     outside the spec can prove it is wired.
 *  3. The Super Admin "Firmware & OTA" screen issued exactly one GET while the platform
 *     offered no way to create, advance, or report on a rollout at all.
 *
 * The BFF half is checked separately by the shared content-type guard; this spec covers
 * reachability, which that one cannot see.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');
const read = (relative: string) => readFileSync(join(ROOT, relative), 'utf8');

const otaModule = read('src/ota/ota.module.ts');
const otaController = read('src/ota/ota.controller.ts');
const otaRepository = read('src/ota/ota-rollout.repository.ts');
const superFirmware = read('apps/admin-web/components/super-firmware-content.tsx');

/**
 * Comments are stripped before the behavioural assertions run. The repository documents the
 * defect it was fixed for, so its explanation names the old expression verbatim — and a
 * grep that counts the explanation as the defect makes the guard lie in the safe direction
 * forever after the fix lands.
 */
const withoutComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('Module 15 OTA — the rollout surface is reachable', () => {
  it('registers the rollout repository as an injectable provider', () => {
    expect(otaModule).toContain('OtaRolloutRepository');
    expect(otaModule).toMatch(/providers:\s*\[[^\]]*OtaRolloutRepository/);
  });

  it('declares the OTA controller on the module', () => {
    expect(otaModule).toMatch(/controllers:\s*\[[^\]]*OtaController/);
  });

  it('exposes a route for every rollout write the repository can perform', () => {
    // createArtifact, createRollout, transition, recordProgress, findRollout.
    for (const handler of [
      'createArtifact',
      'createRollout',
      'transition',
      'recordProgress',
      'read',
    ]) {
      expect(otaController).toContain(`async ${handler}(`);
    }
  });

  it('takes the tenant from verified context, not from a request body field', () => {
    // A controller that read `dto.tenantId` would let a caller address another tenant.
    const code = withoutComments(otaController);
    expect(code).not.toMatch(/dto\.tenantId|body\.tenantId/);
    expect(code).toMatch(/tenantContext\?*\.tenantId/);
  });

  it('role-gates the surface and records an audit row for every mutation', () => {
    expect(otaController).toContain('AdminRoleGuard');
    expect(otaController).toContain('RbacAuditService');
    expect(otaController).toContain("resourceType: 'ota'");
    // The audit detail must say where permission came from, or a later reader will read the
    // row as an owner check that passed.
    expect(otaController).toContain('no owner column');
  });

  it('translates every repository refusal code instead of surfacing a 500', () => {
    const errorCode = read('src/common/errors/error-code.ts');
    for (const code of [
      'OtaVersionInvalid',
      'OtaUrlInvalid',
      'OtaSha256Invalid',
      'OtaSizeInvalid',
      'OtaModelsInvalid',
      'OtaTargetsInvalid',
      'OtaStatusTransitionInvalid',
      'OtaInvalidIdentity',
      'OtaRolloutNotFound',
      'OtaTransitionConflict',
      'OtaRolloutNotInProgress',
      'OtaTargetsNotInTenant',
      'OtaVersionAlreadyExists',
    ]) {
      expect(errorCode).toContain(`${code}: 'OTA_`);
      expect(otaController).toContain(`ERROR_CODES.${code}`);
    }
  });

  it('resolves rollout targets against the database, not the request body', () => {
    // A rollout naming another tenant's device would make the row assert that a foreign
    // device is being updated, and nothing downstream re-checks the ids.
    const code = withoutComments(otaRepository);
    expect(code).toMatch(/prisma\.device\.findMany|device:\s*\{\s*findMany/);
    expect(code).toContain('OTA_TARGETS_NOT_IN_TENANT');
  });

  it('never launders a failed device into a clean completion', () => {
    // The exact shape that was wrong: a conditional on a non-existent enum member that
    // always fell through to COMPLETED.
    const code = withoutComments(otaRepository);
    expect(code).not.toContain('PARTIALLY_FAILED');
    expect(code).toContain('OtaRolloutStatus.ROLLED_BACK');
  });

  it('gives the console a way to act, not only to read', () => {
    const code = withoutComments(superFirmware);
    expect(code).toMatch(/method:\s*'POST'/);
  });
});

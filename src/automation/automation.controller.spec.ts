import { AUTOMATION_PERSISTENCE_ERROR_CODES } from './automation.persistence.error';
import { DomainBadRequestException, DomainConflictException, DomainForbiddenException, DomainNotFoundException } from '../common/errors/domain-exceptions';
import { AutomationController } from './automation.controller';
import { AutomationRepository } from './automation.repository';
import {
  AutomationPersistenceError,
  type AutomationPersistenceErrorCode,
} from './automation.persistence.error';

/**
 * `PUT/POST/DELETE /automations` previously leaked `AutomationPersistenceError` straight to
 * the global exception filter. That filter catches everything and only recognises
 * `HttpException`, so a revision conflict or a missing automation came back as
 * **500 Internal Server Error** instead of 409/404 — while `activate`/`deactivate`, which
 * route through `setEnabled`, returned the correct status the whole time.
 *
 * The consequence is worse than a wrong status code: a 500 tells the console "the server
 * is broken" and shows the operator a generic failure, when the truth is that a concurrent
 * edit won and their change should be reloaded and retried. The asymmetry was invisible
 * because this controller had no test at all.
 *
 * These tests assert the *exception the client sees*, since the domain exceptions are what
 * the global filter turns into those status codes.
 */
function request() {
  return {
    user: { tenantContext: { tenantId: 'tenant-1', membershipId: 'membership-1' } },
  } as never;
}

const definition = {
  name: 'notify when temperature rises',
  trigger: { deviceId: 'device-1', capabilityId: 'cap-1' },
  actions: [{ deviceId: 'device-1', capabilityId: 'cap-2', value: 30 }],
};

function repositoryStub() {
  return {
    createOwnedAutomation: jest.fn(),
    replaceOwnedAutomation: jest.fn(),
    deleteOwnedAutomation: jest.fn(),
    setOwnedAutomationEnabled: jest.fn(),
    findOwnedAutomation: jest.fn(),
    listOwnedAutomations: jest.fn(),
  } as unknown as jest.Mocked<AutomationRepository>;
}

const C = AUTOMATION_PERSISTENCE_ERROR_CODES;

describe('AutomationController error mapping', () => {
  const cases: Array<[string, AutomationPersistenceErrorCode, new (...a: never[]) => Error]> = [
    ['revision conflict', C.RevisionConflict, DomainConflictException],
    ['missing automation', C.AutomationNotFound, DomainNotFoundException],
    ['inactive membership', C.MembershipInvalid, DomainForbiddenException],
    ['invalid target', C.TargetInvalid, DomainBadRequestException],
    ['invalid input', C.InvalidInput, DomainBadRequestException],
    ['activation not approved', C.ActivationNotApproved, DomainBadRequestException],
  ];

  for (const [label, code, expected] of cases) {
    it(`PUT /automations/:id maps ${label} instead of leaking a 500`, async () => {
      const repository = repositoryStub();
      repository.replaceOwnedAutomation.mockRejectedValue(
        new AutomationPersistenceError(code, `automation ${code}`),
      );
      const controller = new AutomationController(repository);

      await expect(
        controller.replace(request(), 'automation-1', { expectedRevision: 3, definition }),
      ).rejects.toBeInstanceOf(expected);
    });

    it(`DELETE /automations/:id maps ${label} instead of leaking a 500`, async () => {
      const repository = repositoryStub();
      // remove() loads the aggregate first to read its revision, so the stub has to
      // resolve one or the 404 from loadOwned masks the error under test.
      repository.findOwnedAutomation.mockResolvedValue({ revision: 7 } as never);
      repository.deleteOwnedAutomation.mockRejectedValue(
        new AutomationPersistenceError(code, `automation ${code}`),
      );
      const controller = new AutomationController(repository);

      await expect(controller.remove(request(), 'automation-1')).rejects.toBeInstanceOf(
        expected,
      );
    });
  }

  it('POST /automations maps persistence errors instead of leaking a 500', async () => {
    const repository = repositoryStub();
    repository.createOwnedAutomation.mockRejectedValue(
      new AutomationPersistenceError(C.TargetInvalid, 'trigger must be reportable'),
    );
    const controller = new AutomationController(repository);

    await expect(controller.create(request(), { definition })).rejects.toBeInstanceOf(
      DomainBadRequestException,
    );
  });

  it('deactivate keeps its existing mapping (regression guard)', async () => {
    const repository = repositoryStub();
    repository.setOwnedAutomationEnabled.mockRejectedValue(
      new AutomationPersistenceError(C.RevisionConflict, 'stale revision'),
    );
    const controller = new AutomationController(repository);

    // deactivate has no runtime gate, so this is the one activate/deactivate path that
    // reaches the repository unguarded — and therefore the one that proves the mapping
    // the other two are being kept consistent with.
    await expect(
      controller.deactivate(request(), 'automation-1', { expectedRevision: 2 }),
    ).rejects.toBeInstanceOf(DomainConflictException);
  });

  it('an unrelated error propagates instead of being mislabelled as a domain error', () => {
    const controller = new AutomationController(repositoryStub());
    const boom = new Error('database socket closed');

    // Guards the fix against over-catching: mapPersistenceError must rethrow anything that
    // is not an AutomationPersistenceError, so a real outage is never reported to the
    // operator as "your target device is invalid".
    expect(() =>
      (
        controller as unknown as { mapPersistenceError(cause: unknown): never }
      ).mapPersistenceError(boom),
    ).toThrow(boom);
  });
});

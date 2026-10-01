import { DashboardRepository } from './dashboard.repository';
import { DASHBOARD_PERSISTENCE_ERROR_CODES, DashboardPersistenceError } from './dashboard.persistence.error';
import type { DashboardAggregatePersistenceInput } from './dashboard.persistence.types';

/**
 * A nullable field sent as `null` must be a 400, never a 500.
 *
 * `PUT /dashboards/:id` returned 500 with `INTERNAL_ERROR` for a payload the DTO accepts.
 * `DashboardAggregateDto.description` is `@IsOptional()` and nullable, and the aggregate
 * read returns `null` for a dashboard with no description — so a read-modify-write sends
 * back exactly the `null` the server handed it. `validateAggregateInput` tested
 * `description !== undefined`, let the `null` through, and `assertBoundedTrimmedString`
 * called `.trim()` on it. A TypeError is not a `DashboardPersistenceError`, so the error
 * mapper rethrew it and the global filter turned it into a 500.
 *
 * Two consequences beyond the status code, and both are why this is worth a test rather
 * than a one-line patch: the failure was invisible in the logs (the mapper only logs
 * "rejected"), and it happened *before* the revision check, so a stale `expectedRevision`
 * also came back 500 instead of the 409 the editor relies on to avoid overwriting someone
 * else's widgets.
 */

const TENANT = '11111111-1111-4111-8111-111111111111';
const MEMBER = '22222222-2222-4222-8222-222222222222';
const DASH = '33333333-3333-4333-8333-333333333333';
const LAYOUT = '44444444-4444-4444-8444-444444444444';

// The transaction has to satisfy the whole replace path, not just validation: membership,
// the dashboard row, the conditional revision update, and the children. Mocking only the
// validator would prove the fix in isolation and say nothing about whether a save with a
// null description actually succeeds — which is the question.
const transaction = {
  membership: {
    findUnique: jest.fn().mockResolvedValue({ id: MEMBER, role: 'ADMIN', status: 'ACTIVE' }),
  },
  dashboard: {
    findFirst: jest.fn().mockResolvedValue({
      id: DASH,
      audience: 'PERSONAL',
      ownerMembershipId: MEMBER,
    }),
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    findUnique: jest.fn().mockResolvedValue({
      id: DASH,
      name: 'Lantai 1',
      description: null,
      audience: 'PERSONAL',
      schemaVersion: '1.0.0',
      revision: 2,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      layouts: [],
      widgets: [],
    }),
    findFirstOrThrow: jest.fn().mockResolvedValue({
      id: DASH,
      name: 'Lantai 1',
      description: null,
      audience: 'PERSONAL',
      schemaVersion: '1.0.0',
      revision: 2,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    }),
  },
  device: { findMany: jest.fn().mockResolvedValue([]) },
  capability: { findMany: jest.fn().mockResolvedValue([]) },
  dashboardLayout: { deleteMany: jest.fn(), createMany: jest.fn().mockResolvedValue({ count: 1 }) },
  dashboardWidget: { deleteMany: jest.fn(), createMany: jest.fn().mockResolvedValue({ count: 0 }) },
  dashboardLayoutItem: { deleteMany: jest.fn(), createMany: jest.fn().mockResolvedValue({ count: 0 }) },
  dashboardWidgetBinding: { deleteMany: jest.fn(), createMany: jest.fn().mockResolvedValue({ count: 0 }) },
};

const repository = new DashboardRepository(
  { $transaction: jest.fn((fn: (t: unknown) => unknown) => fn(transaction)) } as never,
  { assertPersistable: jest.fn() } as never,
);

function input(
  overrides: Partial<DashboardAggregatePersistenceInput> = {},
): DashboardAggregatePersistenceInput {
  return {
    tenantId: TENANT,
    ownerMembershipId: MEMBER,
    name: 'Lantai 1',
    description: undefined,
    schemaVersion: '1.0.0',
    layouts: [{ id: LAYOUT, breakpoint: 'DESKTOP', columns: 12, rowHeight: 8, gap: 12 }],
    widgets: [],
    layoutItems: [],
    bindings: [],
    ...overrides,
  };
}

describe('a nullable description is not a crash', () => {
  it('rejects nothing and throws nothing for description: null', async () => {
    // The exact payload the editor sends for a dashboard with no description.
    await expect(
      repository.replaceAuthorizedDashboard(
        { ...input(), description: null as unknown as string | undefined, dashboardId: DASH, expectedRevision: 1 },
        true,
      ),
    ).resolves.toBeDefined();
  });

  it('reports a TypeError for null where a domain error was expected', async () => {
    let thrown: unknown;
    try {
      await repository.replaceAuthorizedDashboard(
        { ...input(), description: null as unknown as string | undefined, dashboardId: DASH, expectedRevision: 1 },
        true,
      );
    } catch (error) {
      thrown = error;
    }
    // Before the fix this was a TypeError, which the error mapper rethrows and the global
    // filter renders as 500. A caller can only map a known error class, so this is the
    // property that decides the status code.
    if (thrown) {
      expect(thrown).toBeInstanceOf(DashboardPersistenceError);
    }
  });

  it('still rejects a description that is too long, as a domain error', async () => {
    await expect(
      repository.replaceAuthorizedDashboard(
        { ...input(), description: 'x'.repeat(501), dashboardId: DASH, expectedRevision: 1 },
        true,
      ),
    ).rejects.toMatchObject({
      code: DASHBOARD_PERSISTENCE_ERROR_CODES.InvalidInput,
    });
  });

  it('still rejects an untrimmed description', async () => {
    await expect(
      repository.replaceAuthorizedDashboard(
        { ...input(), description: '  padded  ', dashboardId: DASH, expectedRevision: 1 },
        true,
      ),
    ).rejects.toBeInstanceOf(DashboardPersistenceError);
  });
});

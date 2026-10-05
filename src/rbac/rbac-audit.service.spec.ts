import { RbacAuditService } from './rbac-audit.service';

describe('RbacAuditService', () => {
  const create = jest.fn();
  const prisma = { rbacAuditLog: { create } } as never;
  const service = new RbacAuditService(prisma);

  const input = {
    tenantId: 't1',
    membershipId: 'm1',
    resourceType: 'scene',
    resourceId: 's1',
    action: 'UPDATE' as const,
    detail: 'permitted after tenant membership plus device-level CONTROL authorization',
  };

  beforeEach(() => {
    create.mockReset();
    create.mockResolvedValue({});
  });

  it('writes a row that names the actor, the resource, and why it was permitted', async () => {
    await service.recordMutation(input);
    expect(create).toHaveBeenCalledWith({
      data: {
        tenantId: 't1',
        action: 'UPDATE',
        resourceType: 'scene',
        resourceId: 's1',
        actorMembershipId: 'm1',
        allowed: true,
        detail: input.detail,
      },
    });
  });

  it('never throws when the audit row cannot be written', async () => {
    // Losing a mutating request because its audit row failed would be a worse outcome than the
    // missing row, and failing closed on writes is a policy decision that has not been made.
    create.mockRejectedValue(new Error('audit table unavailable'));
    await expect(service.recordMutation(input)).resolves.toBeUndefined();
  });
});

describe('RbacAuditService query cursor contract', () => {
  it('returns the same opaque base64url cursor shape the controller accepts', async () => {
    const rows = [
      {
        id: 'audit-2',
        tenantId: 't1',
        action: 'UPDATE',
        resourceType: 'scene',
        resourceId: 's2',
        actorMembershipId: 'm1',
        allowed: true,
        detail: 'CONTROL',
        createdAt: new Date('2026-10-05T01:02:03.000Z'),
      },
      {
        id: 'audit-1',
        tenantId: 't1',
        action: 'CREATE',
        resourceType: 'scene',
        resourceId: 's1',
        actorMembershipId: 'm1',
        allowed: true,
        detail: 'CONTROL',
        createdAt: new Date('2026-10-05T01:00:00.000Z'),
      },
    ];
    const findMany = jest.fn().mockResolvedValue(rows);
    const service = new RbacAuditService({ rbacAuditLog: { findMany } } as never);

    const result = await service.queryAuditLog({ tenantId: 't1', limit: 1 });

    expect(result.items).toHaveLength(1);
    expect(typeof result.nextCursor).toBe('string');
    const decoded = JSON.parse(
      Buffer.from(result.nextCursor as string, 'base64url').toString('utf8'),
    );
    expect(decoded).toEqual({
      createdAt: '2026-10-05T01:02:03.000Z',
      id: 'audit-2',
    });
  });

  it('uses a decoded cursor as a stable createdAt/id keyset predicate', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const service = new RbacAuditService({ rbacAuditLog: { findMany } } as never);
    const cursor = { createdAt: new Date('2026-10-05T01:02:03.000Z'), id: 'audit-2' };

    await service.queryAuditLog({ tenantId: 't1', cursor, limit: 50 });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: 't1',
          OR: [
            { createdAt: { lt: cursor.createdAt } },
            { createdAt: cursor.createdAt, id: { lt: 'audit-2' } },
          ],
        }),
      }),
    );
  });
});

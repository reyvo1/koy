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

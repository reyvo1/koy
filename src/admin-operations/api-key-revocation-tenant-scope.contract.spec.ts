import { ApiKeyStatus } from '@prisma/client';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { PublicApiService } from '../public-api/public-api.service';
import { AdminApiKeysController } from './admin-api-keys.controller';

/**
 * API key revocation: two implementations, the weaker one reachable.
 *
 * `PublicApiService.revokeApiKey` is correct — one atomic statement, scoped by tenant and by
 * status:
 *
 *     updateMany({ where: { id, tenantId, status: ACTIVE }, data: { status: REVOKED } })
 *
 * It had zero callers. What the routes actually called was a private `revoke()` on the
 * controller, which did:
 *
 *   1. `findUnique({ where: { id } })` — reads the key row of *any* tenant before deciding
 *      ownership, so the ownership test happens in application code instead of in the query;
 *   2. `update({ where: { id } })` — the write itself is **not** tenant-scoped. Its safety
 *      rests entirely on step 1 having read the right row a moment earlier.
 *
 * Read-then-write with a scoped read and an unscoped write is a cross-tenant hazard waiting
 * for a race, and the tenant boundary is the product. The fix is to delete the duplicate and
 * use the service, which is also what the unused-method census was pointing at.
 *
 * The already-revoked answer must not change: `updateMany` with `status: ACTIVE` matches
 * nothing for a revoked key, so the same reply comes back either way.
 */
describe('API key revocation — the tenant boundary is in the write, not the read', () => {
  let controller: AdminApiKeysController;
  let updateMany: jest.Mock;
  let findFirst: jest.Mock;
  let update: jest.Mock;

  const tenantA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const tenantB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const keyId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  const request = { user: { tenantContext: { tenantId: tenantA } } } as never;

  beforeEach(async () => {
    updateMany = jest.fn().mockResolvedValue({ count: 1 });
    findFirst = jest.fn().mockResolvedValue({ id: keyId, status: 'ACTIVE' });
    update = jest.fn().mockResolvedValue({ id: keyId });

    const prisma = {
      apiKey: { findFirst, update, updateMany, create: jest.fn(), findMany: jest.fn() },
    } as unknown as PrismaService;

    // The real service, wired to the same Prisma double — the point of these assertions is
    // the query the *service* issues, so a mocked service would prove nothing.
    const moduleRef = await Test.createTestingModule({
      controllers: [AdminApiKeysController],
      providers: [
        AdminApiKeysController,
        { provide: PrismaService, useValue: prisma },
        { provide: PublicApiService, useValue: new PublicApiService(prisma) },
      ],
    }).compile();

    controller = moduleRef.get(AdminApiKeysController);
  });

  it('revokes through one atomic, tenant-scoped statement', async () => {
    await controller.revokeTenantKey(request, keyId);

    expect(updateMany).toHaveBeenCalledWith({
      where: { id: keyId, tenantId: tenantA, status: ApiKeyStatus.ACTIVE },
      data: { status: ApiKeyStatus.REVOKED },
    });
  });

  it('never writes by bare id', async () => {
    await controller.revokeTenantKey(request, keyId);

    // The regression itself: an unscoped `update({ where: { id } })` is the shape that lets a
    // revocation land on another tenant's key if the pre-check ever disagrees with the write.
    expect(update).not.toHaveBeenCalled();
  });

  it('scopes the lookup by tenant too, not just the write', async () => {
    await controller.revokeTenantKey(request, keyId);

    // The lookup is scoped as well. An unscoped `findUnique({ where: { id } })` would load
    // another tenant's row before the ownership test, which is the read half of the old bug.
    expect(findFirst).toHaveBeenCalledWith({
      where: { id: keyId, tenantId: tenantA },
      select: { id: true, status: true },
    });
  });

  it('answers not-found for a key that belongs to another tenant', async () => {
    // tenantB asks for tenantA's key: the scoped update matches nothing, and the service
    // reports the refusal rather than the controller pre-reading the row.
    updateMany.mockResolvedValue({ count: 0 });
    findFirst.mockResolvedValue(null);

    await expect(
      controller.revokeTenantKey({ user: { tenantContext: { tenantId: tenantB } } } as never, keyId),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('is idempotent: revoking an already-revoked key still answers revoked', async () => {
    updateMany.mockResolvedValue({ count: 0 });

    const result = await controller.revokeTenantKey(request, keyId);

    expect(result).toMatchObject({ id: keyId, status: 'REVOKED' });
  });
});

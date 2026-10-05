import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextGuard } from '../users/guards/tenant-context.guard';
import { AdminRoleGuard } from '../admin-operations/admin-role.guard';
import { IntegrationRegistryService } from './integration-registry.service';
import { IntegrationRegistryController } from './integration-registry.controller';

const tenantA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const integrationId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const request = { user: { tenantContext: { tenantId: tenantA } } } as never;

/**
 * The integration registry was a service with no way to reach it.
 *
 * `src/integrations/` contained a service, a spec and a module — no controller — and both
 * `integrations` and `integration_sync_state` held zero rows. So a tenant could not register
 * an external ecosystem at all, and the registry could only be populated by a test.
 *
 * Scope, stated honestly: registry create/list/delete is the shared operator surface.
 * `setStatus` and `recordSync` stay adapter-facing. MQTT_BRIDGE has a real EMQX-backed adapter,
 * while the other provider values do not; a universal operator connect route would therefore
 * invent one lifecycle across providers that do not actually share it.
 *
 * What this suite pins: the registry is reachable, it is tenant-scoped, and a duplicate
 * provider/display-name is a conflict rather than a 500.
 */
describe('Integration registry — a tenant can register and remove an external ecosystem', () => {
  let controller: IntegrationRegistryController;
  let prisma: Record<string, any>;

  const dto = { provider: 'HOME_ASSISTANT', displayName: 'Home Assistant', credentialRef: 'secret://ha/main' };

  beforeEach(async () => {
    prisma = {
      integration: {
        create: jest.fn().mockResolvedValue({ id: integrationId, provider: 'HOME_ASSISTANT', displayName: 'Home Assistant', credentialRef: 'secret://ha/main', status: 'REGISTERED', lastError: null, createdAt: new Date(0) }),
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue({ id: integrationId, tenantId: tenantA }),
        delete: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [IntegrationRegistryController],
      providers: [
        IntegrationRegistryController,
        { provide: PrismaService, useValue: prisma },
        { provide: AdminRoleGuard, useValue: { canActivate: () => true } },
        { provide: IntegrationRegistryService, useValue: new IntegrationRegistryService(prisma as never) },
      ],
    })
      .overrideGuard(TenantContextGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = moduleRef.get(IntegrationRegistryController);
  });

  it('registers against the tenant from the verified context', async () => {
    await controller.register(request, dto as never);

    expect(prisma.integration.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ tenantId: tenantA, displayName: 'Home Assistant' }),
      }),
    );
  });

  it('never stores a raw credential, only the reference', async () => {
    await controller.register(request, dto as never);

    const written = prisma.integration.create.mock.calls[0][0].data;
    expect(written.credentialRef).toBe('secret://ha/main');
    expect(Object.values(written)).not.toContain('secret://ha/main'.replace('secret://', ''));
  });

  it('refuses an empty display name with 400, not 500', async () => {
    // The service throws `Object.assign(new Error(...), { code })`. A plain Error is not an
    // HttpException, so `GlobalExceptionFilter` renders it as 500 INTERNAL_ERROR — the same
    // trap that made the billing denial a 500. Reaching this path through a route would have
    // turned a client mistake into a server fault.
    await expect(controller.register(request, { ...dto, displayName: '' } as never)).rejects.toMatchObject({
      status: 400,
    });
  });

  it('refuses a whitespace-only display name through the backend route', async () => {
    await expect(
      controller.register(request, { ...dto, displayName: '   ' } as never),
    ).rejects.toMatchObject({ status: 400 });
    expect(prisma.integration.create).not.toHaveBeenCalled();
  });

  it('refuses a raw credential with 400 instead of persisting it as a reference', async () => {
    await expect(
      controller.register(request, { ...dto, credentialRef: 'raw-provider-token' } as never),
    ).rejects.toMatchObject({ status: 400 });
    expect(prisma.integration.create).not.toHaveBeenCalled();
  });

  it('refuses an empty credential reference with 400', async () => {
    await expect(controller.register(request, { ...dto, credentialRef: '' } as never)).rejects.toMatchObject({
      status: 400,
    });
  });

  it('reports a duplicate provider for the tenant as 409', async () => {
    prisma.integration.create.mockRejectedValue(Object.assign(new Error('unique'), { code: 'P2002' }));

    await expect(controller.register(request, dto as never)).rejects.toMatchObject({ status: 409 });
  });

  it('lists only the caller’s tenant', async () => {
    await controller.list(request);

    expect(prisma.integration.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: tenantA } }),
    );
  });

  it('refuses to remove another tenant’s integration', async () => {
    prisma.integration.findFirst.mockResolvedValue(null);

    await expect(controller.remove(request, integrationId)).rejects.toMatchObject({ status: 404 });
    expect(prisma.integration.delete).not.toHaveBeenCalled();
  });

  it('removes the caller’s own integration', async () => {
    prisma.integration.findFirst.mockResolvedValue({ id: integrationId, tenantId: tenantA });

    await controller.remove(request, integrationId);

    expect(prisma.integration.delete).toHaveBeenCalledWith({ where: { id: integrationId } });
  });
});

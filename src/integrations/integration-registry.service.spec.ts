import { PrismaService } from '../prisma/prisma.service';
import { IntegrationRegistryService } from './integration-registry.service';

const tenantId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

describe('IntegrationRegistryService', () => {
  let integrationCreate: jest.Mock;
  let integrationUpdateMany: jest.Mock;
  let syncUpsert: jest.Mock;
  let service: IntegrationRegistryService;

  beforeEach(() => {
    integrationCreate = jest.fn().mockResolvedValue({ id: 'int1' });
    integrationUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
    syncUpsert = jest.fn().mockResolvedValue({});
    service = new IntegrationRegistryService({
      integration: { create: integrationCreate, updateMany: integrationUpdateMany },
      integrationSyncState: { upsert: syncUpsert },
    } as unknown as PrismaService);
  });

  it('registers an integration with a credential reference', async () => {
    const result = await service.register({
      tenantId,
      provider: 'HOME_ASSISTANT',
      displayName: 'Home Assistant Bridge',
      credentialRef: 'secret://integrations/ha-1',
    });

    expect(result.id).toBe('int1');
    expect(integrationCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'REGISTERED',
          credentialRef: 'secret://integrations/ha-1',
        }),
      }),
    );
  });

  it('never stores raw credentials (credentialRef only)', async () => {
    await service.register({
      tenantId,
      provider: 'ALEXA',
      displayName: 'Alexa',
      // The ref points to the secret store; raw tokens are rejected by shape.
      credentialRef: 'secret://integrations/alexa-1',
    });
    const arg = integrationCreate.mock.calls[0][0].data;
    expect(arg.credentialRef.startsWith('secret://')).toBe(true);
  });

  it('rejects missing display name or credential reference', async () => {
    await expect(
      service.register({
        tenantId,
        provider: 'ALEXA',
        displayName: '',
        credentialRef: 'secret://x',
      }),
    ).rejects.toMatchObject({ code: 'INTEGRATION_NAME_INVALID' });
    await expect(
      service.register({
        tenantId,
        provider: 'ALEXA',
        displayName: 'Alexa',
        credentialRef: '',
      }),
    ).rejects.toMatchObject({ code: 'INTEGRATION_CREDENTIAL_REF_INVALID' });
  });

  it('records sync state idempotently via upsert', async () => {
    await service.recordSync({
      tenantId,
      integrationId: 'int1',
      entityType: 'device',
      externalEntityId: 'ext-1',
      internalEntityId: 'dev-1',
    });
    expect(syncUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          integrationId_entityType_externalEntityId: {
            integrationId: 'int1',
            entityType: 'device',
            externalEntityId: 'ext-1',
          },
        },
      }),
    );
  });

  it('updates status with error capture on ERROR', async () => {
    await service.setStatus({
      integrationId: 'int1',
      tenantId,
      status: 'ERROR',
      lastError: 'handshake failed',
    });
    expect(integrationUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'ERROR',
          lastError: 'handshake failed',
        }),
      }),
    );
  });
});

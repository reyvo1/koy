import { PublicApiController } from './public-api.controller';
import { ApiKeyGuard, RequireApiScope } from './guards/api-key.guard';
import { DomainBadRequestException } from '../common/errors/domain-exceptions';
import { ERROR_CODES } from '../common/errors/error-code';

/**
 * The public API that did not exist.
 *
 * `PublicApiService.authenticate` was complete and correct — constant-time hash compare, an
 * ACTIVE-status check, an expiry check, a `lastUsedAt` write — and had **zero callers**. A key
 * could be minted from the console and then presented to nothing at all. The API Key page let
 * an operator create a credential for an integration that had nowhere to authenticate.
 *
 * Two things decide whether this surface is safe, and both are asserted here rather than
 * assumed: the tenant comes from the key and cannot be asserted by the caller, and a scope the
 * key does not carry is refused instead of ignored.
 */
const tenantA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const makePrisma = () => ({
  device: { findMany: jest.fn().mockResolvedValue([]) },
  telemetry: { findMany: jest.fn().mockResolvedValue([]) },
  analyticsFinding: { findMany: jest.fn().mockResolvedValue([]) },
});

const request = (tenantId: string, scopes: string[] = ['TELEMETRY_READ']) => ({
  publicApi: { tenantId, scopes },
}) as never;

describe('PublicApiController tenant binding', () => {
  it('scopes the device list by the key tenant', async () => {
    const prisma = makePrisma();
    await new PublicApiController(prisma as never).listDevices(request(tenantA));

    // The scope is in the query. A handler that read the tenant from a header could not be
    // written this way, and one that filtered in JavaScript after an unfiltered read could.
    expect(prisma.device.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: tenantA } }),
    );
  });

  it('scopes telemetry by the key tenant', async () => {
    const prisma = makePrisma();
    await new PublicApiController(prisma as never).telemetry(request(tenantA));

    expect(prisma.telemetry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: tenantA } }),
    );
  });

  it('matches deviceId together with the tenant, never alone', async () => {
    const prisma = makePrisma();
    const deviceId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

    await new PublicApiController(prisma as never).telemetry(
      request(tenantA),
      undefined,
      deviceId,
    );

    // A guessed device id with no tenant in the predicate would return another tenant's
    // readings. This is the scoped-read / unscoped-read defect in its most direct form.
    expect(prisma.telemetry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: tenantA, deviceId } }),
    );
  });

  it('refuses a request with no bound scopes before the body runs', async () => {
    const prisma = makePrisma();

    // The scope decorator refuses first, so a request that never went through `ApiKeyGuard`
    // cannot reach the query at all. The refusal is 403, not 401: the credential is not the
    // problem, the authorisation is.
    await expect(
      new PublicApiController(prisma as never).listDevices({} as never),
    ).rejects.toMatchObject({ status: 403 });
    expect(prisma.device.findMany).not.toHaveBeenCalled();
  });

  it('refuses rather than querying with an empty tenant', async () => {
    const prisma = makePrisma();

    // `tenantId: undefined` in a Prisma where clause is "no filter", which returns every
    // tenant's rows. The controller asserts the binding is a usable value instead of relying
    // on the guard never being bypassed.
    await expect(
      new PublicApiController(prisma as never).listDevices(
        { publicApi: { tenantId: '', scopes: ['TELEMETRY_READ'] } } as never,
      ),
    ).rejects.toBeInstanceOf(DomainBadRequestException);
    expect(prisma.device.findMany).not.toHaveBeenCalled();
  });

  it('clamps the limit instead of trusting it', async () => {
    const prisma = makePrisma();
    await new PublicApiController(prisma as never).listDevices(request(tenantA), '100000');

    // A public endpoint with an unbounded `take` is someone else's outage.
    expect(prisma.device.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 500 }),
    );
  });

  it('rejects a nonsense limit by name rather than silently defaulting it', async () => {
    const prisma = makePrisma();
    const thrown = (await new PublicApiController(prisma as never)
      .listDevices(request(tenantA), 'abc')
      .catch((e: unknown) => e)) as { getResponse?: () => unknown };

    expect(thrown).toBeInstanceOf(DomainBadRequestException);
    expect(thrown.getResponse?.()).toMatchObject({
      code: ERROR_CODES.ValidationFailed,
    });
    expect(prisma.device.findMany).not.toHaveBeenCalled();
  });

  it('selects device fields explicitly, so no credential column can ride along', async () => {
    const prisma = makePrisma();
    await new PublicApiController(prisma as never).listDevices(request(tenantA));

    // `test/credential-column-exposure.contract.spec.ts` fails unselected reads that are
    // returned directly; this route is public, so the projection is the guarantee.
    const [args] = prisma.device.findMany.mock.calls;
    expect(args[0].select).toBeDefined();
    expect(Object.keys(args[0].select)).not.toContain('apiKeyHash');
  });
});

describe('ApiKeyGuard', () => {
  const contextFor = (headers: Record<string, string>) =>
    ({ switchToHttp: () => ({ getRequest: () => ({ headers }) }) }) as never;

  it('accepts a key via X-API-Key and binds its tenant to the request', async () => {
    const publicApi = {
      authenticate: jest
        .fn()
        .mockResolvedValue({ tenantId: tenantA, scopes: ['TELEMETRY_READ'] }),
    };
    const request: { headers: Record<string, string>; publicApi?: unknown } = {
      headers: { 'x-api-key': 'iot_live_a_valid_looking_key' },
    };
    const guard = new ApiKeyGuard(publicApi as never);

    await expect(
      guard.canActivate({ switchToHttp: () => ({ getRequest: () => request }) } as never),
    ).resolves.toBe(true);
    expect(request.publicApi).toEqual({
      tenantId: tenantA,
      scopes: ['TELEMETRY_READ'],
    });
  });

  it('accepts the Authorization: Bearer spelling too', async () => {
    const publicApi = {
      authenticate: jest
        .fn()
        .mockResolvedValue({ tenantId: tenantA, scopes: ['TELEMETRY_READ'] }),
    };
    const guard = new ApiKeyGuard(publicApi as never);

    await expect(
      guard.canActivate(
        contextFor({ authorization: 'Bearer iot_live_a_valid_looking_key' }),
      ),
    ).resolves.toBe(true);
  });

  it('rejects a key the service will not authenticate', async () => {
    const guard = new ApiKeyGuard({ authenticate: jest.fn().mockResolvedValue(null) } as never);

    await expect(
      guard.canActivate(contextFor({ 'x-api-key': 'iot_live_wrong' })),
    ).rejects.toMatchObject({ status: 401 });
  });

  it('rejects a request with no key before consulting the database', async () => {
    const authenticate = jest.fn();
    const guard = new ApiKeyGuard({ authenticate } as never);

    await expect(guard.canActivate(contextFor({}))).rejects.toMatchObject({ status: 401 });
    expect(authenticate).not.toHaveBeenCalled();
  });
});

describe('RequireApiScope', () => {
  const handlerWithScope = () => {
    class Probe {
      @RequireApiScope('TELEMETRY_READ')
      async run() {
        return 'reached';
      }
    }
    return new Probe().run.bind(new Probe());
  };

  it('runs the handler when the key carries the scope', async () => {
    await expect(handlerWithScope()(request(tenantA, ['TELEMETRY_READ']))).resolves.toBe(
      'reached',
    );
  });

  it('refuses a key without the scope, and does not reach the handler', async () => {
    // A `DEVICE_CONTROL`-only key must not read telemetry: a broader scope is not a licence
    // for every route, and a check inside the handler is a check a new route can forget.
    await expect(
      handlerWithScope()(request(tenantA, ['DEVICE_CONTROL'])),
    ).rejects.toMatchObject({ status: 403 });
  });
});

import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { ApiKeyGuard, RequireApiScope } from './guards/api-key.guard';
import { PrismaService } from '../prisma/prisma.service';
import { DomainBadRequestException } from '../common/errors/domain-exceptions';
import { ERROR_CODES } from '../common/errors/error-code';

/**
 * The public API surface — the routes an API key is actually accepted on.
 *
 * `PublicApiService.authenticate` has existed since the module was written and nothing called
 * it: a key could be minted and revoked through `/admin/api-keys`, and then presented to no
 * endpoint at all. The console's API Key page let an operator create a credential for an
 * integration that had nothing to authenticate against.
 *
 * The tenant is read from the request object the guard bound, never from a header, a query
 * string or a body — so there is no parameter for a caller to point at another tenant, and a
 * handler physically cannot be written without a tenant.
 *
 * Read-only by construction. A public surface that could write would need its own scope
 * vocabulary, its own audit story and its own blast radius, and none of that exists yet.
 * `TELEMETRY_READ` is the only scope exposed, and a write endpoint is deliberately absent
 * rather than merely ungated.
 */
const MAX_LIMIT = 500;
const DEFAULT_LIMIT = 50;

/** What `ApiKeyGuard` binds onto the request. */
interface PublicApiRequest {
  publicApi?: { tenantId: string; scopes: string[] };
}

@Controller('v1')
@UseGuards(ApiKeyGuard)
export class PublicApiController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * GET /v1/devices — the tenant's devices, for an integration to reconcile against.
   *
   * `lastHeartbeatAt` is a liveness fact an integration legitimately needs; no credential
   * column is selected, and the guard's key never appears in a response.
   */
  @Get('devices')
  @RequireApiScope('TELEMETRY_READ')
  async listDevices(@Req() request: PublicApiRequest, @Query('limit') limit?: string) {
    return this.read(request, limit, async (take, tenantId) =>
      this.prisma.device.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
        take,
        select: {
          id: true,
          name: true,
          type: true,
          status: true,
          lastHeartbeatAt: true,
          createdAt: true,
        },
      }),
    );
  }

  /**
   * GET /v1/telemetry — recent readings for the tenant's devices.
   *
   * `deviceId` is optional and, when given, is matched *together with* `tenantId`. Filtering
   * by device alone would return another tenant's readings for a guessed id, which is the
   * scoped-read / unscoped-read defect in its most direct form.
   */
  @Get('telemetry')
  @RequireApiScope('TELEMETRY_READ')
  async telemetry(
    @Req() request: PublicApiRequest,
    @Query('limit') limit?: string,
    @Query('deviceId') deviceId?: string,
  ) {
    return this.read(request, limit, async (take, tenantId) =>
      this.prisma.telemetry.findMany({
        where: { tenantId, ...(deviceId ? { deviceId } : {}) },
        orderBy: { createdAt: 'desc' },
        take,
      }),
    );
  }

  /**
   * GET /v1/findings — analytics findings, so an integration can consume the platform's
   * analysis rather than recomputing it.
   *
   * This is the alert-like surface, named after the table that exists. There is no `Alert`
   * model in the schema; a route called `/v1/alerts` over `AnalyticsFinding` would look like
   * an alert feed to an integrator and be neither, so it is named for what it returns.
   */
  @Get('findings')
  @RequireApiScope('TELEMETRY_READ')
  async findings(@Req() request: PublicApiRequest, @Query('limit') limit?: string) {
    return this.read(request, limit, async (take, tenantId) =>
      this.prisma.analyticsFinding.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
        take,
      }),
    );
  }

  /**
   * Shared limit handling and tenant binding.
   *
   * `limit` is clamped rather than trusted, because a public endpoint is exactly where an
   * unbounded `take` becomes someone else's outage. A non-positive or non-integer limit is a
   * 400 naming the parameter, not a silently-defaulted value that the caller cannot see.
   */
  private async read<T>(
    request: PublicApiRequest,
    limit: string | undefined,
    run: (take: number, tenantId: string) => Promise<T[]>,
  ): Promise<{ items: T[]; count: number }> {
    let take = DEFAULT_LIMIT;
    if (limit !== undefined) {
      const parsed = Number(limit);
      if (!Number.isInteger(parsed) || parsed < 1) {
        throw new DomainBadRequestException(
          ERROR_CODES.ValidationFailed,
          'limit harus bilangan bulat positif.',
        );
      }
      take = Math.min(parsed, MAX_LIMIT);
    }

    const tenantId = request.publicApi?.tenantId;
    if (typeof tenantId !== 'string' || tenantId.length === 0) {
      // Unreachable behind the guard, and asserted anyway: a request that reaches a handler
      // without a bound tenant would otherwise query with `tenantId: undefined`, which Prisma
      // treats as "no filter" and returns every tenant's rows.
      throw new DomainBadRequestException(
        ERROR_CODES.Forbidden,
        'Konteks tenant tidak tersedia pada permintaan ini.',
      );
    }

    const items = await run(take, tenantId);
    return { items, count: items.length };
  }
}

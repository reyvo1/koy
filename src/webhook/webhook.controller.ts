import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsString,
  IsUrl,
  MaxLength,
} from 'class-validator';
import { randomBytes } from 'node:crypto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantContextGuard } from '../users/guards/tenant-context.guard';
import { AdminRoleGuard } from '../admin-operations/admin-role.guard';
import { WebhookDispatchService, WebhookRepository } from './webhook-runtime.service';
import { ERROR_CODES } from '../common/errors/error-code';
import { DomainBadRequestException } from '../common/errors/domain-exceptions';

class CreateWebhookEndpointDto {
  // HTTPS is required, with one deliberate exception: a loopback receiver may be plain HTTP.
  // A webhook carries a signature rather than a secret, so the payload is not confidential in
  // the way a password is — but an off-host plain-HTTP receiver exposes it to any observer on
  // the path, and the rule is cheap to enforce. The loopback exception is what makes the
  // runtime testable against a real receiver without provisioning a certificate, so it is
  // stated here rather than worked around in a probe.
  @IsUrl({ require_tld: false, protocols: ['http', 'https'] })
  @MaxLength(2048)
  url: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(32)
  @IsString({ each: true })
  events: string[];
}

class SetEnabledDto {
  @IsBoolean()
  enabled: boolean;
}

/**
 * Events a tenant may subscribe to.
 *
 * Held here rather than in the database so the API and the product describe the same list: a
 * subscription to an event nothing emits is a silently dead endpoint, and the operator has no
 * way to tell that from one that is merely quiet.
 *
 * That sentence is a constraint on this list, not a description of it, so every entry here
 * has a `.dispatch(` call site that emits it — `device.state_changed` from a heartbeat, and
 * `device.registered` from `DeviceService.create`. `telemetry.threshold_breached`,
 * `alert.raised` and `incident.opened` were listed and dispatched by nothing; there is no
 * `Alert` or `Incident` model in the schema at all. A subscriber to any of them got a green
 * registration and a silence, which is the defect this list exists to prevent. They are
 * removed rather than left as promises, and `test/webhook-surface.contract.spec.ts` asserts
 * the property so the next event cannot be added without an emitter beside it.
 */
const SUBSCRIBABLE_EVENTS = [
  'device.state_changed',
  'device.registered',
  '*',
] as const;

const EVENT_NAMES = new Set<string>(SUBSCRIBABLE_EVENTS);

/** Hosts a plain-HTTP receiver is allowed on, because they never leave the machine. */
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

/**
 * Reject an off-host plain-HTTP receiver.
 *
 * Checked in the body as well as by the DTO: `@IsUrl` only runs through Nest's
 * `ValidationPipe`, so a direct caller would otherwise register a receiver whose payload is
 * readable to anyone on the path.
 */
function assertTransportAccepted(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new DomainBadRequestException(
      ERROR_CODES.ValidationFailed,
      'URL webhook tidak valid',
    );
  }
  if (parsed.protocol === 'https:') return;
  if (parsed.protocol !== 'http:') {
    throw new DomainBadRequestException(
      ERROR_CODES.ValidationFailed,
      `Protokol webhook harus https (atau http untuk loopback); diterima: ${parsed.protocol}`,
    );
  }
  if (!LOOPBACK_HOSTS.has(parsed.hostname)) {
    throw new DomainBadRequestException(
      ERROR_CODES.ValidationFailed,
      `Webhook di luar loopback wajib memakai https; ${parsed.hostname} bukan host loopback`,
    );
  }
}

/**
 * Outbound webhook management for the active tenant.
 *
 * This is the writer surface `webhook_endpoints` never had. Before it, the table could only be
 * populated by hand in the database, and `PublicApiService.signWebhookPayload` had no callers
 * at all — so the repository described a webhook feature that no tenant could use and no
 * operator could inspect.
 *
 * Tenant-scoped only, like the RBAC management surface: a platform route that could read
 * another tenant's signing secret would undo the isolation every other layer maintains.
 */
@ApiTags('webhooks')
@ApiBearerAuth()
@ApiHeader({
  name: 'X-Tenant-Id',
  required: true,
  description: 'Trusted tenant selector validated against active membership',
})
@Controller('admin/webhooks')
@UseGuards(JwtAuthGuard, TenantContextGuard, AdminRoleGuard)
export class WebhookController {
  constructor(
    private readonly repository: WebhookRepository,
    private readonly dispatch: WebhookDispatchService,
  ) {}

  private tenantOf(request: { user: { tenantContext: { tenantId: string } } }): string {
    return request.user.tenantContext.tenantId;
  }

  @Get('endpoints')
  @ApiOperation({ summary: 'List the active tenant’s webhook endpoints' })
  async list(
    @Request() request: { user: { tenantContext: { tenantId: string } } },
  ) {
    return { items: await this.repository.listEndpoints(this.tenantOf(request)) };
  }

  @Get('deliveries')
  @ApiOperation({ summary: 'Recent webhook delivery attempts for the active tenant' })
  async deliveries(
    @Request() request: { user: { tenantContext: { tenantId: string } } },
  ) {
    return { items: await this.dispatch.recentDeliveries(this.tenantOf(request)) };
  }

  @Post('endpoints')
  @ApiOperation({ summary: 'Register a webhook endpoint for the active tenant' })
  async create(
    @Request() request: { user: { tenantContext: { tenantId: string } } },
    @Body() dto: CreateWebhookEndpointDto,
  ) {
    // Validated here as well as by the DTO: `@IsArray`/`@IsUrl` only run through Nest's
    // ValidationPipe, so a direct caller would otherwise store an unusable endpoint.
    const unknown = dto.events.filter((event) => !EVENT_NAMES.has(event));
    if (unknown.length > 0) {
      throw new DomainBadRequestException(
        ERROR_CODES.ValidationFailed,
        `Event webhook tidak dikenal: ${unknown[0]}. Pilihan: ${SUBSCRIBABLE_EVENTS.join(', ')}`,
      );
    }
    assertTransportAccepted(dto.url);
    if (dto.events.length > 1 && dto.events.includes('*')) {
      throw new DomainBadRequestException(
        ERROR_CODES.ValidationFailed,
        'Event "*" tidak boleh dikombinasikan dengan event lain',
      );
    }

    // Generated here, returned once, and never readable again through the list surface.
    const signingSecret = `whsec_${randomBytes(24).toString('base64url')}`;
    const created = await this.repository.createEndpoint(
      this.tenantOf(request),
      dto.url,
      dto.events,
      signingSecret,
    );
    return {
      id: created.id,
      url: created.url,
      events: dto.events,
      enabled: created.enabled,
      // Shown exactly once, at creation. A receiver needs it to verify signatures, and it is
      // the only time it is available.
      signingSecret,
      createdAt: created.createdAt.toISOString(),
    };
  }

  @Post('endpoints/:endpointId/rotate-secret')
  @ApiOperation({ summary: 'Rotate an endpoint’s signing secret' })
  async rotate(
    @Request() request: { user: { tenantContext: { tenantId: string } } },
    @Param('endpointId') endpointId: string,
  ) {
    const signingSecret = `whsec_${randomBytes(24).toString('base64url')}`;
    await this.repository.rotateSecret(this.tenantOf(request), endpointId, signingSecret);
    return { id: endpointId, signingSecret };
  }

  @Patch('endpoints/:endpointId')
  @ApiOperation({ summary: 'Enable or disable a webhook endpoint' })
  async setEnabled(
    @Request() request: { user: { tenantContext: { tenantId: string } } },
    @Param('endpointId') endpointId: string,
    @Body() dto: SetEnabledDto,
  ) {
    await this.repository.setEnabled(this.tenantOf(request), endpointId, dto.enabled);
    return { id: endpointId, enabled: dto.enabled };
  }

  @Delete('endpoints/:endpointId')
  @ApiOperation({ summary: 'Delete a webhook endpoint' })
  async remove(
    @Request() request: { user: { tenantContext: { tenantId: string } } },
    @Param('endpointId') endpointId: string,
  ) {
    await this.repository.deleteEndpoint(this.tenantOf(request), endpointId);
    return { id: endpointId, deleted: true };
  }
}

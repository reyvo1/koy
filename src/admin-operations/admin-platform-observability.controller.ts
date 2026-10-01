import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantContextGuard } from '../users/guards/tenant-context.guard';
import { AdminRoleGuard } from './admin-role.guard';
import { PlatformRoleGuard } from './platform-role.guard';
import { AdminPlatformObservabilityService } from './admin-platform-observability.service';
import { ReportArchiveService } from './report-archive.service';
import { MqttManagementService } from './mqtt-management.service';
import { NocIncidentService } from './noc-incident.service';
import { AdminOperationsRequest } from './admin-operational-summary.types';

@ApiTags('admin-platform-observability')
@ApiBearerAuth()
@ApiHeader({
  name: 'X-Tenant-Id',
  required: true,
  description: 'Trusted active tenant context; platform role is still required',
})
@Controller('admin')
@UseGuards(JwtAuthGuard, TenantContextGuard, AdminRoleGuard, PlatformRoleGuard)
export class AdminPlatformObservabilityController {
  constructor(
    private readonly platform: AdminPlatformObservabilityService,
    private readonly archive: ReportArchiveService,
    private readonly mqtt: MqttManagementService,
    private readonly noc: NocIncidentService,
  ) {}

  @Get('platform-device-groups')
  @ApiOperation({ summary: 'Read bounded device-group directory across tenants' })
  async listDeviceGroups(@Query('tenantId') tenantId?: string) {
    return this.platform.listDeviceGroups(tenantId?.trim() || undefined);
  }

  @Get('platform-device-credentials')
  @ApiOperation({ summary: 'Read non-secret device credential metadata across tenants' })
  async listDeviceCredentials(@Query('tenantId') tenantId?: string) {
    return this.platform.listDeviceCredentials(tenantId?.trim() || undefined);
  }

  @Get('platform-commands')
  @ApiOperation({ summary: 'Read platform command queue/ACK/history without dispatch capability' })
  async listCommands(
    @Query('tenantId') tenantId?: string,
    @Query('deviceId') deviceId?: string,
    @Query('status') status?: string,
    @Query('limit') limit?: string,
  ) {
    return this.platform.listCommands({ tenantId, deviceId, status, limit });
  }

  @Get('platform-telemetry/explorer')
  @ApiOperation({ summary: 'Explore bounded telemetry evidence for a selected platform device' })
  async exploreTelemetry(
    @Query('deviceId') deviceId?: string,
    @Query('capability') capability?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limit?: string,
  ) {
    return this.platform.exploreTelemetry({ deviceId, capability, from, to, limit });
  }

  @Get('platform-reports/tenant-summary')
  @ApiOperation({ summary: 'Read bounded cross-tenant operational report rows' })
  async tenantSummary(@Query('hours') hours?: string) {
    return this.platform.getTenantSummaryReport(hours);
  }

  // -- Saved reports -------------------------------------------------------
  //
  // The route above recomputes from `now`, so it is correct about the present and useless for
  // anything else: the number an operator read on Monday is not retrievable on Tuesday. These
  // routes store the rendered payload so it can be read again, and expire it after the agreed
  // retention window.

  @Get('platform-reports/saved')
  @ApiOperation({ summary: 'List saved reports for a tenant, excluding expired ones' })
  async listSavedReports(
    @Query('tenantId') tenantId: string,
    @Query('take') take?: string,
  ) {
    // Explicit tenant, the same rule the rest of this controller follows: a platform read that
    // fell back to a default would show one customer's report archive to another.
    return this.archive.listSavedReports({
      tenantId: tenantId?.trim() ?? '',
      take: take ? Number(take) : undefined,
    });
  }

  @Post('platform-reports/saved')
  @ApiOperation({ summary: 'Run the tenant summary and store it so it can be downloaded again' })
  async saveReport(
    @Body() body: { tenantId?: string; hours?: number },
    @Request() request: AdminOperationsRequest,
  ) {
    return this.archive.saveTenantSummary({
      tenantId: body.tenantId ?? '',
      hours: body.hours ?? 24,
      // From the session, never the body: the archive records who saved a report, and a
      // body-supplied actor would let one operator write a report in another's name.
      actorMembershipId: request.user.tenantContext.membershipId,
    });
  }

  // -- MQTT management evidence -------------------------------------------
  //
  // GET only, deliberately. This surfaces what is connected to the broker; it cannot disconnect a
  // client, change a topic, or restart anything. Read-only is asserted by contract rather than left
  // to the absence of a handler, because a management surface that can kick a device is a far
  // larger blast radius than one that watches.
  //
  // The broker credentials never appear in the request: they are read from configuration inside
  // the service, and the broker's token is never returned. Proxying the dashboard would otherwise
  // hand every platform operator the broker's administrator token.
  @Get('platform-mqtt/management')
  @ApiOperation({ summary: 'Live MQTT broker state: connected clients, nodes, reachability' })
  async mqttManagement() {
    // No throw for a broker problem. A broker that is down is a fact to report, and it arrives
    // with `brokerReachable: false` so the console can distinguish it from an empty fleet.
    return this.mqtt.snapshot();
  }

// -- NOC operations -------------------------------------------------------
  //
  // The NOC console could render a finding and do nothing with it. These three routes are the verbs
  // a control room needs at 03:00, and the shape of each is a decision:
  //
  //  - `acknowledge` is idempotent per finding. The second call returns the first acknowledgement
  //    unchanged with `alreadyAcknowledged: true` rather than a 409, because two operators clicking
  //    during a handover is normal and answering it with an error teaches them to avoid the button.
  //  - `resolve` is refused when the finding was never acknowledged. Otherwise "resolved" would be
  //    reachable without anyone having been on duty, which would make the whole record decorative.
  //
  // The actor is read from the session in both. A body-supplied actor would let one operator record
  // a duty log in another's name, which is the single thing an on-call record must not permit.
  //
  // The *tenant*, by contrast, is named by the caller and that is deliberate: this console lists
  // findings across every tenant, so the tenant whose finding is being acknowledged is a fact about
  // the finding rather than about the session. The actor stays session-derived even so — the two
  // fields answer different questions, and only one of them is the caller's to choose.
  @Get('platform-noc/acknowledgements')
  @ApiOperation({ summary: 'Findings this tenant has acknowledged, newest first' })
  async listNocAcknowledgements(
    @Query('tenantId') tenantId: string,
  ) {
    // The duty log is read for a named tenant, like the saved-report archive above. The platform
    // operator's own tenant context is not the tenant whose findings they are triaging.
    return this.noc.list(tenantId);
  }

  @Post('platform-noc/findings/:findingId/acknowledge')
  @ApiOperation({ summary: 'Record that an operator has seen a finding' })
  async acknowledgeNocFinding(
    @Param('findingId') findingId: string,
    @Body() body: { tenantId?: string; note?: string },
    @Request() request: AdminOperationsRequest,
  ) {
    return this.noc.acknowledge({
      // The tenant comes from the body because the finding being acknowledged belongs to it, and
      // the session's tenant is the platform's own — reading the session here made every customer
      // finding answer 404 "not found in this tenant". Naming a tenant grants nothing on its own:
      // `assertFindingInTenant` resolves the finding *inside* that tenant, so a wrong id is a 404
      // rather than a cross-tenant write.
      tenantId: body?.tenantId ?? '',
      findingId,
      // Still the session, never the body. An on-call record written in someone else's name is
      // worth nothing, and this is the one field that must not become caller-chosen.
      actorMembershipId: request.user.tenantContext.membershipId,
      note: body?.note,
    });
  }

  @Delete('platform-noc/findings/:findingId/resolve')
  @ApiOperation({ summary: 'Close an incident; refused if it was never acknowledged' })
  async resolveNocFinding(
    @Param('findingId') findingId: string,
    @Query('tenantId') tenantId: string,
    @Request() request: AdminOperationsRequest,
  ) {
    return this.noc.resolve({
      // Query rather than body: this verb has no body, so a query parameter is the only place a
      // caller can state which tenant's incident it is closing.
      tenantId: tenantId?.trim() ?? '',
      findingId,
      actorMembershipId: request.user.tenantContext.membershipId,
    });
  }

  @Get('platform-reports/saved/:reportId')
  @ApiOperation({ summary: 'Read a saved report as it was stored, for download' })
  async getSavedReport(
    @Param('reportId') reportId: string,
    @Query('tenantId') tenantId: string,
  ) {
    return this.archive.getSavedReport(tenantId?.trim() ?? '', reportId);
  }
}

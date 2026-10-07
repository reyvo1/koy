import { BadRequestException, Controller, Get, Post, Delete, Body, Param, Request, Query, UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantContextGuard } from '../users/guards/tenant-context.guard';
import { CameraPlaybackService } from './camera-playback.service';
import { AdminRoleGuard } from '../admin-operations/admin-role.guard';
import { DeviceAccessGuard, RequireDeviceAccess } from '../device/device-access.guard';
import { MediaRuntimeService } from './media-runtime.service';
import { OnvifDiscoveryService } from './onvif-discovery.service';

/**
 * Discovery and playback, not onboarding.
 *
 * Every route here is a tenant operation and takes its tenant from the authenticated request. The
 * device id in the playback path is cross-checked against that tenant before a stream is registered,
 * because the route is otherwise a way to ask the media runtime to fetch an arbitrary RTSP URL on the
 * platform's behalf.
 */
@Controller('camera-network')
@UseGuards(JwtAuthGuard, TenantContextGuard)
export class CameraController {
  constructor(
    private readonly playback: CameraPlaybackService,
    private readonly discovery: OnvifDiscoveryService,
    private readonly media: MediaRuntimeService,
  ) {}

  @Post('devices/:id/playback')
  @UseGuards(DeviceAccessGuard)
  @RequireDeviceAccess('VIEW')
  async offer(@Request() req: any, @Param('id') id: string, @Body() body: { sdp?: unknown }) {
    return this.playback.offer(req.user.tenantContext.tenantId, id, body?.sdp);
  }

  @Delete('devices/:id/playback/:sessionId')
  @UseGuards(DeviceAccessGuard)
  @RequireDeviceAccess('VIEW')
  async stop(@Request() req: any, @Param('id') id: string, @Param('sessionId') sessionId: string) {
    return this.playback.stop(req.user.tenantContext.tenantId, id, sessionId);
  }

  /**
   * GET /camera-network/media/status — is the media runtime up.
   *
   * Separate from the stream list on purpose. "No cameras" and "the runtime is down" send the
   * operator to two entirely different places, and a screen that renders both as an empty list sends
   * them to the cameras.
   */
  @Get('media/status')
  async mediaStatus() {
    return this.media.status();
  }

  /**
   * GET /camera-network/discover — probe the segment for ONVIF devices.
   *
   * Returns host and port only. Credentials a camera volunteers in its own xAddr are stripped by the
   * service: this is a broadcast, so anything it carried would be readable by the whole segment.
   */
  @Get('discover')
  @UseGuards(AdminRoleGuard)
  async discover(@Query('timeoutMs') timeoutMs?: string) {
    const requested = timeoutMs === undefined ? undefined : Number(timeoutMs);
    if (requested !== undefined && (!Number.isInteger(requested) || requested <= 0 || requested > 3000)) {
      // A caller asking for a ten-minute discovery is asking for ten minutes of a request thread.
      throw new BadRequestException('timeoutMs harus integer antara 1 dan 3000.');
    }
    return { devices: await this.discovery.discover(requested) };
  }
}

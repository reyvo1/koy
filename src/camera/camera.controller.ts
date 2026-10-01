import { Controller, Get, Query, UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantContextGuard } from '../users/guards/tenant-context.guard';
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
    private readonly discovery: OnvifDiscoveryService,
    private readonly media: MediaRuntimeService,
  ) {}

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
  async discover(@Query('timeoutMs') timeoutMs?: string) {
    const requested = timeoutMs === undefined ? undefined : Number(timeoutMs);
    if (requested !== undefined && (!Number.isInteger(requested) || requested <= 0)) {
      // A caller asking for a ten-minute discovery is asking for ten minutes of a request thread.
      return { devices: [], refused: 'timeoutMs must be a positive integer' };
    }
    return { devices: await this.discovery.discover(requested) };
  }
}

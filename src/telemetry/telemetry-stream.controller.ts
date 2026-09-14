import {
  Controller,
  DefaultValuePipe,
  Param,
  ParseIntPipe,
  Query,
  Request,
  Sse,
  UseGuards,
} from '@nestjs/common';
import { interval, map, merge, of, switchMap } from 'rxjs';
import type { MessageEvent } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantContextGuard } from '../users/guards/tenant-context.guard';
import { TelemetryService } from './telemetry.service';
import { DeviceAccessGuard, RequireDeviceAccess } from '../device/device-access.guard';

/**
 * ADR-002: SSE realtime telemetry stream.
 * One-way push (server→client) with heartbeat; tenant-isolated via guards.
 */
@Controller('devices/:deviceId/telemetry')
@UseGuards(JwtAuthGuard, TenantContextGuard, DeviceAccessGuard)
export class TelemetryStreamController {
  constructor(private readonly telemetryService: TelemetryService) {}

  @Sse('stream')
  @RequireDeviceAccess('VIEW')
  stream(
    @Request() request: any,
    @Param('deviceId') deviceId: string,
    @Query('intervalSec', new DefaultValuePipe(5), ParseIntPipe) intervalSec: number,
  ): import('rxjs').Observable<MessageEvent> {
    // Bounded poll interval (min 2s, max 60s) — reads latest via the
    // authoritative telemetry service; SSE frames it as push events.
    const safeInterval = Math.min(Math.max(intervalSec, 2), 60);
    const tenantId: string = request.user.tenantContext.tenantId;

    const telemetry$ = interval(safeInterval * 1000).pipe(
      switchMap(() =>
        this.telemetryService
          .getLatest(tenantId, deviceId)
          .then(
            (data) =>
              ({
                type: 'telemetry',
                data: data ?? { status: 'empty' },
              }) as MessageEvent,
          )
          .catch(
            () =>
              ({
                type: 'error',
                data: { status: 'unavailable' },
              }) as MessageEvent,
          ),
      ),
    );

    const heartbeat$ = interval(15_000).pipe(
      map(() => ({ type: 'heartbeat', data: { t: Date.now() } }) as MessageEvent),
    );

    return merge(
      of({ type: 'connected', data: { deviceId } } as MessageEvent),
      telemetry$,
      heartbeat$,
    );
  }
}

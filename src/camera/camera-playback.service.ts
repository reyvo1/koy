import {
  BadRequestException,
  Injectable,
  NotFoundException,
  OnModuleDestroy,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { RuntimeConnectionsService } from '../runtime-connections/runtime-connections.service';
import { MediaRuntimeService } from './media-runtime.service';

@Injectable()
export class CameraPlaybackService implements OnModuleDestroy {
  private expiring = false;
  private readonly sessions = new Map<
    string,
    { tenantId: string; deviceId: string; name: string; expires: number }
  >();
  constructor(
    private readonly prisma: PrismaService,
    private readonly connections: RuntimeConnectionsService,
    private readonly media: MediaRuntimeService,
  ) {}

  async offer(tenantId: string, deviceId: string, sdp: unknown) {
    if (
      typeof sdp !== 'string' ||
      sdp.length > 65536 ||
      !sdp.startsWith('v=0') ||
      !sdp.includes('m=video')
    )
      throw new BadRequestException('SDP video tidak valid.');
    const camera = await this.prisma.device.findFirst({
      where: {
        id: deviceId,
        tenantId,
        type: 'CAMERA',
        status: { not: 'REVOKED' },
      },
      select: { id: true },
    });
    if (!camera) throw new NotFoundException('Kamera tidak ditemukan.');
    const config = this.connections.resolve(
      tenantId,
      `camera://${deviceId}`,
      'CAMERA',
    );
    let url: URL | null = null;
    try {
      if (typeof config.rtspUrl === 'string') url = new URL(config.rtspUrl);
    } catch {
      throw new ServiceUnavailableException(
        'Sumber kamera belum dikonfigurasi.',
      );
    }
    if (!url || !['rtsp:', 'rtsps:'].includes(url.protocol) || !url.hostname)
      throw new ServiceUnavailableException(
        'Sumber kamera belum dikonfigurasi.',
      );
    if (
      [...this.sessions.values()].filter(
        (session) => session.tenantId === tenantId,
      ).length >= 10
    )
      throw new ServiceUnavailableException(
        'Kapasitas sesi kamera tenant penuh.',
      );
    if (this.sessions.size >= 100)
      throw new ServiceUnavailableException('Kapasitas sesi kamera penuh.');
    const sessionId = randomUUID();
    const name = `iot-${sessionId}`;
    // Reserve before awaiting network calls so concurrent requests cannot exceed the cap.
    this.sessions.set(sessionId, {
      tenantId,
      deviceId,
      name,
      expires: Date.now() + 15 * 60_000,
    });
    try {
      await this.media.registerStream({ name, rtspUrl: url.toString() });
      const response = await fetch(this.media.playbackUrl(name), {
        method: 'POST',
        headers: { 'content-type': 'application/sdp' },
        body: sdp,
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) throw new Error('media refused');
      const answer = await response.text();
      if (!answer.startsWith('v=0') || answer.length > 65536)
        throw new Error('invalid answer');
      return { sessionId, sdp: answer, expiresInSeconds: 900 };
    } catch {
      await this.stop(tenantId, deviceId, sessionId);
      throw new ServiceUnavailableException(
        'Live view gagal tersambung. Periksa sumber dan media runtime.',
      );
    }
  }

  async stop(tenantId: string, deviceId: string, sessionId: string) {
    const session = this.sessions.get(sessionId);
    if (
      !session ||
      session.tenantId !== tenantId ||
      session.deviceId !== deviceId
    )
      return { stopped: false };
    const removed = await this.media.removeStream(session.name);
    if (removed) this.sessions.delete(sessionId);
    return { stopped: removed };
  }
  @Interval(60000)
  async expire() {
    if (this.expiring) return;
    this.expiring = true;
    try {
      const due = [...this.sessions].filter(
        ([, session]) => session.expires <= Date.now(),
      );
      for (let offset = 0; offset < due.length; offset += 5) {
        await Promise.allSettled(
          due
            .slice(offset, offset + 5)
            .map(([id, session]) =>
              this.stop(session.tenantId, session.deviceId, id),
            ),
        );
      }
    } finally {
      this.expiring = false;
    }
  }
  async onModuleDestroy() {
    await Promise.allSettled(
      [...this.sessions].map(([id, session]) =>
        this.stop(session.tenantId, session.deviceId, id),
      ),
    );
  }
}

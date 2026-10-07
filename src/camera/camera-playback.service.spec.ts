import { CameraPlaybackService } from './camera-playback.service';
describe('camera playback authorization and lifecycle', () => {
  const originalFetch = global.fetch;
  let service: CameraPlaybackService, prisma: any, connections: any, media: any;
  const offer = 'v=0\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\n';
  beforeEach(() => {
    prisma = {
      device: { findFirst: jest.fn().mockResolvedValue({ id: 'camera' }) },
    };
    connections = {
      resolve: jest
        .fn()
        .mockReturnValue({ rtspUrl: 'rtsp://fixture:secret@127.0.0.1/stream' }),
    };
    media = {
      registerStream: jest.fn().mockResolvedValue({}),
      playbackUrl: jest.fn().mockReturnValue('http://127.0.0.1/api/webrtc'),
      removeStream: jest.fn().mockResolvedValue(true),
    };
    service = new CameraPlaybackService(prisma, connections, media);
    global.fetch = jest
      .fn()
      .mockResolvedValue({ ok: true, text: async () => offer });
  });
  afterEach(async () => {
    await service.onModuleDestroy();
    global.fetch = originalFetch;
  });
  it('checks tenant-scoped camera before resolving credentials or contacting media', async () => {
    prisma.device.findFirst.mockResolvedValue(null);
    await expect(service.offer('foreign', 'camera', offer)).rejects.toThrow();
    expect(prisma.device.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'camera',
          tenantId: 'foreign',
          type: 'CAMERA',
          status: { not: 'REVOKED' },
        },
      }),
    );
    expect(connections.resolve).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });
  it.each([null, '', 'v=0\r\nm=audio', 'v=0' + 'a'.repeat(65536)])(
    'refuses invalid SDP',
    async (sdp) => {
      await expect(service.offer('t1', 'camera', sdp)).rejects.toThrow();
      expect(media.registerStream).not.toHaveBeenCalled();
    },
  );
  it('returns only scoped signaling and prevents foreign session removal', async () => {
    const result = await service.offer('t1', 'camera', offer);
    expect(JSON.stringify(result)).not.toContain('secret');
    expect(result.expiresInSeconds).toBe(900);
    expect(await service.stop('t2', 'camera', result.sessionId)).toEqual({
      stopped: false,
    });
    expect(media.removeStream).not.toHaveBeenCalled();
    expect(await service.stop('t1', 'camera', result.sessionId)).toEqual({
      stopped: true,
    });
  });
  it('cleans registered stream and sanitizes provider failures', async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new Error('password=secret'));
    await expect(service.offer('t1', 'camera', offer)).rejects.toThrow(
      'Live view gagal',
    );
    expect(media.removeStream).toHaveBeenCalledTimes(1);
  });
  it('refuses malformed server URL with a sanitized availability error', async () => {
    connections.resolve.mockReturnValue({ rtspUrl: 'not-url-secret' });
    await expect(service.offer('t1', 'camera', offer)).rejects.toThrow(
      'Sumber kamera',
    );
    expect(media.registerStream).not.toHaveBeenCalled();
  });
  it('bounds each tenant without letting it consume all global capacity', async () => {
    for (let index = 0; index < 10; index++)
      await service.offer('t1', 'camera', offer);
    await expect(service.offer('t1', 'camera', offer)).rejects.toThrow(
      'tenant penuh',
    );
    await expect(service.offer('t2', 'camera', offer)).resolves.toHaveProperty(
      'sessionId',
    );
  });

  it('expires only due sessions and retries failed removal', async () => {
    const result = await service.offer('t1', 'camera', offer);
    media.removeStream.mockResolvedValueOnce(false).mockResolvedValue(true);
    const time = jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 901000);
    await service.expire();
    await service.expire();
    expect(media.removeStream).toHaveBeenCalledTimes(2);
    expect(await service.stop('t1', 'camera', result.sessionId)).toEqual({
      stopped: false,
    });
    time.mockRestore();
  });
});

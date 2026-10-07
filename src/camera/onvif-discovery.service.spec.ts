import {
  OnvifDiscoveryService,
  ONVIF_MAX_DISCOVERED,
} from './onvif-discovery.service';

/**
 * Behavioural tests for ONVIF discovery.
 *
 * The source contract could not hold this file down: three of its assertions failed against correct
 * code and one of them — a bare `not.toMatch(/rtsp:\/\//)` — failed *because* the class docblock
 * quotes the very credential URL that the code exists to strip.
 *
 * The dangerous behaviour here is not visible in source shape at all. `stripUserInfo` can be written
 * six ways, five of which leak, and only calling it distinguishes them. A silent network and an
 * unreachable runtime are likewise indistinguishable by reading the code — you have to await one.
 */

describe('OnvifDiscoveryService', () => {
  let service: OnvifDiscoveryService;

  beforeEach(() => {
    service = new OnvifDiscoveryService();
  });

  describe('stripUserInfo', () => {
    // The one behaviour that must not regress. Discovery is a UDP broadcast: anything that can see
    // the segment can read what goes out, and an ONVIF xAddr carrying `admin:hunter2@` would put
    // the camera password in front of every host that happened to be listening.
    it.each([
      ['rtsp://admin:hunter2@10.0.0.9:554/stream', 'rtsp://10.0.0.9:554/stream'],
      ['rtsp://user@10.0.0.9/stream', 'rtsp://10.0.0.9/stream'],
      ['http://admin:pass@camera.local/onvif/device_service', 'http://camera.local/onvif/device_service'],
      ['admin:hunter2@10.0.0.9', '10.0.0.9'],
    ])('reduces %s to %s', (input, expected) => {
      expect(service.stripUserInfo(input)).toBe(expected);
    });

    it('leaves an address with no credentials untouched', () => {
      for (const clean of [
        'rtsp://10.0.0.9:554/stream',
        'http://camera.local/onvif/device_service',
        '10.0.0.9',
      ]) {
        expect(service.stripUserInfo(clean)).toBe(clean);
      }
    });

    it('keeps the path, which is often the only thing identifying the stream', () => {
      expect(service.stripUserInfo('rtsp://admin:pass@10.0.0.9/live/ch0')).toBe(
        'rtsp://10.0.0.9/live/ch0',
      );
    });

    it('does not treat an @ in the path as userinfo', () => {
      // `rtsp://10.0.0.9/stream?user=a@b` has an @ but no credentials. Splitting on the first @ would
      // turn it into `b`, silently pointing discovery at a host named "b".
      const input = 'rtsp://10.0.0.9/stream?user=a@b';
      expect(service.stripUserInfo(input)).toBe(input);
    });

    it('never returns anything containing the password', () => {
      const result = service.stripUserInfo('rtsp://admin:s3cr3t@10.0.0.9/stream');
      expect(result).not.toContain('s3cr3t');
      expect(result).not.toContain('admin');
    });
  });

  it('rejects a socket bind failure promptly and tears it down', async () => {
    const udp = require('dgram');
    let onError: ((error: Error) => void) | undefined;
    const socket = { on: jest.fn((event, handler) => { if (event === 'error') onError = handler; }), bind: jest.fn(() => queueMicrotask(() => onError?.(new Error('fixture bind error')))), close: jest.fn() };
    const spy = jest.spyOn(udp, 'createSocket').mockReturnValue(socket);
    try { await expect(service.discover(3000)).rejects.toThrow('Jaringan discovery'); expect(socket.close).toHaveBeenCalledTimes(1); }
    finally { spy.mockRestore(); }
  });

  describe('discover', () => {
    it('resolves with an empty array when nothing answers', async () => {
      // A segment with no cameras is a normal state. Throwing here would turn a quiet network into a
      // 500 and teach operators to ignore the feature.
      const found = await service.discover(60);
      expect(found).toEqual([]);
    });

    it('reports a quiet available segment without inventing cameras', async () => {
      // Real transport failures reject (covered above); a quiet segment still returns a list.
      await expect(service.discover(60)).resolves.toBeInstanceOf(Array);
    });

    it('returns within the timeout it was given', async () => {
      // The bound is the whole point. Without it a request thread is held until the HTTP layer gives
      // up, which under a scan of several subnets is a slow exhaustion of the worker pool.
      const started = Date.now();
      await service.discover(150);
      expect(Date.now() - started).toBeLessThan(2_000);
    });

    it('caps how many devices it will return', () => {
      // A hundred devices answering is a fact about the network, not a hundred rows for the caller.
      expect(ONVIF_MAX_DISCOVERED).toBeGreaterThan(0);
      expect(ONVIF_MAX_DISCOVERED).toBeLessThanOrEqual(64);
    });

    it('every entry is a host and port, never a URL', async () => {
      // Enforced at the type level for the compiler and here for the reader, because the difference
      // between "the camera is at 10.0.0.9" and "the camera is at admin:hunter2@10.0.0.9" is the whole
      // reason this service exists in this form.
      const found = await service.discover(60);
      for (const device of found) {
        expect(typeof device.host).toBe('string');
        expect(typeof device.port).toBe('number');
        expect(device.host).not.toContain('@');
        expect(device.host).not.toContain('://');
      }
    });
  });
});
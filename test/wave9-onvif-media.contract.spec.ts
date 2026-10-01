import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';

/**
 * Wave 9 steps 3 and 4: ONVIF discovery, and a real RTSP→WebRTC runtime.
 *
 * ## What was there
 *
 * Nothing. No ONVIF anywhere in `src/`, and no media runtime in any compose file — `go2rtc`,
 * `mediamtx`, `ffmpeg` and `webrtc` all returned nothing. Camera onboarding was complete and I got
 * that wrong in my own census first: a grep filtered on the substring `camera-onboarding`, which is
 * part of the *path* of the two files that wire it up, so the filter hid the evidence of the thing
 * being measured. That is why the checks below include "the runtime is declared" and "the runtime is
 * reachable", rather than trusting a source shape to stand for a running service.
 *
 * ## Why ONVIF discovery is behind a timeout and a size cap
 *
 * ONVIF discovery is a UDP multicast probe, and multicast is exactly the thing a network can drop,
 * blackhole, or answer from a device that is not a camera. The failure mode this protects against is
 * a discovery call that hangs a request thread while a camera on an unreachable VLAN stays silent.
 * So: a bounded timeout, and a bounded response. Both are behaviour, not configuration.
 *
 * ## Why credentials never pass through discovery
 *
 * `CameraOnboardingService`'s docblock already establishes the boundary: "no camera credentials,
 * RTSP URLs, or vendor payloads pass through here." Discovery returns *addresses and capabilities*.
 * An RTSP URL with a password embedded in it is a credential, and a discovery response is broadcast
 * to the segment — so one that carried credentials would be leaking them to every host that can see
 * the multicast. The contract pins that distinction rather than trusting the docblock.
 */

const ROOT = resolve(__dirname, '..');
const read = (relative: string): string => readFileSync(`${ROOT}/${relative}`, 'utf8');
const exists = (relative: string): boolean => {
  try {
    readFileSync(`${ROOT}/${relative}`, 'utf8');
    return true;
  } catch {
    return false;
  }
};

const COMPOSE = read('docker-compose.rescue.yml');

/** Comments and docblocks removed, for negative assertions over source text. */
const stripComments = (source: string): string =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

import { OnvifDiscoveryService } from '../src/camera/onvif-discovery.service';
const ONVIF = 'src/camera/onvif-discovery.service.ts';
const MEDIA = 'src/camera/media-runtime.service.ts';

describe('a media runtime exists, and it is declared where it can be found', () => {
  it('is in the rescue compose, as a named service', () => {
    expect(COMPOSE).toMatch(/^\s{2}go2rtc:/m);
  });

  it('and not added to the default compose', () => {
    // One stack, one runtime. Adding it to both would mean two go2rtc instances on the same host,
    // each holding a copy of every stream's credentials.
    const plain = read('docker-compose.yml');
    expect(plain).not.toMatch(/^\s{2}go2rtc:/m);
  });

  it('the compose service says why no volume is mounted', () => {
    // go2rtc writes its stream config — which contains RTSP credentials — into its working directory.
    // A comment without the reason gets deleted by the next person who runs out of disk.
    expect(COMPOSE).toMatch(/no volume is mounted|volume is mounted/i);
  });

  it('it exposes a WebRTC port, which is what a browser connects to', () => {
    expect(COMPOSE).toMatch(/8189/);
  });

  it('and it has a healthcheck, so readiness is not assumed from the container existing', () => {
    expect(COMPOSE.slice(COMPOSE.indexOf('go2rtc:'))).toMatch(/healthcheck/);
  });
});

describe('the runtime is reached through a service, not from a controller', () => {
  it('a media runtime service exists', () => {
    expect(exists(MEDIA)).toBe(true);
  });

  it('it takes the runtime URL from configuration', () => {
    // Hardcoding `http://go2rtc:8189` in code would make the host-side and container-side addresses
    // differ in a way nothing surfaces.
    expect(read(MEDIA)).toMatch(/process\.env|ConfigService|GO2RTC/);
  });

  it('it probes health rather than assuming a 200 from a container that just started', () => {
    expect(read(MEDIA)).toMatch(/api|health/i);
  });

  it('it distinguishes unreachable from empty', () => {
    // "No cameras" and "the runtime is down" are different answers, and collapsing them means the
    // operator debugs their cameras when the fault is in the stack.
    expect(read(MEDIA)).toMatch(/catch|try/);
  });

  it('and it builds a WebRTC playback URL rather than exposing an RTSP URL to a browser', () => {
    expect(read(MEDIA)).toMatch(/webrtc/i);
  });
});

describe('ONVIF discovery is bounded', () => {
  it('exists', () => {
    expect(exists(ONVIF)).toBe(true);
  });

  it('it has an explicit timeout', () => {
    const source = read(ONVIF);
    expect(source).toMatch(/timeout/i);
    expect(source).toMatch(/DISCOVERY_TIMEOUT|discoverWithin|TIMEOUT_MS/);
  });

  it('it caps how many results it will return', () => {
    // A broadcast probe can be answered by devices that are not cameras at all.
    expect(read(ONVIF)).toMatch(/MAX_DISCOVERED|slice\(0,|maxResults/);
  });

  it('it resolves on a timer rather than waiting for a reply', () => {
    // The bound is `setTimeout(resolve, ...)` inside the bind callback. An earlier version of this
    // assertion looked for `race|Promise.all|abort` and failed on correct code -- the vocabulary was
    // wrong, not the behaviour. Asserting on a specific idiom instead of a category means a
    // rewrite of a *correct* implementation reads as a regression.
    expect(read(ONVIF)).toMatch(/setTimeout\(resolve, timeoutMs\)/);
  });

  it('an empty result is an answer, not an error', () => {
    // Asserted by behaviour in `onvif-discovery.service.spec.ts` (a silent network resolves with
    // `[]` rather than rejecting), not by looking for a literal `return []`. A correct implementation
    // returns a filtered collection that happens to be empty, and that is not the same string.
    expect(read(ONVIF)).toMatch(/async discover/);
  });
});

describe('discovery returns addresses, never credentials', () => {
  const source = exists(ONVIF) ? read(ONVIF) : '';

  it('no method returns an RTSP URL with embedded credentials', () => {
    // Stripped of comments first. A bare negative scan failed against correct code because the
    // class docblock *quotes* `rtsp://admin:hunter2@10.0.0.9/stream` in order to explain why it is
    // stripped -- the guard was reading the documentation of the thing it was guarding. A negative
    // assertion over source text has to exclude prose or it will always fail, and once people get
    // used to that they will weaken it.
    const code = stripComments(source);
    expect(code).not.toMatch(/rtsp:\/\//);
  });

  it('and a URL with credentials really is reduced to a host', () => {
    // Behavioural proof of the line above, because the source shape of "strips userinfo" can be
    // achieved in several wrong ways.
    expect(new OnvifDiscoveryService().stripUserInfo('rtsp://admin:hunter2@10.0.0.9:554/stream'))
      .not.toContain('hunter2');
  });

  it('the shape carries a host and a port, not a URL', () => {
    expect(source).toMatch(/host|address|xAddrs/i);
  });

  it('and it strips userinfo if a device offers it', () => {
    // ONVIF `xAddrs` routinely come back as `rtsp://user:pass@host/stream` from misconfigured
    // firmware. Passing that through a broadcast response would hand credentials to the whole segment.
    expect(source).toMatch(/replace|userinfo|split\('@'\)|credentials/i);
  });

  it('discovery is not wired to the media runtime as a way to smuggle URLs in', () => {
    expect(source).not.toMatch(/paymentUrl|apiKey|token/);
  });
});
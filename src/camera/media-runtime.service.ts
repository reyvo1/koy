import { Inject, Injectable, Logger, Optional } from '@nestjs/common';

/**
 * The RTSP→WebRTC media runtime.
 *
 * ## Why a service and not a controller
 *
 * The controller needs one number — a playback URL — and it needs to know whether the runtime is up
 * before it hands that number out. Both are decisions about a *service that may not be running*, so
 * they belong here where they can be tested without a browser.
 *
 * ## Why the URL comes from configuration
 *
 * go2rtc is reachable at `http://127.0.0.1:8189` from the host and `http://go2rtc:8189` from inside
 * the API container. Those are genuinely different addresses for the same process, and hardcoding
 * either one means the other surface silently 404s. Read from configuration, with the internal
 * default for the container case.
 *
 * ## Why "unreachable" is not "no cameras"
 *
 * These are different faults with different remedies, and collapsing them sends the operator to debug
 * their cameras when the stack is down. Every method here reports which one it hit.
 */

export const MEDIA_RUNTIME_DEFAULT_URL = 'http://go2rtc:1984';

/**
 * Injection token for the runtime's base URL.
 *
 * Exists so the constructor can be `@Inject`ed explicitly, which is what stops Nest from treating
 * the `string` parameter as a provider to resolve.
 */
export const MEDIA_RUNTIME_URL = 'MEDIA_RUNTIME_URL';
const HEALTH_TIMEOUT_MS = 4_000;

export type MediaRuntimeState = 'reachable' | 'unreachable';

export interface MediaRuntimeStatus {
  state: MediaRuntimeState;
  /** Only meaningful when `state` is `reachable`. */
  version?: string;
  /** Present when unreachable, so the operator sees why rather than an empty list. */
  error?: string;
}

@Injectable()
export class MediaRuntimeService {
  private readonly logger = new Logger(MediaRuntimeService.name);

  /**
   * `@Inject` is load-bearing, not decoration.
   *
   * A bare `constructor(private readonly baseUrl: string = ...)` reads as an ordinary default
   * parameter, and it typechecks and passes every unit test. Nest, however, sees a `String`
   * dependency at index 0 and tries to resolve it from the module, so the container
   * restart-loops with `UnknownDependenciesException` before the default is ever consulted.
   *
   * The unit tests could not have caught this: they construct the service directly, which is
   * exactly the path that skips dependency resolution. Only starting the real container found it.
   */
  constructor(
    @Optional()
    @Inject(MEDIA_RUNTIME_URL)
    configured?: string,
  ) {
    this.baseUrl =
      configured ??
      process.env.GO2RTC_URL_INTERNAL ??
      process.env.GO2RTC_URL ??
      MEDIA_RUNTIME_DEFAULT_URL;
  }

  private readonly baseUrl: string;

  get url(): string {
    return this.baseUrl;
  }

  /**
   * Is the runtime up, and what version.
   *
   * A liveness probe rather than a request to a stream endpoint, because "is it up" and "does this one
   * camera work" are separate questions and conflating them means one broken camera reads as a dead
   * runtime.
   */
  async status(): Promise<MediaRuntimeStatus> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);
    try {
      const response = await fetch(`${this.baseUrl}/api`, { signal: controller.signal });
      if (!response.ok) {
        return { state: 'unreachable', error: `HTTP ${response.status}` };
      }
      const body = (await response.json()) as { version?: string };
      return { state: 'reachable', version: body.version };
    } catch (cause) {
      return {
        state: 'unreachable',
        error: cause instanceof Error ? cause.message : String(cause),
      };
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Register an RTSP source with the runtime and return its WebRTC playback URL.
   *
   * The RTSP URL is sent *to* the runtime and never returned *to a browser*: it carries the camera's
   * credentials, and a browser is not somewhere a credential should land. What comes back is the
   * WebRTC endpoint, which is credential-free by construction.
   *
   * Streams are added per session and not persisted. go2rtc writes its stream configuration into its
   * working directory, so persisting would put camera passwords on disk somewhere nothing else in
   * this stack puts them.
   */
  async registerStream(input: {
    name: string;
    rtspUrl: string;
  }): Promise<{ name: string; webrtcUrl: string }> {
    // Reject a URL with no host before it reaches the runtime: an obviously malformed source costs a
    // round trip and leaves a confusing 500 from go2rtc instead of a clear 400 from here.
    let parsed: URL;
    try {
      parsed = new URL(input.rtspUrl);
    } catch {
      throw new Error(`stream "${input.name}" has an unparseable RTSP URL`);
    }
    if (!parsed.hostname) {
      throw new Error(`stream "${input.name}" has an RTSP URL with no host`);
    }

    // `api/streams?name=<name>&src=<url>` adds a source at runtime. `encodeURIComponent` on the src
    // matters: an RTSP URL is full of `&` and `?`, and an unencoded one silently truncates the path.
    const query = `name=${encodeURIComponent(input.name)}&src=${encodeURIComponent(input.rtspUrl)}`;
    const response = await fetch(`${this.baseUrl}/api/streams?${query}`, {
      method: 'PUT',
    });
    if (!response.ok) {
      throw new Error(`media runtime refused stream "${input.name}": HTTP ${response.status}`);
    }

    return { name: input.name, webrtcUrl: this.playbackUrl(input.name) };
  }

  /** The credential-free URL a browser connects to. */
  playbackUrl(streamName: string): string {
    return `${this.baseUrl.replace(/\/$/, '')}/api/webrtc?src=${encodeURIComponent(streamName)}`;
  }

  async removeStream(name: string): Promise<boolean> {
    try {
      const response = await fetch(
        `${this.baseUrl}/api/streams?src=${encodeURIComponent(name)}`,
        { method: 'DELETE' },
      );
      return response.ok;
    } catch (cause) {
      this.logger.warn({
        event: 'media.stream.remove_failed',
        outcome: 'unreachable',
        stream: name,
        error: cause instanceof Error ? cause.message : String(cause),
      });
      return false;
    }
  }
}

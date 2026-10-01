import { Injectable, Logger } from '@nestjs/common';
import * as dgram from 'dgram';

/**
 * ONVIF WS-Discovery.
 *
 * ## Why every knob here is a hard bound
 *
 * WS-Discovery is a UDP multicast probe to `239.255.255.250:3702`, answered by whatever is listening.
 * That gives it three ways to hurt a request:
 *
 *  - **a silent network** — no answer ever arrives, so anything that awaits a reply hangs until the
 *    HTTP request times out, holding a worker for the duration;
 *  - **a chatty network** — a hundred devices answer, including things that are not cameras;
 *  - **misconfigured firmware** — an `xAddr` comes back carrying credentials.
 *
 * So: a timeout, a result cap, and userinfo stripping. None of them is configuration; all three are
 * behaviour.
 *
 * ## Why userinfo is stripped rather than passed through
 *
 * `rtsp://admin:hunter2@10.0.0.9/stream` is a real and common ONVIF response. Discovery is a
 * *broadcast*: every host on the segment can observe it. Returning that address from a discovery
 * endpoint hands the camera's password to anything listening, and it would also end up in any log
 * that records discovery results. So the credential is removed here, and the caller supplies it
 * later over an authenticated path.
 *
 * ## Why this is not a credential channel
 *
 * `CameraOnboardingService` already sets the boundary: no credentials, no RTSP URLs, no vendor
 * payloads through onboarding. Discovery extends it — this returns host, port, and whether the device
 * answered an ONVIF probe at all. Nothing here can be used to reach a camera.
 */

export const ONVIF_DISCOVERY_TIMEOUT_MS = 3_000;
export const ONVIF_MAX_DISCOVERED = 32;
const MULTICAST_ADDRESS = '239.255.255.250';
const MULTICAST_PORT = 3702;

const WS_DISCOVERY_PROBE = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<e:Envelope xmlns:e="http://www.w3.org/2003/05/soap-envelope"',
  ' xmlns:w="http://schemas.xmlsoap.org/ws/2004/08/addressing"',
  ' xmlns:d="http://schemas.xmlsoap.org/ws/2005/04/discovery"',
  ' xmlns:dn="http://www.onvif.org/ver10/network/wsdl">',
  '<e:Header><w:MessageID>urn:uuid:00000000-0000-0000-0000-000000000001</w:MessageID>',
  '<w:To e:mustUnderstand="true">urn:schemas-xmlsoap-org:ws:2005:04:discovery</w:To>',
  '<w:Action e:mustUnderstand="true">http://schemas.xmlsoap.org/ws/2005/04/discovery/Probe</w:Action>',
  '</e:Header>',
  '<e:Body><d:Probe><d:Types>dn:NetworkVideoTransmitter</d:Types></d:Probe></e:Body>',
  '</e:Envelope>',
].join('');

export interface DiscoveredDevice {
  /** Host and port only. Never a URL with credentials — see the class comment. */
  host: string;
  port: number;
  /** True when the device answered the ONVIF probe rather than merely being on the segment. */
  onvif: boolean;
}

@Injectable()
export class OnvifDiscoveryService {
  private readonly logger = new Logger(OnvifDiscoveryService.name);

  /**
   * Probe the segment and return what answered, within the timeout.
   *
   * Resolves with an empty array when nothing answers. That is an answer, not a failure: a segment
   * with no cameras on it is a normal state and the caller should say so rather than throw.
   */
  async discover(timeoutMs: number = ONVIF_DISCOVERY_TIMEOUT_MS): Promise<DiscoveredDevice[]> {
    const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    const found = new Map<string, DiscoveredDevice>();

    try {
      socket.on('error', (cause) => {
        // The socket can fail on a host with no multicast route. That is a real answer too.
        this.logger.warn({
          event: 'camera.discovery.socket_error',
          outcome: 'unreachable',
          error: cause.message,
        });
      });

      socket.on('message', (message, remote) => {
        const text = message.toString('utf8');
        // A UDP port bound to 3702 receives whatever anyone sends it. Only a ProbeMatch or a
        // ProbeResponse is a device answering our probe; anything else is noise that happens to be
        // addressed to this port. Lint caught the consequence of ignoring that distinction -- the
        // flag was computed and then discarded, and every entry was reported as `onvif: true`.
        // That is a confident falsehood in a list an operator reads to decide what to point a camera
        // at, so noise is dropped rather than labelled.
        if (!/ProbeMatch|ProbeResponse/.test(text)) return;

        const host = this.extractHost(text) ?? remote.address;
        if (!host) return;

        const device = this.toDevice(host);
        if (device) {
          // Keyed by host so a device answering five times is one entry, not five.
          found.set(device.host, device);
        }
      });

      await new Promise<void>((resolve) => {
        socket.bind(() => {
          try {
            // Errors here are not fatal: the timeout below still returns a real answer.
            socket.setBroadcast(true);
            socket.setMulticastTTL(2);
            socket.addMembership(MULTICAST_ADDRESS);
            socket.send(WS_DISCOVERY_PROBE, MULTICAST_PORT, MULTICAST_ADDRESS);
          } catch {
            // No multicast route on this host. Fall through to the timeout.
          }
          // The bound that matters: this resolves regardless of who answered.
          setTimeout(resolve, timeoutMs);
        });
      });
    } finally {
      // Always torn down. A discovery socket left bound keeps the multicast membership and the port
      // open, and the next call then silently finds nothing because it is talking to itself.
      try {
        socket.close();
      } catch {
        // Already closed.
      }
    }

    // Capped last, after dedupe: a hundred answering devices is a fact about the network, not a
    // reason to hand the caller a hundred rows.
    return [...found.values()].slice(0, ONVIF_MAX_DISCOVERED);
  }

  private toDevice(host: string): DiscoveredDevice | null {
    const cleaned = this.stripUserInfo(host);
    if (!cleaned) return null;
    const port = this.extractPort(cleaned) ?? 80;
    return { host: cleaned, port, onvif: true };
  }

  /**
   * Remove any `user:password@` from an address.
   *
   * This is the single most important line in the file. An ONVIF `xAddr` routinely looks like
   * `rtsp://admin:hunter2@10.0.0.9:554/stream`, and discovery is a broadcast — returning that would
   * hand the camera's credentials to every host that can observe the segment.
   */
  stripUserInfo(address: string): string {
    const schemeEnd = address.indexOf('://');
    const head = schemeEnd === -1 ? '' : address.slice(0, schemeEnd + 3);
    const rest = schemeEnd === -1 ? address : address.slice(schemeEnd + 3);

    // Userinfo is only userinfo when the `@` is inside the *authority*. The authority ends at the
    // first `/`, `?` or `#` after the scheme, so an `@` beyond that point belongs to a path or a
    // query value and is not a credential separator.
    //
    // Without this bound, `rtsp://10.0.0.9/stream?user=a@b` is rewritten to `rtsp://b` — the tail
    // after the first `@` becomes the host. Discovery would then report a device at an address that
    // has nothing to do with the camera, and report it *successfully*: no error, just a wrong pin on
    // a map. A quieter wrong answer than a crash, which is why it is worth a test rather than a
    // review comment.
    const authorityEnd = rest.search(/[/?#]/);
    const authority = authorityEnd === -1 ? rest : rest.slice(0, authorityEnd);
    const at = authority.lastIndexOf('@');
    if (at === -1) return address;

    return head + authority.slice(at + 1) + (authorityEnd === -1 ? '' : rest.slice(authorityEnd));
  }

  private extractHost(xml: string): string | null {
    const match = /(?:XAddrs|Address|Location)[^>]*>([^<]+)</i.exec(xml);
    if (!match) return null;
    const value = match[1].trim();
    // The value is a URL; take its host, having dropped any credentials on the way.
    try {
      const url = new URL(value);
      return url.hostname || null;
    } catch {
      // A bare address rather than a URL.
      return this.stripUserInfo(value).split(/[:/]/)[0] || null;
    }
  }

  private extractPort(address: string): number | null {
    const tail = address.slice(address.lastIndexOf(':') + 1);
    const port = Number.parseInt(tail, 10);
    return Number.isInteger(port) && port > 0 && port < 65_536 ? port : null;
  }
}
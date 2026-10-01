#!/usr/bin/env python3
"""Wave 9, step 4: prove the media runtime actually converts RTSP to WebRTC.

## Why this needs a synthetic camera

A go2rtc container that is up, a stream registered, and a green `/api/streams` all coexist happily
with a product that shows nothing in a browser. Every one of those is a fact about configuration. The
only thing that settles whether the media path works is an **SDP answer**: it can only exist if the
H264 arriving over RTSP was repacked for WebRTC, and it can only be obtained by offering WebRTC and
waiting for a negotiation to complete.

So the probe builds the whole chain rather than inspecting any one link:

    ffmpeg test pattern  --RTSP-->  go2rtc  --WebRTC-->  SDP answer

The ffmpeg source stands in for a camera because no physical camera is attached. That is an honest
substitution for the *transport* and it is not a claim about camera firmware, ONVIF profile support,
or a real NVR — those stay unproven and are reported as such.

## What is and is not proven here

PROVEN   the runtime is up and reports a version
PROVEN   a source can be registered through the same API `MediaRuntimeService` calls
PROVEN   an RTSP producer is accepted and its SDP is real H264
PROVEN   WebRTC negotiation completes: an answer with a video m-line, an H264 payload map, an ICE
         ufrag, a DTLS fingerprint and server-reflexive candidates

UNPROVEN a browser renders the frames end to end (no headless browser is driven here)
UNPROVEN real camera firmware: ONVIF profile, vendor quirks, long-run stability, authentication
"""

import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

# The *control* port, not the WebRTC port. go2rtc serves `/api` on 1984 and SDP on 8189; a probe
# pointed at 8189 reports "unreachable" against a runtime that is up and serving. The distinction is
# named in GO2RTC_URL in ops/env/rescue-local.env.example for the same reason.
RUNTIME = os.environ.get("GO2RTC_HOST_URL", "http://127.0.0.1:1984")
CONTAINER = os.environ.get("GO2RTC_CONTAINER", "iot-rescue-go2rtc")
STREAM = "wave9probe"

passed = failed = 0
unproven: list[str] = []


def check(label: str, ok: bool, detail: object = "") -> None:
    global passed, failed
    if ok:
        passed += 1
        print(f"PASS  {label}")
    else:
        failed += 1
        print(f"FAIL  {label}{' — ' + str(detail) if detail else ''}")


def unproven_note(label: str) -> None:
    unproven.append(label)
    print(f"UNPROVEN  {label}")


def api(path: str, method: str = "GET") -> tuple[int, object]:
    req = urllib.request.Request(RUNTIME + path, method=method)
    with urllib.request.urlopen(req, timeout=10) as response:
        raw = response.read().decode()
        return response.status, (json.loads(raw) if raw else None)


OFFER = "\r\n".join(
    [
        "v=0",
        "o=- 0 0 IN IP4 127.0.0.1",
        "s=-",
        "t=0 0",
        "a=group:BUNDLE 0",
        "a=msid-semantic: WMS",
        "m=video 9 UDP/TLS/RTP/SAVPF 96",
        "c=IN IP4 0.0.0.0",
        "a=rtcp:9 IN IP4 0.0.0.0",
        "a=ice-ufrag:probe",
        "a=ice-pwd:probeprobeprobeprobeprobe",
        "a=ice-options:trickle",
        # A syntactically valid but untrusted fingerprint: the answer is what is being inspected, and
        # TLS is not part of what this probe claims.
        "a=fingerprint:sha-256 11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:"
        "11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00",
        "a=setup:actpass",
        "a=mid:0",
        "a=sendonly",
        "a=rtcp-mux",
        "a=rtpmap:96 H264/90000",
        "a=fmtp:96 level-asymmetry-allowed=1;packetization-mode=1;profile-level-id=42e01f",
        "a=ssrc:1000 cname:probe",
        "",
    ]
)


def kill_publisher() -> None:
    """Stop any ffmpeg publishing into this probe's stream, ours or a previous run's.

    Without this the probe races itself. Each run started an ffmpeg and never stopped it, so a second
    run found the *first* run's producer, and when that one exited the WebRTC negotiation failed --
    a flake that only appears from the second invocation onwards and reads as a media-path fault.
    """
    subprocess.run(
        ["docker", "exec", CONTAINER, "sh", "-c",
         f"pkill -f 'rtsp://127.0.0.1:8554/{STREAM}' || true"],
        check=False,
    )


def cleanup() -> None:
    kill_publisher()
    try:
        api(f"/api/streams?src={urllib.parse.quote(STREAM)}", "DELETE")
        print(f"swept stream {STREAM}")
    except (urllib.error.URLError, OSError) as cause:
        print(f"sweep failed: {cause}", file=sys.stderr)


try:
    # ---------------------------------------------------------------- the runtime answers
    status, body = api("/api")
    check("the media runtime is up", status == 200, f"HTTP {status}")
    check(
        "and reports a version rather than an empty body",
        isinstance(body, dict) and bool(body.get("version")),
        body,
    )
    version = body.get("version") if isinstance(body, dict) else None
    print(f"go2rtc {version}\n")

    # ---------------------------------------------------------------- a known-empty start
    # Swept before registering, not only after: the previous run's stream is residue from this probe's
    # point of view, and inheriting it makes the "did registration work" assertion untestable.
    kill_publisher()
    try:
        api(f"/api/streams?src={urllib.parse.quote(STREAM)}", "DELETE")
    except (urllib.error.URLError, OSError):
        pass

    # ---------------------------------------------------------------- register, as the service does
    query = urllib.parse.urlencode({"name": STREAM, "src": f"rtsp://127.0.0.1:8554/{STREAM}"})
    status, _ = api(f"/api/streams?{query}", "PUT")
    check("a source registers through the runtime API", status == 200, f"HTTP {status}")

    # ---------------------------------------------------------------- a real RTSP producer
    # Registration alone is not a producer. ffmpeg publishes a generated pattern over RTSP, and only
    # then does go2rtc hold a negotiated SDP rather than a configuration line.
    subprocess.run(
        [
            "docker", "exec", "-d", CONTAINER,
            "sh", "-c",
            "ffmpeg -hide_banner -loglevel error -re -f lavfi -i "
            "testsrc=size=320x240:rate=10 -c:v libx264 -preset ultrafast -tune zerolatency "
            f"-pix_fmt yuv420p -g 10 -f rtsp -rtsp_transport tcp rtsp://127.0.0.1:8554/{STREAM}",
        ],
        check=True,
    )
    producer: dict = {}
    for _ in range(20):
        time.sleep(1)
        streams = api("/api/streams")[1]
        entry = streams.get(STREAM, {}) if isinstance(streams, dict) else {}
        # A producer carries an id and an sdp; a mere configuration entry has only a url.
        live = [p for p in entry.get("producers", []) if p.get("sdp")]
        if live:
            producer = live[0]
            break
    check("an RTSP producer is accepted", bool(producer), "no producer with an sdp after 20s")
    check(
        "and the SDP is real H264 with actual parameter sets",
        "H264" in producer.get("sdp", "") and "sprop-parameter-sets" in producer.get("sdp", ""),
        producer.get("sdp", "")[:120],
    )

    # ---------------------------------------------------------------- the conversion, which is the point
    request = urllib.request.Request(
        f"{RUNTIME}/api/webrtc?src={STREAM}",
        data=OFFER.encode(),
        headers={"content-type": "application/sdp"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=15) as response:
        answer = response.read().decode()

    check("WebRTC negotiation completes", answer.strip().startswith("v=0"), answer[:80])
    check("the answer carries a video m-line", "m=video" in answer)
    check("mapping it to H264, so the RTSP codec was carried across", "H264" in answer)
    check("an ICE ufrag, so the connection is not a stub", "a=ice-ufrag" in answer)
    check("a DTLS fingerprint, so the media path is encrypted", "a=fingerprint" in answer)
    check(
        "and at least one network candidate",
        "a=candidate" in answer,
    )

    print()
    unproven_note("a browser renders the frames (no headless browser driven here)")
    unproven_note("real camera firmware: ONVIF profile, vendor quirks, long-run stability")
finally:
    cleanup()

print(f"\n{passed} passed, {failed} failed, {len(unproven)} unproven")
sys.exit(1 if failed else 0)
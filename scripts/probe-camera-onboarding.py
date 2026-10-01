#!/usr/bin/env python3
"""Wave 9 step 2: camera onboarding, proven against the running API.

Camera onboarding turned out to be fully wired already — module registered, four routes, a separate
public pair controller. This probe therefore does not assert that it exists; it asserts that the
asymmetry works, which is the part that is easy to break and invisible until a camera stops pairing:

  - `POST /cameras` and `GET /cameras` need a session and take their tenant from it;
  - `POST /cameras/:id/pair` must be reachable with **no** session, because a camera has none.

Both halves are checked. A probe that only checked the authenticated half would pass against a pair
endpoint that had accidentally inherited the tenant guard — which is a broken product with a green
probe.

The camera it registers is named with this probe's marker and swept by that marker afterwards.
"""

import json, os, sys, urllib.error, urllib.request

BASE = os.environ.get("PROBE_API_BASE", "http://127.0.0.1:5000")
TENANT = os.environ.get("PROBE_TENANT", "44444444-4444-4444-8444-444444444444")
FOREIGN = "33333333-3333-4333-8333-333333333333"
MARKER = "wave9-camera-probe"
LOGIN = json.load(open(os.environ.get(
    "PROBE_LOGIN_FILE", "reports/probe-session.json")))

passed = failed = 0


def check(label: str, ok: bool, detail: object = "") -> None:
    global passed, failed
    if ok:
        passed += 1
        print(f"PASS  {label}")
    else:
        failed += 1
        print(f"FAIL  {label}{' — ' + str(detail) if detail else ''}")


def call(method: str, path: str, body: object = None, tenant: str | None = TENANT,
         token: str | None = None, use_default_token: bool = True) -> tuple[int, object]:
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(BASE + path, data=data, method=method)
    req.add_header("accept", "application/json")
    req.add_header("content-type", "application/json")
    effective = token if token is not None else (LOGIN["accessToken"] if use_default_token else None)
    if effective:
        req.add_header("authorization", f"Bearer {effective}")
    if tenant:
        req.add_header("x-tenant-id", tenant)
    try:
        with urllib.request.urlopen(req, timeout=20) as response:
            raw = response.read().decode()
            return response.status, (json.loads(raw) if raw else None)
    except urllib.error.HTTPError as error:
        raw = error.read().decode()
        try:
            return error.code, json.loads(raw)
        except json.JSONDecodeError:
            return error.code, raw


# ---------------------------------------------------------------- the tenant side needs a session
status, body = call("GET", "/cameras", use_default_token=False, tenant=None)
check("listing cameras without a session is refused", status in (401, 403), f"HTTP {status} {body}")

status, body = call("POST", "/cameras", {"name": MARKER, "vendor": "probe-vendor"},
                    use_default_token=False, tenant=None)
check("registering a camera without a session is refused", status in (401, 403), f"HTTP {status} {body}")

# ---------------------------------------------------------------- register
status, camera = call("POST", "/cameras", {"name": f"{MARKER}-cam", "vendor": "probe-vendor",
                                           "model": "probe-model"})
check("a camera can be registered", status in (200, 201), f"HTTP {status} {camera}")
if status not in (200, 201):
    print(f"\n{passed} passed, {failed} failed")
    sys.exit(1)
# The real shape is `{ deviceId, status, pairingUri, expiresInSeconds }` -- there is no `id` field,
# and the token is not returned on its own but inside the pairing URI that becomes the QR code.
# An earlier version of this probe read `id` and a bare `provisioningToken`, which KeyError'd against
# a product that was working correctly.
camera_id = camera["deviceId"]
pairing_uri = camera.get("pairingUri", "")
token_value = pairing_uri.rsplit("/", 1)[-1] if "/" in pairing_uri else ""
check("it starts in PROVISIONING", camera.get("status") == "PROVISIONING", camera)
check("and a pairing URI carrying a one-time token is issued", bool(token_value), camera)
check("and the URI never carries the tenant", TENANT not in pairing_uri, pairing_uri)

# ---------------------------------------------------------------- the token is never the tenant's
status, body = call("GET", f"/cameras/{camera_id}", tenant=FOREIGN)
check("another tenant cannot read this camera", status in (401, 403, 404), f"HTTP {status} {body}")

# ---------------------------------------------------------------- pairing, with no session at all
# This is the half that matters. The camera has no user account and no tenant session; if this route
# inherited the tenant guard it would return 401 and onboarding would be dead in production.
status, paired = call("POST", f"/cameras/{camera_id}/pair",
                      {"token": token_value, "password": "Probe-Passw0rd!"},
                      use_default_token=False, tenant=None)
check("pairing works with no session and no tenant header", status in (200, 201), f"HTTP {status} {paired}")
check("and the camera becomes PAIRED",
      isinstance(paired, dict) and paired.get("status") == "PAIRED", paired)

# ---------------------------------------------------------------- the token is single-use
status, again = call("POST", f"/cameras/{camera_id}/pair",
                     {"token": token_value, "password": "Probe-Passw0rd!"},
                     use_default_token=False, tenant=None)
check("the same QR token cannot pair a second time", status in (401, 403), f"HTTP {status} {again}")

# ---------------------------------------------------------------- a wrong token is refused
status, body = call("POST", f"/cameras/{camera_id}/pair",
                    {"token": "wrong-token", "password": "Probe-Passw0rd!"},
                    use_default_token=False, tenant=None)
check("a wrong token is refused", status in (401, 403), f"HTTP {status} {body}")

# ---------------------------------------------------------------- the list tells cameras apart
status, cameras = call("GET", "/cameras")
check("cameras can be listed", status == 200, f"HTTP {status} {cameras}")
items = cameras if isinstance(cameras, list) else (
    cameras.get("items", []) if isinstance(cameras, dict) else [])
found = next(
    (c for c in items
     if isinstance(c, dict) and camera_id in (c.get("id"), c.get("deviceId"))),
    None,
)
check("the registered camera appears in the list",
      found is not None and (found.get("id") == camera_id or found.get("deviceId") == camera_id), found)
check("and the list carries its vendor", found is not None and (
    found.get("vendor") == "probe-vendor" or "probe-vendor" in json.dumps(found)), found)

print(f"\n{passed} passed, {failed} failed")
sys.exit(1 if failed else 0)

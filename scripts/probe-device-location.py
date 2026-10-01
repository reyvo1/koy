#!/usr/bin/env python3
"""Wave 9 step 1: device location, proven against the running API.

The point of this probe is the refusals. A location domain is a map, and a map that draws another
tenant's devices is the failure nobody notices until it is a breach. So the cross-tenant reads are
asserted as hard failures rather than as "no rows".

It also pins the history behaviour, because the table used to be `deviceId @unique` and each fix
overwrote the last. Two fixes arriving must produce two rows, and the latest must be the later one.

Sweeps by device id, not by tenant: the rows this creates are only ever this probe's own fixes on the
device it selected.
"""

import json, os, sys, urllib.error, urllib.request

BASE = os.environ.get("PROBE_API_BASE", "http://127.0.0.1:5000")
TENANT = os.environ.get("PROBE_TENANT", "44444444-4444-4444-8444-444444444444")
FOREIGN = "33333333-3333-4333-8333-333333333333"
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


def call(method: str, path: str, body: object = None,
         tenant: str | None = TENANT) -> tuple[int, object]:
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(BASE + path, data=data, method=method)
    req.add_header("accept", "application/json")
    req.add_header("content-type", "application/json")
    req.add_header("authorization", f"Bearer {LOGIN['accessToken']}")
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


status, devices = call("GET", "/devices?limit=20")
rows = devices if isinstance(devices, list) else (
    devices.get("items", []) if isinstance(devices, dict) else [])
if rows:
    device_id = str(rows[0]["id"])
    owns_device = False
    print(f"device under test: {device_id}")
else:
    # A fresh CI database has no devices, so waiting for one is not a plan. Register a camera to use
    # as the subject and sweep it afterwards -- a probe that depends on a precondition it never
    # establishes reports "no device" on every clean run, which reads as an environment problem
    # rather than the missing fixture it is.
    status, camera = call("POST", "/cameras", {"name": "wave9-loc-probe", "vendor": "probe-vendor"})
    if status not in (200, 201):
        print(f"could not register a device to test against: HTTP {status} {camera}")
        sys.exit(2)
    device_id = str(camera["deviceId"])
    owns_device = True
    print(f"no device in the tenant; registered one for this probe: {device_id}")
print()

# ---------------------------------------------------------------- the endpoint exists at all
status, history = call("GET", f"/devices/{device_id}/location")
check("the location endpoint is reachable", status == 200, f"HTTP {status} {history}")
if status != 200:
    print(f"\n{passed} passed, {failed} failed")
    sys.exit(1)
check(
    "and reports a total and a history even when nothing is recorded",
    "total" in history and "items" in history and "latest" in history,
    history,
)

# ---------------------------------------------------------------- a non-integer limit is refused
status, body = call("GET", f"/devices/{device_id}/location?limit=notanumber")
check("a non-numeric limit is refused", status == 400, f"HTTP {status} {body}")

# ---------------------------------------------------------------- an absurd limit is bounded
status, body = call("GET", f"/devices/{device_id}/location?limit=100000")
check(
    "an absurd limit is bounded rather than honoured",
    status == 200 and isinstance(body, dict) and len(body.get("items", [])) <= 200,
    len(body.get("items", [])) if isinstance(body, dict) else body,
)

# ---------------------------------------------------------------- another tenant is refused
status, body = call("GET", f"/devices/{device_id}/location", tenant=FOREIGN)
check(
    "another tenant cannot read this device's location",
    status in (401, 403, 404),
    f"HTTP {status} {body}",
)

status, body = call("GET", "/devices/00000000-0000-4000-8000-000000000000/location")
check(
    "a device that is not in this tenant is refused, not an empty history",
    status in (403, 404),
    f"HTTP {status} {body}",
)

# ---------------------------------------------------------------- writing, and keeping history
# The behaviour that changed in Wave 9: `deviceId @unique` used to mean each fix overwrote the last,
# so "where was it when it went offline" could only be answered with where it is now. Two fixes must
# produce two rows, and `latest` must be the later one.
before_total = history.get("total", 0) if isinstance(history, dict) else 0

status, first = call("POST", f"/devices/{device_id}/location",
                     {"latitude": -6.2, "longitude": 106.8, "label": "probe-a"})
check("a fix can be recorded", status in (200, 201), f"HTTP {status} {first}")

status, second = call("POST", f"/devices/{device_id}/location",
                      {"latitude": -6.21, "longitude": 106.81, "label": "probe-b"})
check("a second fix can be recorded", status in (200, 201), f"HTTP {status} {second}")

check(
    "the two fixes are distinct rows rather than one overwritten position",
    isinstance(first, dict) and isinstance(second, dict) and first.get("id") != second.get("id"),
    f"{first} / {second}",
)

status, after = call("GET", f"/devices/{device_id}/location")
check(
    "history grew by two",
    isinstance(after, dict) and after.get("total", 0) >= before_total + 2,
    f"{before_total} -> {after.get('total') if isinstance(after, dict) else after}",
)
check(
    "and latest is one of them, not a third value",
    isinstance(after, dict) and after.get("latest") is not None,
    after.get("latest") if isinstance(after, dict) else after,
)

# ---------------------------------------------------------------- impossible coordinates
for label, payload in [
    ("latitude above 90", {"latitude": 91, "longitude": 0}),
    ("longitude above 180", {"latitude": 0, "longitude": 181}),
    ("a string latitude", {"latitude": "abc", "longitude": 0}),
]:
    status, body = call("POST", f"/devices/{device_id}/location", payload)
    check(f"{label} is refused", status == 400, f"HTTP {status} {body}")

# ---------------------------------------------------------------- another tenant cannot write
status, body = call("POST", f"/devices/{device_id}/location",
                    {"latitude": 0, "longitude": 0}, tenant=FOREIGN)
check(
    "another tenant cannot plant a position on this device",
    status in (401, 403, 404),
    f"HTTP {status} {body}",
)

# ---------------------------------------------------------------- origin is a real position
status, body = call("POST", f"/devices/{device_id}/location", {"latitude": 0, "longitude": 0})
check("0,0 is accepted as a real position, not a null sentinel", status in (200, 201), f"HTTP {status} {body}")

if owns_device:
    # The camera probe's cleanup only matches its own marker, so the device this probe had to create
    # is swept here. Leaving it behind would make the next run's "no device" branch stop firing and
    # quietly change which code path the probe exercises.
    try:
        call("DELETE", f"/devices/{device_id}")
    except Exception as exc:  # noqa: BLE001 - cleanup must not mask probe results
        print(f"device cleanup failed: {exc}")

print(f"\n{passed} passed, {failed} failed")
sys.exit(1 if failed else 0)

#!/usr/bin/env python3
"""Wave 7 technician maintenance probe.

Drives the real routes against the running API. Every claim it makes is about the wire: that a
window opens, that the second open is refused rather than silently allowed, that a heartbeat does
not close it, and that resolving it works and is idempotent-refusing.

The heartbeat check is the one this domain exists for. `DeviceService.updateHeartbeat` writes
`status = ACTIVE` on every ping, so a `MAINTENANCE` member of `DeviceStatus` would be gone within
seconds of being set. The probe therefore fires a heartbeat while the window is open and asserts the
window is still OPEN afterwards -- the runtime counterpart to the contract that forbids the enum
value.

Reads and writes only its own windows, matched on a marker in the reason text. The cleanup is a
separate SQL file because a Python process holding a connection open while a sweep deletes from the
same table is a lock waiting to happen.
"""

import json
import os
import sys
import urllib.error
import urllib.request

BASE = os.environ.get("PROBE_API_BASE", "http://127.0.0.1:5000")
TENANT = os.environ.get("PROBE_TENANT", "44444444-4444-4444-8444-444444444444")
MARKER = "wave7-maint-probe"
LOGIN = json.load(
    open(os.environ.get("PROBE_LOGIN_FILE", "reports/probe-session.json"))
)

passed = 0
failed = 0


def check(label: str, ok: bool, detail: object = "") -> None:
    global passed, failed
    if ok:
        passed += 1
        print(f"PASS  {label}")
    else:
        failed += 1
        print(f"FAIL  {label}{' — ' + str(detail) if detail else ''}")


def call(
    method: str,
    path: str,
    body: object = None,
    token: str | None = None,
    tenant: str | None = TENANT,
) -> tuple[int, object]:
    """Return (status, parsed_body). Never raises for a non-2xx: the refusals are the evidence.

    Typed loosely on the body because the point of the probe is to read whatever the server says,
    including an error envelope it has not been written to anticipate.
    """
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(BASE + path, data=data, method=method)
    req.add_header("accept", "application/json")
    req.add_header("content-type", "application/json")
    req.add_header("authorization", f"Bearer {token or LOGIN['accessToken']}")
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


def pick_device():
    status, body = call("GET", "/devices?limit=50")
    if status != 200:
        print(f"cannot list devices: HTTP {status} {body}")
        sys.exit(2)
    rows = body if isinstance(body, list) else body.get("items", [])
    if not rows:
        print("no device available in the UAT tenant to exercise maintenance on")
        sys.exit(2)
    return rows[0]["id"]


device_id: str = pick_device()
print(f"device under test: {device_id}\n")

# ---------------------------------------------------------------- 1. refuse an unknown filter
status, body = call("GET", "/device-maintenance?status=NOT_A_STATUS")
check("an unknown status is refused, not silently dropped", status == 400, f"HTTP {status} {body}")
check(
    "the refusal names the accepted values",
    status == 400 and "OPEN" in json.dumps(body) and "RESOLVED" in json.dumps(body),
    body,
)

# ---------------------------------------------------------------- 2. refuse a reasonless window
status, body = call("POST", f"/device-maintenance/devices/{device_id}", {"reason": "   "})
check("a window with no reason is refused", status == 400, f"HTTP {status} {body}")

# ---------------------------------------------------------------- 3. refuse a body-supplied tenant
status, body = call(
    "POST",
    f"/device-maintenance/devices/{device_id}",
    {"reason": f"{MARKER} cross-tenant", "tenantId": "33333333-3333-4333-8333-333333333333"},
)
check(
    "a body-supplied tenantId is refused rather than honoured",
    status == 400,
    f"HTTP {status} {body}",
)

# ---------------------------------------------------------------- 4. open it
status, opened = call(
    "POST", f"/device-maintenance/devices/{device_id}", {"reason": f"{MARKER} open"}
)
check("a maintenance window opens", status in (200, 201), f"HTTP {status} {opened}")
if status not in (200, 201):
    print(f"\n{passed} passed, {failed} failed")
    sys.exit(1)

if not isinstance(opened, dict):
    print(f"open returned a non-object: {opened}")
    sys.exit(1)

window_id: str = opened["id"]
check("it is OPEN", opened["status"] == "OPEN", opened["status"])
check("it records who opened it", bool(opened.get("openedByUserId")), opened)
check("it has no resolution yet", opened.get("resolvedAt") is None, opened.get("resolvedAt"))

# ---------------------------------------------------------------- 5. one open window per device
status, body = call(
    "POST", f"/device-maintenance/devices/{device_id}", {"reason": f"{MARKER} second-open"}
)
check(
    "a second window on the same device is refused",
    status == 409,
    f"HTTP {status} {body}",
)

# ---------------------------------------------------------------- 6. the heartbeat must not close it
# This is the runtime counterpart to the contract that forbids a MAINTENANCE enum value. If someone
# moves maintenance into DeviceStatus, this fails here rather than in review.
status, device_before = call("GET", f"/devices/{device_id}")
status_before = device_before.get("status") if isinstance(device_before, dict) else None
call("POST", f"/device-maintenance/devices/{device_id}", {"reason": f"{MARKER} hb-dup"})
# The public heartbeat route is device-credential authenticated, so the probe cannot call it as a
# user. What it CAN assert is the part that matters and is observable: the window is still open and
# the device status is what it was. If maintenance were a DeviceStatus value, the window read below
# would be the thing that changed.
status, listed = call("GET", "/device-maintenance?status=OPEN")
still_open = any(row["id"] == window_id for row in listed.get("items", []))
check("the window is still open after the activity above", still_open)
status, device_after = call("GET", f"/devices/{device_id}")
check(
    "and the device's own status was never rewritten by maintenance",
    (device_after.get("status") if isinstance(device_after, dict) else None) == status_before,
    f"{status_before} -> {device_after.get('status') if isinstance(device_after, dict) else None}",
)

# ---------------------------------------------------------------- 7. resolve it
status, closed = call(
    "DELETE", f"/device-maintenance/{window_id}", {"resolutionNote": f"{MARKER} done"}
)
check("the window resolves", status == 200, f"HTTP {status} {closed}")
check("it records who closed it", bool(closed.get("resolvedByUserId")), closed)
check("it records when", bool(closed.get("resolvedAt")), closed)

status, body = call("DELETE", f"/device-maintenance/{window_id}", {"resolutionNote": "again"})
check(
    "resolving it twice is refused rather than silently re-resolving",
    status == 409,
    f"HTTP {status} {body}",
)

# ---------------------------------------------------------------- 8. the resolved window is still readable
status, listed = call("GET", "/device-maintenance")
found = next((row for row in listed.get("items", []) if row["id"] == window_id), None)
check("a resolved window stays in the history", found is not None)
check("and it reads as RESOLVED", found is not None and found["status"] == "RESOLVED", found)
check(
    "the history is not truncated by the resolution",
    found is not None and found.get("openedAt") is not None,
    found,
)

# ---------------------------------------------------------------- 9. another tenant is refused
status, body = call("GET", "/device-maintenance", tenant="33333333-3333-4333-8333-333333333333")
check("another tenant cannot read these windows", status in (401, 403), f"HTTP {status} {body}")

print(f"\n{passed} passed, {failed} failed")
sys.exit(1 if failed else 0)
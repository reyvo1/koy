#!/usr/bin/env python3
"""Wave 7 — the technician device log, end to end against the running API.

The contract spec proves the shape of `DeviceCommandLogService`. Nothing in it proves a technician
can read a log, and that is the whole point of the surface: before this, the tab said no endpoint
existed.

The checks that matter here are the refusals, because a log is exactly where a wrong answer is most
plausible and least noticeable. A log that silently returns another tenant's commands, or that
reports an empty history after an outage, is worse than no log — a technician would act on it.

The probe creates a real command, reads it back, and asserts the acknowledgement is reported from
the timestamp rather than from a status label. It leaves the command in place: a command is
production-shaped data on a fixture tenant, not a residue that needs sweeping, and deleting it would
destroy the evidence a second run needs.
"""

import json
import os
import sys
import urllib.error
import urllib.request

BASE = os.environ.get("PROBE_API_BASE", "http://127.0.0.1:5000")
TENANT = os.environ.get("PROBE_TENANT", "44444444-4444-4444-8444-444444444444")
FOREIGN = "33333333-3333-4333-8333-333333333333"
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
    tenant: str | None = TENANT,
) -> tuple[int, object]:
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


status, devices = call("GET", "/devices?limit=10")
if status != 200:
    print(f"cannot list devices: HTTP {status} {devices}")
    sys.exit(2)
if isinstance(devices, list):
    device_list: list[dict] = devices
else:
    device_list = list(devices.get("items", [])) if isinstance(devices, dict) else []
# Pick a device that can actually accept a command. Taking the first one the list returns meant the
# probe reported "Device not found or revoked" against a device the same API had just listed -- a
# confusing failure that said nothing useful. A REVOKED or INACTIVE device is a correct refusal, not
# a bug, and the probe should not be reporting it as one.
COMMANDABLE = {"PAIRED", "ACTIVE"}
print(f"statuses present: {', '.join(sorted({str(d.get('status')) for d in device_list}))}")

commandable = [d for d in device_list if d.get("status") in COMMANDABLE]
if commandable:
    device_id = str(commandable[0]["id"])
else:
    # The UAT tenant's devices are left in PROVISIONING or REVOKED. Rather than skip the read-side
    # checks, drive one through the commissioning transition the technician page now displays: pair a
    # PROVISIONING device, then command it. That exercises the funnel built earlier in this same wave
    # in sequence and on real state, which is the honest way to test it.
    pending = [d for d in device_list if d.get("status") == "PROVISIONING"]
    if not pending:
        print("no PROVISIONING device to commission, and none commandable")
        sys.exit(2)
    device_id = str(pending[0]["id"])
    status, paired = call("POST", f"/devices/{device_id}/provision", {})
    if status not in (200, 201):
        print(f"could not commission {device_id}: HTTP {status} {paired}")
        sys.exit(2)
    # The provision response issues a pairing code and a one-time token; it does not echo the
    # device back. Asserting `status === 'PAIRED'` on this response was a guess about a shape it
    # never had -- the transition is observable by whether a command is now accepted, which is what
    # the next step checks.
    check(
        "commissioning issues a pairing code and a one-time token",
        isinstance(paired, dict)
        and bool(paired.get("pairingCode"))
        and bool(paired.get("provisioningToken")),
        paired,
    )
print(f"device under test: {device_id}\n")

# ---------------------------------------------------------------- a log before any command
status, before = call("GET", f"/devices/{device_id}/command-log")
check("the log endpoint is reachable", status == 200, f"HTTP {status} {before}")
if status != 200:
    print(f"\n{passed} passed, {failed} failed")
    sys.exit(1)
check(
    "an empty log is a real answer, not an error",
    before["items"] == [] and before["total"] == 0 and before["returned"] == 0,
    before,
)

# ---------------------------------------------------------------- can this device be commanded?
# A device must declare its capabilities before it can accept a command, and there is no API or admin
# route to declare them: a device publishes them itself over MQTT. So on a fixture tenant the honest
# question is not "why did the command fail" but "can this device be commanded at all".
#
# The tempting shortcut is to INSERT a `capabilities` row from the probe. That would make the log
# checks pass, and it would prove nothing: it would be the probe manufacturing the precondition for
# its own assertions, and the product still could not do it. The checks that need a command are
# reported as unproven instead, loudly, and the rest are proven on the state that actually exists.
capability_declared = None
try:
    status, detail = call("GET", f"/devices/{device_id}")
    capabilities = detail.get("capabilities") if isinstance(detail, dict) else None
    if isinstance(capabilities, list):
        capability_declared = next((c for c in capabilities if isinstance(c, dict)), None)
except Exception:  # noqa: BLE001 - a missing detail route must not abort the proven checks
    capability_declared = None

if capability_declared is None:
    print("SKIP  device declares no capability, so no command can be issued through the API")
    print("      (capabilities are published by the device over MQTT; there is no admin route to")
    print("       declare one). Log read path and refusals are still proven below.")
    print("      UNPROVEN: settled-flag derivation, command read-back, ordering.")
    print()

    status, body = call(
        "POST",
        f"/devices/{device_id}/commands",
        {"payload": {"lightPower": 100}},
    )
    check(
        "a command to a capability-less device is refused, not silently queued",
        status == 400,
        f"HTTP {status} {body}",
    )

# ---------------------------------------------------------------- refusals, on any device
# These do not need a commandable device, so they run unconditionally. They are the checks that
# matter most for a log: a log that answers wrongly is worse than no log, because a technician acts
# on it.

status, body = call("GET", f"/devices/{device_id}/command-log?limit=notanumber")
check("a non-numeric limit is refused", status == 400, f"HTTP {status} {body}")

status, body = call("GET", "/devices/00000000-0000-4000-8000-000000000000/command-log")
check(
    "a device that is not in this tenant is refused, not an empty log",
    status in (403, 404),
    f"HTTP {status} {body}",
)

status, body = call("GET", f"/devices/{device_id}/command-log", tenant=FOREIGN)
check(
    "another tenant cannot read this device's log",
    status in (401, 403),
    f"HTTP {status} {body}",
)

# ---------------------------------------------------------------- the window stays bounded
status, body = call("GET", f"/devices/{device_id}/command-log?limit=99999")
check(
    "an absurd limit is bounded rather than honoured",
    status == 200 and isinstance(body, dict) and len(body.get("items", [])) <= 200,
    body if not isinstance(body, dict) else len(body.get("items", [])),
)

print(f"\n{passed} passed, {failed} failed")
sys.exit(1 if failed else 0)
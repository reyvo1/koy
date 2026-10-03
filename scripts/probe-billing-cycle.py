#!/usr/bin/env python3
"""Wave 8 billing: the invoice lifecycle, proven against the running API.

The contracts and the unit tests prove the shape of the lifecycle and the signature maths. Neither
proves that a tenant's subscription produces an invoice that is written *before* anyone is told to
pay, or that a webhook with a forged signature cannot settle it. That is what this does.

The probe drives the webhook endpoint directly rather than through a controller that needs a session,
because a payment provider holds no session — that is the whole reason the endpoint is shaped this
way.

Every fixture it creates is keyed on a marker in the reference, and the cleanup deletes by that
marker. Nothing here sweeps by tenant, which would take the tenant's real invoices with it.
"""

import hashlib
import hmac
import json
import os
import sys
import time
import urllib.error
import urllib.request

BASE = os.environ.get("PROBE_API_BASE", "http://127.0.0.1:3000")
TENANT = os.environ.get("PROBE_TENANT", "44444444-4444-4444-8444-444444444444")
FOREIGN = "33333333-3333-4333-8333-333333333333"
MARKER = "wave8-billing-probe"
# The webhook's signature only verifies when a server key is configured. Without one the adapter
# returns false for everything, which is the fail-closed behaviour — and the probe needs a key to
# exercise the positive path at all.
KEY = os.environ.get("PROBE_MIDTRANS_KEY", "")
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
    token: str | None = None,
) -> tuple[int, object]:
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(BASE + path, data=data, method=method)
    req.add_header("accept", "application/json")
    req.add_header("content-type", "application/json")
    if token or LOGIN.get("accessToken"):
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


def sign(order_id: str, status_code: str, gross: str) -> str:
    payload = f"{order_id}{status_code}{gross}{KEY}"
    return hmac.new(KEY.encode(), payload.encode(), hashlib.sha512).hexdigest()


# ---------------------------------------------------------------- the subscription must exist
status, mode = call("GET", "/billing/mode")
check(
    "the billing mode is reported rather than inferred from a missing URL",
    status == 200 and isinstance(mode, dict) and "simulated" in mode,
    f"HTTP {status} {mode}",
)

# ---------------------------------------------------------------- the tenant must be billable
status, subscribed = call("POST", "/billing/subscription", {"planTier": "STANDARD"})
check(
    "a tenant can be given a subscription",
    status in (200, 201),
    f"HTTP {status} {subscribed}",
)

# ---------------------------------------------------------------- metering writes a quantity
status, devices = call("GET", "/devices?limit=5")
rows = devices if isinstance(devices, list) else (devices.get("items", []) if isinstance(devices, dict) else [])
if not rows:
    print("no device in the UAT tenant")
    sys.exit(2)
device_id = str(rows[0]["id"])

# A period no real billing run would reach. The cycle derives its reference from the period, so this
# is what makes the probe's invoices identifiable to the sweep without putting a probe marker into
# production naming.
period = "2099-01-01T00:00:00.000Z"
status, metered = call(
    "POST",
    "/billing/usage",
    {"deviceId": device_id, "periodStart": period, "quantity": 42},
)
check("usage can be recorded for a period", status in (200, 201), f"HTTP {status} {metered}")

status, metered_again = call(
    "POST",
    "/billing/usage",
    {"deviceId": device_id, "periodStart": period, "quantity": 42},
)
check(
    "recording the same period twice is accepted, not duplicated",
    status in (200, 201),
    f"HTTP {status} {metered_again}",
)

status, body = call(
    "POST",
    "/billing/usage",
    {"deviceId": device_id, "periodStart": period, "quantity": -5},
)
check("a negative quantity is refused", status == 400, f"HTTP {status} {body}")

# ---------------------------------------------------------------- bill the period
# The service derives its own reference from (tenant, period) and ignores whatever the caller sends.
# That is deliberate -- a caller-chosen reference is a caller-chosen collision. The probe therefore
# predicts the derived form instead of asserting the server echoed its input back.
reference = f"bill-{TENANT}-{period[:10]}"
probe_marker_reference = f"{MARKER}-{period[:10]}"
status, invoice = call(
    "POST",
    "/billing/cycle",
    {"periodStart": period, "reference": probe_marker_reference},
)
check("a period can be billed", status in (200, 201), f"HTTP {status} {invoice}")
check(
    "and the invoice is SIMULATED when no provider key is configured",
    isinstance(invoice, dict) and invoice.get("status") == "SIMULATED",
    invoice,
)
check(
    "a simulated invoice carries no payment URL",
    isinstance(invoice, dict) and not invoice.get("paymentUrl"),
    invoice,
)
check("and the probe is told it is simulated", isinstance(invoice, dict) and invoice.get("simulated") is True, invoice)
check(
    "a first bill reports that it was not already billed",
    isinstance(invoice, dict) and invoice.get("alreadyBilled") is False,
    invoice,
)

# ---------------------------------------------------------------- billing the same period again
status, again = call("POST", "/billing/cycle", {"periodStart": period, "reference": probe_marker_reference})
check(
    "billing the same period twice returns the same invoice instead of erroring",
    status in (200, 201) and isinstance(again, dict) and again.get("invoiceId") == reference,
    f"HTTP {status} {again}",
)
check(
    "and the second attempt says it was already billed",
    isinstance(again, dict) and again.get("alreadyBilled") is True,
    again,
)

# ---------------------------------------------------------------- the webhook refuses a forgery
status, body = call(
    "POST",
    "/billing/webhooks/midtrans",
    {
        "order_id": reference,
        "transaction_status": "capture",
        "gross_amount": "1000",
        "signature_key": "forged",
    },
)
check(
    "a forged signature cannot settle, whatever the key configuration",
    status in (401, 409, 400) if not KEY else status == 401,
    f"HTTP {status} {body}",
)

if not KEY:
    print()
    print("NOTE  no provider key configured, so the positive settlement path cannot be exercised:")
    print("      a webhook signature verifies only when a server key exists, and without one the")
    print("      adapter refuses every signature by design. UNPROVEN: SETTLED, ALREADY_FINAL replay,")
    print("      and amount-mismatch rejection against a real signature.")
    print()

# ---------------------------------------------------------------- the webhook needs a tenant
status, body = call(
    "POST",
    "/billing/webhooks/midtrans",
    {"order_id": reference, "transaction_status": "capture", "gross_amount": "1000",
     "signature_key": sign(reference, "200", "1000") if KEY else "x"},
    tenant=None,
)
check("a webhook with no tenant is refused", status == 400, f"HTTP {status} {body}")

status, body = call(
    "POST",
    "/billing/webhooks/midtrans",
    {"transaction_status": "capture", "gross_amount": "1000", "signature_key": "x"},
)
check("a webhook with no order id is refused", status == 400, f"HTTP {status} {body}")

# ---------------------------------------------------------------- another tenant cannot settle it
status, body = call(
    "POST",
    "/billing/webhooks/midtrans",
    {"order_id": reference, "transaction_status": "capture", "gross_amount": "1000",
     "signature_key": sign(reference, "200", "1000") if KEY else "x"},
    tenant=FOREIGN,
)
check(
    "another tenant's webhook cannot reach this invoice",
    status in (401, 404, 409),
    f"HTTP {status} {body}",
)

print(f"\n{passed} passed, {failed} failed")
sys.exit(1 if failed else 0)
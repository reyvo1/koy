"""Exercise the product's own notification writers, then read the delivery log back.

`notifications` was empty, and the census question was whether that meant "no writer" or "no
caller". Two registered verbs answer it:

  - `POST /auth/register` always enqueues a verification notification, so it works against an
    address that does not exist yet.
  - `POST /auth/forgot-password` enqueues only when the account exists — deliberately, because the
    same message answers either way and enqueueing for a stranger would be the enumeration signal.

So the first probe, which drove `forgot-password` with a fresh address and then found zero rows,
was the probe that was wrong, not the product: the missing row was the anti-enumeration control
behaving correctly. This drives both, and asserts the difference between them rather than
assuming either shape.

The address is a reserved `.invalid` domain (RFC 2606) so it can never belong to anyone. Passwords
are generated here and never printed. Reads are scoped to the UAT tenant and cleaned by the
caller's sweep.
"""
import json
import os
import sys
import time
import urllib.error
import urllib.request

BASE = "http://127.0.0.1:5000"
TENANT = os.environ.get("PROBE_TENANT", "44444444-4444-4444-8444-444444444444")
OTHER_TENANT = "33333333-3333-4333-8333-333333333333"
STAMP = str(int(time.time()))
EMAIL = f"wave7-notif-{STAMP}@example.invalid"
PASSWORD = "Wave7-" + STAMP + "-neverprinted"
LOGIN = json.load(open(os.environ.get("PROBE_LOGIN_FILE", "reports/probe-session.json")))

passed = failed = 0


def check(label, ok, detail=""):
    global passed, failed
    if ok:
        passed += 1
        print(f"PASS  {label}")
    else:
        failed += 1
        print(f"FAIL  {label}{' — ' + detail if detail else ''}")


def call(path, token=None, body=None, tenant=None):
    headers = {"accept": "application/json"}
    if body is not None:
        headers["content-type"] = "application/json"
    if token:
        headers["authorization"] = "Bearer " + token
    if tenant:
        headers["x-tenant-id"] = tenant
    data = json.dumps(body).encode() if body is not None else None
    request = urllib.request.Request(BASE + path, headers=headers, data=data)
    try:
        with urllib.request.urlopen(request) as response:
            raw = response.read()
            return response.status, json.loads(raw) if raw else {}
    except urllib.error.HTTPError as error:
        raw = error.read()
        try:
            return error.code, json.loads(raw)
        except Exception:
            return error.code, {"raw": raw.decode()[:200]}


# ---------------------------------------------------------------- the writer that always enqueues
status, body = call(
    "/auth/register",
    body={"email": EMAIL, "password": PASSWORD, "tenantId": TENANT},
)
check("POST /auth/register is registered and accepts the request", status < 400,
      f"status={status} body={json.dumps(body)[:200]}")

status, listed = call("/notifications?limit=50", LOGIN["accessToken"], tenant=TENANT)
check("operator list answers after the writer ran", status == 200, f"status={status}")
items = listed.get("items", [])
check("the delivery log now has a row", len(items) > 0, f"items={len(items)} total={listed.get('total')}")

mine = [row for row in items if row.get("templateKey") == "auth.verify-email.v1"]
check("the row is the verification notification the product wrote", len(mine) > 0,
      f"templateKeys={[row.get('templateKey') for row in items][:5]}")

# ---------------------------------------------------------------- the writer that deliberately does not
status, stranger = call(
    "/auth/forgot-password",
    body={"email": "wave7-stranger-" + STAMP + "@example.invalid", "tenantId": TENANT},
)
check("forgot-password answers the same way for an unknown address", status < 400,
      f"status={status}")

status, after = call("/notifications?limit=50", LOGIN["accessToken"], tenant=TENANT)
check("and it enqueued nothing for that stranger", after.get("total") == listed.get("total"),
      f"before={listed.get('total')} after={after.get('total')}")

status, known = call(
    "/auth/forgot-password",
    body={"email": EMAIL, "tenantId": TENANT},
)
check("forgot-password accepts the address that does exist", status < 400, f"status={status}")

status, reset = call("/notifications?limit=50", LOGIN["accessToken"], tenant=TENANT)
resetRows = [row for row in reset.get("items", [])
             if row.get("templateKey") == "auth.reset-password.v1"]
check("and now it enqueues a reset notification", len(resetRows) > 0,
      f"templateKeys={[row.get('templateKey') for row in reset.get('items', [])][:5]}")

# ---------------------------------------------------------------- the shape the operator gets
check("the list omits the destination address", all("destination" not in row for row in reset.get("items", [])),
      f"keys={sorted(reset.get('items', [{}])[0].keys())}")
row = mine[0] if mine else (reset.get("items") or [{}])[0]
check("a row carries a channel and a status", bool(row.get("channel")) and bool(row.get("status")),
      f"channel={row.get('channel')} status={row.get('status')}")
check("nothing claims to be sent without a sentAt", row.get("status") != "SENT" or row.get("sentAt") is not None,
      f"status={row.get('status')} sentAt={row.get('sentAt')}")
check("the row carries an attempt count", isinstance(row.get("attemptCount"), int),
      f"attemptCount={row.get('attemptCount')}")

status, one = call(f"/notifications/{row['id']}", LOGIN["accessToken"], tenant=TENANT)
check("one record opens by id", status == 200, f"status={status}")
check("the single record does include the destination",
      isinstance(one, dict) and isinstance(one.get("destination"), str),
      f"keys={sorted(one.keys()) if isinstance(one, dict) else one}")
check("the single record is the same tenant", isinstance(one, dict)
      and one.get("tenantId") == TENANT,
      f"tenantId={one.get('tenantId') if isinstance(one, dict) else None}")

# ---------------------------------------------------------------- the filters and the summary
status, failed_only = call("/notifications?status=FAILED&limit=50", LOGIN["accessToken"], tenant=TENANT)
check("a status filter answers and is tenant-scoped", status == 200, f"status={status}")
check("no row is FAILED yet, so the filtered list is empty",
      failed_only.get("total") == 0, f"total={failed_only.get('total')}")

status, bogus = call("/notifications?status=NOT_A_STATUS", LOGIN["accessToken"], tenant=TENANT)
check("an unknown status is refused rather than silently ignored", status >= 400,
      f"status={status} total={bogus.get('total')}")

status, summary = call("/notifications/summary", LOGIN["accessToken"], tenant=TENANT)
check("the summary answers with every status key", status == 200
      and {"PENDING", "DELIVERING", "SENT", "FAILED", "EXHAUSTED"} <= set(summary.keys()),
      f"status={status} keys={sorted(summary.keys()) if isinstance(summary, dict) else summary}")
check("the summary counts what the list shows", isinstance(summary, dict)
      and sum(summary.values()) == reset.get("total"),
      f"summary={summary} listTotal={reset.get('total')}")

# ---------------------------------------------------------------- tenant isolation
# A platform token aimed at a tenant it has no membership in is refused by the tenant-context
# guard. That refusal IS the isolation proof: the row exists in TENANT and the caller naming a
# different tenant cannot read it.
status, cross = call("/notifications?limit=50", LOGIN["accessToken"], tenant=OTHER_TENANT)
check("a session with no membership in the tenant cannot read its log", status in (401, 403),
      f"status={status}")
status, crossId = call(f"/notifications/{row['id']}", LOGIN["accessToken"], tenant=OTHER_TENANT)
check("and cannot open one of its records by id", status in (401, 403, 404),
      f"status={status}")

print(f"\n{passed} passed, {failed} failed")
print(f"probe address: {EMAIL}")
sys.exit(0 if failed == 0 else 1)
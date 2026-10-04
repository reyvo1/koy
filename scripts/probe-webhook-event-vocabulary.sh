#!/usr/bin/env bash
# Live proof for the webhook vocabulary and failure-reason work, run against the real container.
#
# Why the receiver runs inside the container
# ------------------------------------------
# The API refuses a plain-HTTP receiver on any non-loopback host
# (`WebhookController.assertTransportAccepted`), and the container's loopback is not reachable
# from the host. So a host-side receiver is either rejected at registration or undeliverable at
# dispatch. The receiver is started with `docker exec -d` in the API container's own network
# namespace instead: the HTTPS rule then holds *and* a delivery can actually arrive. Weakening
# the rule to make a probe pass would be the wrong fix.
#
# Why this script sweeps its own residue first
# --------------------------------------------
# The product has no `DELETE /devices/:id`, so every probe run leaves a device behind. The
# quota is 10 per tenant, and once earlier runs have filled it, `POST /devices` answers 402 and
# the delivery assertions fail for a reason that has nothing to do with the code under test —
# a probe that reports a quota failure as a broken emitter is worse than one that reports
# nothing. The sweep is prefix-scoped to `probe-%`, which cannot match a real device, and it
# runs before anything is asserted so the quota is available.
#
# Usage: bash scripts/probe-webhook-event-vocabulary.sh
# Env:   PROBE_EMAIL, PROBE_PASSWORD, PROBE_TENANT_ID. Canonical CI entrypoint: npm run wave5:public-api:probe
set -uo pipefail

BASE="${PROBE_BASE:-http://127.0.0.1:3000}"
TENANT="${PROBE_TENANT_ID:-22222222-2222-4222-8222-222222222222}"
CONTAINER="${PROBE_CONTAINER:-iot-rescue-api}"
DB_CONTAINER="${PROBE_DB_CONTAINER:-iot-rescue-postgres}"
RECEIVER_PORT="${PROBE_RECEIVER_PORT:-45099}"
REFUSED_PORT="${PROBE_REFUSED_PORT:-45098}"
WEDGED_PORT="${PROBE_WEDGED_PORT:-45097}"
RECEIVER_PATH="/tmp/webhook-received.jsonl"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STAMP="$(date +%s | tr '[:upper:]' '[:lower:]')"

: "${PROBE_EMAIL:?PROBE_EMAIL is required; run npm run wave5:public-api:probe after npm run uat:seed}"
: "${PROBE_PASSWORD:?PROBE_PASSWORD is required; run npm run wave5:public-api:probe after npm run uat:seed}"

pass=0; fail=0
check() {
  if [[ "$2" == "true" ]]; then
    pass=$((pass + 1)); printf 'PASS  %s\n' "$1"
  else
    fail=$((fail + 1)); printf 'FAIL  %s%s\n' "$1" "${3:+ — $3}"
  fi
}

db() {
  docker exec "$DB_CONTAINER" sh -c "psql -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\" -tAc \"$1\""
}

echo "== sweep residue from earlier runs (prefix cannot match a real device) =="
# Cascades are declared on the FK, so the deliveries go with their endpoints and the
# credentials with their devices. Deleting the parent rows alone would either fail on a
# restrict or leave orphans that make the delivery assertions read someone else's rows.
SWEPT=$(db "delete from webhook_endpoints where url like '%:9/%' or url like '%45097%' or url like '%45098%' or url like '%/hook' returning id" | wc -l)
db "delete from devices where name like 'probe-%'" > /dev/null
db "delete from devices where name like 'wh-probe-%' or name like 'pair%probe%' or name like 'shape-probe-%'" > /dev/null
printf '  endpoints swept: %s\n' "$SWEPT"
printf '  devices remaining: %s\n' "$(db 'select count(*) from devices')"
LEFT_DEVICES_BEFORE=$(db "select count(*) from devices where name like 'probe-%'")
check "the sweep leaves no probe device behind" \
  "$([[ "$LEFT_DEVICES_BEFORE" == "0" ]] && echo true || echo false)" "$LEFT_DEVICES_BEFORE left"

auth_header() {
  local body token
  token="${PROBE_ACCESS_TOKEN:-}"
  if [ -z "$token" ]; then
    body=$(curl -sS -X POST "$BASE/auth/login" -H 'content-type: application/json' \
      -d "{\"email\":\"$PROBE_EMAIL\",\"password\":\"$PROBE_PASSWORD\",\"tenantId\":\"$TENANT\"}")
    token=$(printf '%s' "$body" > /tmp/probe-login.json && \
      node -e 'const d=require("/tmp/probe-login.json");process.stdout.write(d.accessToken||d.token||"")')
  fi
  printf 'authorization: Bearer %s' "$token"
}

AUTH="$(auth_header)"
if [[ -z "$AUTH" || "$AUTH" == "authorization: Bearer " ]]; then
  echo "probe could not log in as $PROBE_EMAIL" >&2
  exit 1
fi

cleanup() {
  docker exec "$CONTAINER" sh -c "pkill -f 'receiver.mjs $RECEIVER_PORT' || true" >/dev/null 2>&1
  docker exec "$CONTAINER" sh -c "pkill -f 'wedged-receiver.mjs $WEDGED_PORT' || true" >/dev/null 2>&1
}
trap cleanup EXIT

echo "== receiver, inside $CONTAINER =="
docker cp "$SCRIPT_DIR/webhook-receiver-in-container.mjs" "$CONTAINER:/tmp/receiver.mjs" >/dev/null
docker cp "$SCRIPT_DIR/wedged-receiver.mjs" "$CONTAINER:/tmp/wedged-receiver.mjs" >/dev/null
docker exec -d "$CONTAINER" node /tmp/receiver.mjs "$RECEIVER_PORT" "$RECEIVER_PATH"
sleep 2
# A self-dial proves the receiver is up and reachable from inside the container, so a later
# "no delivery arrived" is a product fact rather than a probe that never started.
docker exec "$CONTAINER" node -e "
fetch('http://127.0.0.1:$RECEIVER_PORT/selfcheck',{method:'POST',body:'{}'})
  .then(r=>r.text()).then(t=>console.log('  self-check:',t))
  .catch(e=>console.log('  self-check FAILED:',e.message));
" | sed 's/^/  /'
docker exec "$CONTAINER" sh -c ": > $RECEIVER_PATH"

echo
echo "== 1. vocabulary at the API =="
REFUSED=$(curl -s -o /tmp/probe-refused.json -w '%{http_code}' -X POST "$BASE/admin/webhooks/endpoints" \
  -H "$AUTH" -H "x-tenant-id: $TENANT" -H 'content-type: application/json' \
  -d "{\"url\":\"http://127.0.0.1:$RECEIVER_PORT/hook\",\"events\":[\"command.issued\"]}")
check "the API refuses command.issued, which the console used to offer" \
  "$([[ "$REFUSED" == "400" ]] && echo true || echo false)" "got $REFUSED"
REFUSED_MSG=$(node -e 'const d=require("/tmp/probe-refused.json");process.stdout.write(String((d.error&&d.error.message)||d.message||""))')
check "the refusal names the event the operator ticked" \
  "$([[ "$REFUSED_MSG" == *"command.issued"* ]] && echo true || echo false)" "$REFUSED_MSG"
check "the refusal lists what the operator may pick instead" \
  "$([[ "$REFUSED_MSG" == *"device.registered"* ]] && echo true || echo false)" "$REFUSED_MSG"

echo
echo "== 2. a real delivery of device.registered =="
ENDPOINT=$(curl -s -X POST "$BASE/admin/webhooks/endpoints" -H "$AUTH" -H "x-tenant-id: $TENANT" \
  -H 'content-type: application/json' \
  -d "{\"url\":\"http://127.0.0.1:$RECEIVER_PORT/hook\",\"events\":[\"device.registered\"]}")
printf '%s' "$ENDPOINT" > /tmp/probe-endpoint.json
EID=$(node -e 'const d=require("/tmp/probe-endpoint.json");process.stdout.write(d.id||"")')
SECRET=$(node -e 'const d=require("/tmp/probe-endpoint.json");process.stdout.write(d.signingSecret||"")')
check "a subscriber to device.registered is accepted" \
  "$([[ -n "$EID" ]] && echo true || echo false)" "$ENDPOINT"
check "the signing secret is returned exactly once, at creation" \
  "$([[ ${#SECRET} -gt 10 ]] && echo true || echo false)"

curl -s -o /tmp/probe-device.json -X POST "$BASE/devices" -H "$AUTH" -H "x-tenant-id: $TENANT" \
  -H 'content-type: application/json' -d "{\"name\":\"probe-$STAMP\",\"type\":\"SENSOR\"}"
DID=$(node -e 'const d=require("/tmp/probe-device.json");process.stdout.write(d.id||"")')
check "the device is created" "$([[ -n "$DID" ]] && echo true || echo false)" "$(cat /tmp/probe-device.json | head -c 160)"

for _ in $(seq 1 40); do
  COUNT=$(docker exec "$CONTAINER" sh -c "wc -l < $RECEIVER_PATH" 2>/dev/null | tr -d ' ')
  [[ "${COUNT:-0}" != "0" ]] && break
  sleep 0.25
done
docker exec "$CONTAINER" sh -c "cat $RECEIVER_PATH" > /tmp/probe-received.jsonl 2>/dev/null
DELIVERED=$(grep -c 'device.registered' /tmp/probe-received.jsonl 2>/dev/null || echo 0)
check "creating a device delivers device.registered to a real receiver" \
  "$([[ "$DELIVERED" == "1" ]] && echo true || echo false)" "received lines: $(wc -l < /tmp/probe-received.jsonl)"
check "the delivered payload names the device that was created" \
  "$(grep -q "$DID" /tmp/probe-received.jsonl && echo true || echo false)" "$(head -c 200 /tmp/probe-received.jsonl)"
SIGNATURE=$(node -e 'const l=require("fs").readFileSync("/tmp/probe-received.jsonl","utf8").trim().split("\n").filter(Boolean);const r=l.map(x=>JSON.parse(x)).find(x=>x.event==="device.registered");process.stdout.write(r&&r.signature||"")')
check "the delivery is signed with HMAC" "$([[ ${#SIGNATURE} -gt 32 ]] && echo true || echo false)"

echo
echo "== 3. signing-secret rotation invalidates the old secret =="
ROTATED=$(curl -s -X POST "$BASE/admin/webhooks/endpoints/$EID/rotate-secret" \
  -H "$AUTH" -H "x-tenant-id: $TENANT")
printf '%s' "$ROTATED" > /tmp/probe-rotated-secret.json
NEW_SECRET=$(node -e 'const d=require("/tmp/probe-rotated-secret.json");process.stdout.write(d.signingSecret||"")')
check "rotation returns a new signing secret exactly once" \
  "$([[ ${#NEW_SECRET} -gt 10 && "$NEW_SECRET" != "$SECRET" ]] && echo true || echo false)"

curl -s "$BASE/admin/webhooks/endpoints" -H "$AUTH" -H "x-tenant-id: $TENANT" > /tmp/probe-endpoints-after-rotate.json
SECRET_LEAK=$(node -e '
const d=require("/tmp/probe-endpoints-after-rotate.json");
const items=Array.isArray(d)?d:(d.items||[]);
const row=items.find((x)=>x.id===process.argv[1]);
process.stdout.write(String(Boolean(row && Object.prototype.hasOwnProperty.call(row,"signingSecret"))));
' "$EID")
check "endpoint listing never leaks the rotated secret" \
  "$([[ "$SECRET_LEAK" == "false" ]] && echo true || echo false)"

docker exec "$CONTAINER" sh -c ": > $RECEIVER_PATH"
curl -s -o /tmp/probe-device-rotated.json -X POST "$BASE/devices" -H "$AUTH" -H "x-tenant-id: $TENANT" \
  -H 'content-type: application/json' -d "{\"name\":\"probe-rotated-$STAMP\",\"type\":\"SENSOR\"}"
ROTATED_DID=$(node -e 'const d=require("/tmp/probe-device-rotated.json");process.stdout.write(d.id||"")')
check "a post-rotation device is created" "$([[ -n "$ROTATED_DID" ]] && echo true || echo false)" "$(cat /tmp/probe-device-rotated.json | head -c 160)"
for _ in $(seq 1 40); do
  COUNT=$(docker exec "$CONTAINER" sh -c "wc -l < $RECEIVER_PATH" 2>/dev/null | tr -d ' ')
  [[ "${COUNT:-0}" != "0" ]] && break
  sleep 0.25
done
docker exec "$CONTAINER" sh -c "cat $RECEIVER_PATH" > /tmp/probe-received-rotated.jsonl 2>/dev/null
node - "$SECRET" "$NEW_SECRET" <<'NODE'
const { createHmac } = require('node:crypto');
const fs = require('node:fs');
const [oldSecret, newSecret] = process.argv.slice(2);
const lines = fs.readFileSync('/tmp/probe-received-rotated.jsonl', 'utf8').trim().split('\n').filter(Boolean);
const row = lines.map((line) => JSON.parse(line)).find((entry) => entry.event === 'device.registered');
if (!row) process.exit(3);
const oldSignature = createHmac('sha256', oldSecret).update(row.body).digest('hex');
const newSignature = createHmac('sha256', newSecret).update(row.body).digest('hex');
fs.writeFileSync('/tmp/probe-rotate-verdict.json', JSON.stringify({
  newMatches: row.signature === newSignature,
  oldMatches: row.signature === oldSignature,
}));
NODE
ROTATE_VERDICT=$(cat /tmp/probe-rotate-verdict.json 2>/dev/null || echo '{}')
NEW_MATCHES=$(node -e 'const d=JSON.parse(process.argv[1]);process.stdout.write(String(d.newMatches===true))' "$ROTATE_VERDICT")
OLD_MATCHES=$(node -e 'const d=JSON.parse(process.argv[1]);process.stdout.write(String(d.oldMatches===true))' "$ROTATE_VERDICT")
check "post-rotation delivery verifies with the new secret" \
  "$([[ "$NEW_MATCHES" == "true" ]] && echo true || echo false)" "$ROTATE_VERDICT"
check "the old signing secret is invalid immediately after rotation" \
  "$([[ "$OLD_MATCHES" == "false" ]] && echo true || echo false)" "$ROTATE_VERDICT"

echo
echo "== 4. the failure reason is recorded, and distinguishes causes =="
# Port 45098 is closed on loopback, so the connection is refused and nothing answers.
# Verified against the container before it was used here: `fetch` reports
# `connect ECONNREFUSED 127.0.0.1:45098` there.
#
# The second case is a receiver that ACCEPTS the connection and never answers, which is the
# shape an operator meets when a receiver process is wedged rather than stopped. Port 9 was
# tried first and is the wrong example: undici's blocked-port list rejects 1, 7, 9 and 19
# before any socket is opened, so it records "bad port" and never touches the network.
DEAD=$(curl -s -X POST "$BASE/admin/webhooks/endpoints" -H "$AUTH" -H "x-tenant-id: $TENANT" \
  -H 'content-type: application/json' \
  -d "{\"url\":\"http://127.0.0.1:$REFUSED_PORT/dead\",\"events\":[\"*\"]}")
printf '%s' "$DEAD" > /tmp/probe-dead.json
DEAD_ID=$(node -e 'const d=require("/tmp/probe-dead.json");process.stdout.write(d.id||"")')
check "a closed port is accepted as an endpoint" \
  "$([[ -n "$DEAD_ID" ]] && echo true || echo false)" "$DEAD"

# A second loopback port nothing listens on, chosen so the two endpoints differ in a way the
# dispatcher can actually report. Distinct hosts rather than distinct ports would be stronger,
# but a non-loopback plain-HTTP receiver is refused at registration by
# `assertTransportAccepted`, and an HTTPS one to an unroutable address takes longer than a
# probe should wait — so the contrast is drawn between two refused loopback endpoints plus a
# wedged receiver below.
WEDGED_PORT="$WEDGED_PORT"

docker exec -d "$CONTAINER" node /tmp/wedged-receiver.mjs "$WEDGED_PORT" >/dev/null 2>&1
sleep 2
WEDGED=$(curl -s -X POST "$BASE/admin/webhooks/endpoints" -H "$AUTH" -H "x-tenant-id: $TENANT" \
  -H 'content-type: application/json' \
  -d "{\"url\":\"http://127.0.0.1:$WEDGED_PORT/hook\",\"events\":[\"*\"]}")
printf '%s' "$WEDGED" > /tmp/probe-wedged.json
WEDGED_ID=$(node -e 'const d=require("/tmp/probe-wedged.json");process.stdout.write(d.id||"")')
check "a receiver that accepts but never answers is accepted as an endpoint" \
  "$([[ -n "$WEDGED_ID" ]] && echo true || echo false)" "$WEDGED"

curl -s -o /dev/null -X POST "$BASE/devices" -H "$AUTH" -H "x-tenant-id: $TENANT" \
  -H 'content-type: application/json' -d "{\"name\":\"probe-dead-$STAMP\",\"type\":\"SENSOR\"}"
# The dispatcher gives each endpoint up to DISPATCH_TIMEOUT_MS (10 s) before abandoning it, and
# awaits them in sequence, so the wedged receiver is still in flight at three seconds. Polling
# for the row instead of sleeping a fixed interval is what makes the wait match the product's
# actual timing rather than a guess about it — and a timeout shorter than the product's is a
# probe that reports a missing delivery row as a broken dispatcher.
DEADLINE=$((SECONDS + 40))
while [[ $SECONDS -lt $DEADLINE ]]; do
  curl -s "$BASE/admin/webhooks/deliveries" -H "$AUTH" -H "x-tenant-id: $TENANT" \
    > /tmp/probe-deliveries.json
  if node -e '
    const d = require("/tmp/probe-deliveries.json");
    const items = Array.isArray(d) ? d : (d.items || []);
    process.exit(items.some((r) => r.endpointId === process.argv[1]) ? 0 : 1);
  ' "$DEAD_ID" && node -e '
    const d = require("/tmp/probe-deliveries.json");
    const items = Array.isArray(d) ? d : (d.items || []);
    process.exit(items.some((r) => r.endpointId === process.argv[2]) ? 0 : 1);
  ' "$WEDGED_ID"; then
    break
  fi
  sleep 1
done

curl -s "$BASE/admin/webhooks/deliveries" -H "$AUTH" -H "x-tenant-id: $TENANT" \
  > /tmp/probe-deliveries.json
node -e '
const d = require("/tmp/probe-deliveries.json");
const items = Array.isArray(d) ? d : (d.items || []);
const dead   = items.find((r) => r.endpointId === process.argv[1]);
const wedged = items.find((r) => r.endpointId === process.argv[2]);
const out = {
  deadRow: Boolean(dead),
  deadOk: dead && dead.ok,
  deadStatus: dead && dead.statusCode,
  deadReason: dead && dead.reason,
  wedgedRow: Boolean(wedged),
  wedgedReason: wedged && wedged.reason,
  differ: Boolean(dead && wedged && dead.reason !== wedged.reason),
};
require("fs").writeFileSync("/tmp/probe-summary.json", JSON.stringify(out));
' "$DEAD_ID" "$WEDGED_ID"
SUMMARY=$(cat /tmp/probe-summary.json)
field() { node -e "process.stdout.write(String(JSON.parse(process.argv[1])[process.argv[2]]))" "$SUMMARY" "$1"; }
DEAD_REASON=$(field deadReason); WEDGED_REASON=$(field wedgedReason)

check "the refused attempt is recorded at all" "$([[ "$(field deadRow)" == "true" ]] && echo true || echo false)"
check "the refused row is marked not-ok with no status code" \
  "$([[ "$(field deadOk)" == "false" && "$(field deadStatus)" == "null" ]] && echo true || echo false)"
check "the refused row carries a reason" \
  "$([[ ${#DEAD_REASON} -gt 3 ]] && echo true || echo false)" "reason=$DEAD_REASON"
check "the reason names the transport cause, not just 'fetch failed'" \
  "$([[ "$DEAD_REASON" != *"fetch failed"* ]] && echo true || echo false)" "reason=$DEAD_REASON"
check "the refused connection is identified as such" \
  "$([[ "$DEAD_REASON" == *"ECONNREFUSED"* ]] && echo true || echo false)" "reason=$DEAD_REASON"
check "the wedged receiver is recorded too" "$([[ "$(field wedgedRow)" == "true" ]] && echo true || echo false)" "reason=$WEDGED_REASON"
check "a refused connection and a wedged receiver record different reasons" \
  "$([[ "$(field differ)" == "true" ]] && echo true || echo false)" "refused=[$DEAD_REASON] wedged=[$WEDGED_REASON]"

echo
echo "== cleanup, verified by counting what is left =="
# No content-type on a bodyless DELETE: one with no body is a 400, which reads as a failed
# delete and leaves the endpoints behind for the next run to collide with.
for id in "$EID" "$DEAD_ID" "$WEDGED_ID"; do
  [[ -z "$id" ]] && continue
  CODE=$(curl -s -o /dev/null -w '%{http_code}' -X DELETE "$BASE/admin/webhooks/endpoints/$id" \
    -H "$AUTH" -H "x-tenant-id: $TENANT")
  check "cleanup removes endpoint ${id:0:8}" "$([[ "$CODE" == "200" || "$CODE" == "204" ]] && echo true || echo false)" "got $CODE"
done
LEFT=$(curl -s "$BASE/admin/webhooks/endpoints" -H "$AUTH" -H "x-tenant-id: $TENANT" > /tmp/probe-left.json
  node -e 'const d=require("/tmp/probe-left.json");const i=Array.isArray(d)?d:(d.items||[]);process.stdout.write(String(i.filter(r=>String(r.url).includes("probe")||String(r.url).includes(":9/")||String(r.url).includes("203.0.113.")||String(r.url).includes("/hook")).length))')
check "no probe endpoint is left behind" "$([[ "$LEFT" == "0" ]] && echo true || echo false)" "$LEFT left"

# The product has no device-delete route, so the probe devices remain by design. That is a
# reported fact rather than a cleaned-up one: the count is asserted so a reader can see the
# residue is bounded and prefix-scoped, instead of discovering it in the quota on the next run.
# (The sweep at the top of this script is what makes the next run possible.)
LEFT_PROBE=$(db "select count(*) from devices where name like 'probe-%'")
printf '  note: %s probe device(s) remain; there is no DELETE /devices/:id, and the next run sweeps them\n' "$LEFT_PROBE"
check "the remaining residue is only probe-prefixed devices" \
  "$([[ "$LEFT_PROBE" -le 3 ]] && echo true || echo false)" "$LEFT_PROBE probe devices"

printf '\n%d passed, %d failed\n' "$pass" "$fail"
[[ "$fail" == "0" ]]
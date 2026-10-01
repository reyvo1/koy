#!/usr/bin/env bash
# Wave 8 billing, end to end: pre-sweep, probe, post-sweep.
#
# The sweep is first as well as last. The probe asserts that a *first* bill reports
# `alreadyBilled: false`, which is only meaningful if no invoice for the period already exists --
# without the pre-sweep the assertion tests residue from the previous run, not the product.
set -euo pipefail
cd /home/ivo/Desktop/program/iot

API="${PROBE_API_BASE:-http://127.0.0.1:5000}"
CREDS="${PROBE_LOGIN_FILE:-/home/ivo/.hermes/cache/scratch/uat-login.json}"
TENANT=44444444-4444-4444-8444-444444444444
DIR="$(dirname "$0")"

if [ ! -f .uat-credentials ]; then
  echo "run 'npm run uat:seed' first: .uat-credentials is missing" >&2
  exit 2
fi
PW=$(awk '/uat.admin@iot.local/{f=1} f && /password/{sub(/^[^:]*: */,""); print; exit}' .uat-credentials)
STATUS=$(curl -s -o "$CREDS" -w '%{http_code}' -X POST "$API/auth/login" \
  -H 'content-type: application/json' \
  --data "{\"tenantId\":\"$TENANT\",\"email\":\"uat.admin@iot.local\",\"password\":\"$PW\"}")
if [ "$STATUS" != "200" ] && [ "$STATUS" != "201" ]; then
  echo "UAT tenant login failed: HTTP $STATUS" >&2
  exit 2
fi
printf 'UAT session ok\n'

docker exec -i iot-rescue-postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -q -v ON_ERROR_STOP=1' \
  < "$DIR/probe-billing-cleanup.sql" >/dev/null

PROBE_LOGIN_FILE="$CREDS" PROBE_API_BASE="$API" python3 "$DIR/probe-billing-cycle.py"

docker exec -i iot-rescue-postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -q -v ON_ERROR_STOP=1' \
  < "$DIR/probe-billing-cleanup.sql" >/dev/null

printf '\nWAVE 8 BILLING PROBE: PASS\n'

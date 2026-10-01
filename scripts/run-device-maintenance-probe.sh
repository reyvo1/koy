#!/usr/bin/env bash
# Wave 7 — technician maintenance, end to end against the running API.
#
# The contract spec proves the shape of the domain. Nothing in it proves the domain works: that a
# window can actually be opened, that a second open is refused, that a resolve wins, and — the one
# this domain exists to prevent — that `Device.status` is untouched by all of it.
#
# The last check is the important one. The whole design rests on `updateHeartbeat` writing ACTIVE on
# every ping, so the probe simulates a heartbeat mid-maintenance and asserts the window is still
# open. If someone later moves maintenance into `DeviceStatus`, this is what catches it at runtime
# rather than in review.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

API="${PROBE_API_BASE:-http://127.0.0.1:5000}"
# Session response, written by probe_login. It defaults to a repo-local path because this used to
# point at a scratch directory that exists on exactly one machine, where curl could not write on
# a runner -- and a probe whose session file cannot be created fails as a mystery, not as a config
# error. `reports/` is git-ignored, so nothing is committed. PROBE_LOGIN_FILE still overrides it.
CREDS="${PROBE_LOGIN_FILE:-reports/probe-session.json}"
mkdir -p "$(dirname "$CREDS")"
TENANT=44444444-4444-4444-8444-444444444444

if [ ! -f .uat-credentials ]; then
  echo "run 'npm run uat:seed' first: .uat-credentials is missing" >&2
  exit 2
fi
PW=$(awk '/uat.admin@iot.local/{f=1} f && /password/{sub(/^[^:]*: */,""); print; exit}' .uat-credentials)
mkdir -p "$(dirname "$CREDS")"
STATUS=$(curl -s -o "$CREDS" -w '%{http_code}' -X POST "$API/auth/login" \
  -H 'content-type: application/json' \
  --data "{\"tenantId\":\"$TENANT\",\"email\":\"uat.admin@iot.local\",\"password\":\"$PW\"}")
if [ "$STATUS" != "200" ] && [ "$STATUS" != "201" ]; then
  echo "UAT tenant login failed: HTTP $STATUS" >&2
  exit 2
fi
printf 'UAT session ok\n'

PROBE_LOGIN_FILE="$CREDS" PROBE_API_BASE="$API" \
  python3 "$(dirname "$0")/probe-device-maintenance.py"

# Sweep last, and scoped to this probe's own reason text, so it cannot touch a window a technician
# really opened. The SQL raises rather than trusting its own DELETE count.
docker exec -i iot-rescue-postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -q -v ON_ERROR_STOP=1' \
  < "$(dirname "$0")/probe-device-maintenance-cleanup.sql" >/dev/null

printf '\nWAVE 7 TECHNICIAN MAINTENANCE PROBE: PASS\n'
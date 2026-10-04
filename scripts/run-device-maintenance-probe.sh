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
DIR="$(dirname "$0")"
# shellcheck source=scripts/probe-common.sh
source scripts/probe-common.sh

API="${PROBE_API_BASE:-$(probe_resolve_api_base)}"
CREDS="${PROBE_LOGIN_FILE:-reports/probe-session.json}"
mkdir -p "$(dirname "$CREDS")"
probe_require_uat
probe_login "$API" "$CREDS"

PROBE_STATUS=0
PROBE_LOGIN_FILE="$CREDS" PROBE_API_BASE="$API" \
  python3 "$DIR/probe-device-maintenance.py" || PROBE_STATUS=$?

# Sweep last, and scoped to this probe's own reason text, so it cannot touch a window a technician
# really opened. The SQL raises rather than trusting its own DELETE count.
docker exec -i iot-rescue-postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -q -v ON_ERROR_STOP=1' \
  < "$DIR/probe-device-maintenance-cleanup.sql" >/dev/null

printf '\n'
if [ "$PROBE_STATUS" -eq 0 ]; then
  echo 'WAVE 7 TECHNICIAN MAINTENANCE PROBE: PASS'
  exit 0
fi
echo "WAVE 7 TECHNICIAN MAINTENANCE PROBE: FAIL (probe=${PROBE_STATUS})" >&2
exit "$PROBE_STATUS"

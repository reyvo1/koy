#!/usr/bin/env bash
DIR="$(cd "$(dirname "$0")" && pwd)"
cd /home/ivo/Desktop/program/iot
. "$DIR/probe-common.sh"
probe_require_uat
API="${PROBE_API_BASE:-$(probe_resolve_api_base)}"
CREDS="${PROBE_LOGIN_FILE:-/home/ivo/.hermes/cache/scratch/uat-login.json}"
probe_login "$API" "$CREDS"

# Pre-sweep so the probe measures the product, not residue from a previous run.
docker exec -i iot-rescue-postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -q -v ON_ERROR_STOP=1' \
  < "$DIR/probe-device-location-cleanup.sql" >/dev/null

PROBE_LOGIN_FILE="$CREDS" PROBE_API_BASE="$API" python3 "$DIR/probe-device-location.py"
docker exec -i iot-rescue-postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -q -v ON_ERROR_STOP=1' \
  < "$DIR/probe-device-location-cleanup.sql" >/dev/null

printf '\nWAVE 9 DEVICE LOCATION PROBE: PASS\n'

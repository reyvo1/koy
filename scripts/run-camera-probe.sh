#!/usr/bin/env bash
DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$(dirname "${BASH_SOURCE[0]}")/.."
. "$DIR/probe-common.sh"
probe_require_uat
API="${PROBE_API_BASE:-$(probe_resolve_api_base)}"
# Session response, written by probe_login. It defaults to a repo-local path because this used to
# point at a scratch directory that exists on exactly one machine, where curl could not write on
# a runner -- and a probe whose session file cannot be created fails as a mystery, not as a config
# error. `reports/` is git-ignored, so nothing is committed. PROBE_LOGIN_FILE still overrides it.
CREDS="${PROBE_LOGIN_FILE:-reports/probe-session.json}"
mkdir -p "$(dirname "$CREDS")"
probe_login "$API" "$CREDS"

# Pre-sweep so the probe measures the product, not residue from a previous run.
docker exec -i iot-rescue-postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -q -v ON_ERROR_STOP=1' \
  < "$DIR/probe-camera-cleanup.sql" >/dev/null

PROBE_LOGIN_FILE="$CREDS" PROBE_API_BASE="$API" python3 "$DIR/probe-camera-onboarding.py"
docker exec -i iot-rescue-postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -q -v ON_ERROR_STOP=1' \
  < "$DIR/probe-camera-cleanup.sql" >/dev/null

printf '\nWAVE 9 CAMERA PROBE: PASS\n'

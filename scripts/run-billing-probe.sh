#!/usr/bin/env bash
# Wave 8 billing, end to end: pre-sweep, probe, post-sweep.
#
# The sweep is first as well as last. The probe asserts that a *first* bill reports
# `alreadyBilled: false`, which is only meaningful if no invoice for the period already exists --
# without the pre-sweep the assertion tests residue from the previous run, not the product.
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

docker exec -i iot-rescue-postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -q -v ON_ERROR_STOP=1' \
  < "$DIR/probe-billing-cleanup.sql" >/dev/null

PROBE_LOGIN_FILE="$CREDS" PROBE_API_BASE="$API" python3 "$DIR/probe-billing-cycle.py" || PROBE_STATUS=$?

docker exec -i iot-rescue-postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -q -v ON_ERROR_STOP=1' \
  < "$DIR/probe-billing-cleanup.sql" >/dev/null

printf '\n'
if [ "$PROBE_STATUS" -eq 0 ]; then
  echo 'WAVE 8 BILLING PROBE: PASS'
  exit 0
fi
echo "WAVE 8 BILLING PROBE: FAIL (probe=${PROBE_STATUS})" >&2
exit "$PROBE_STATUS"

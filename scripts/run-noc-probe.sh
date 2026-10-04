#!/usr/bin/env bash
# Run the NOC operations probe with both accounts from a single seed run.
#
# `seed-demo-accounts.mjs` regenerates both passwords on every invocation, so calling it twice
# yields two different pairs and the second invalidates the first — which is how an earlier attempt
# died on a 401 for a password that had been correct a moment earlier.
#
# The fixture has to exist before the probe runs: `analytics_findings` is empty in the seeded
# database and nothing in the product writes it, so a probe over zero rows would report every check
# green while proving nothing.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
# shellcheck source=scripts/probe-common.sh
source scripts/probe-common.sh
probe_export_demo_admin_env

# Sweep before the fixture, so a previous run's rows cannot satisfy an assertion about a fresh
# acknowledgement. The SQL raises rather than reporting its own DELETE count as clean.
docker exec -i iot-rescue-postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -q -v ON_ERROR_STOP=1' \
  < scripts/probe-noc-cleanup.sql >/dev/null

FIXTURE=$(docker cp scripts/probe-noc-findings-fixture.mts iot-rescue-api:/app/noc-fixture.mts >/dev/null \
  && docker exec iot-rescue-api sh -c 'cd /app && PROBE_APP_ROOT=/app/dist node --experimental-strip-types ./noc-fixture.mts' \
  2>/dev/null | tail -1)

if [ -z "$FIXTURE" ]; then
  echo "fixture produced no ids" >&2
  exit 2
fi

UNACK_ID=$(printf '%s' "$FIXTURE" | sed -n 's/.*"unacknowledged":"\([^"]*\)".*/\1/p')
ACK_ID=$(printf '%s' "$FIXTURE" | sed -n 's/.*"toAcknowledge":"\([^"]*\)".*/\1/p')

PROBE_STATUS=0
PROBE_UNACKNOWLEDGED_ID="$UNACK_ID" \
PROBE_ACK_ID="$ACK_ID" \
  node --experimental-strip-types scripts/probe-noc-operations.mts || PROBE_STATUS=$?

# The exit status is captured before the sweep, so a cleanup failure cannot be mistaken for a
# passing probe, or the reverse. The sweep raising here fails the script through `set -e`.
docker exec -i iot-rescue-postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -q -v ON_ERROR_STOP=1' \
  < scripts/probe-noc-cleanup.sql >/dev/null

exit "$PROBE_STATUS"
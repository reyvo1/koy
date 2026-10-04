#!/usr/bin/env bash
# Run the saved-reports probe with both accounts from a single seed run.
#
# `seed-demo-accounts.mjs` regenerates both passwords on every invocation, so calling it twice
# yields two different pairs and the second run invalidates the first. Seed once, read both.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
# shellcheck source=scripts/probe-common.sh
source scripts/probe-common.sh
probe_export_demo_admin_env

# Sweep before and after, so a run is repeatable and leaves nothing behind.
#
# The sweep deletes every saved report rather than the demo tenant's only. An earlier version was
# scoped to that one tenant and left a row behind on a real tenant called "Browser Demo Tenant" --
# residue written by an earlier build of the console, not by this probe, and invisible to a
# hardcoded-tenant sweep. The full-table scope is safe here because every row is a reproducible
# snapshot; see the header of the SQL file for why, and for the case that would make it wrong.
docker exec -i iot-rescue-postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -q -v ON_ERROR_STOP=1' \
  < scripts/probe-saved-reports-cleanup.sql >/dev/null

PROBE_STATUS=0
node --experimental-strip-types scripts/probe-saved-reports.mts || PROBE_STATUS=$?

# The exit status is captured before the sweep, so a cleanup failure cannot be mistaken for a
# passing probe, or the reverse.
docker exec -i iot-rescue-postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -q -v ON_ERROR_STOP=1' \
  < scripts/probe-saved-reports-cleanup.sql >/dev/null

exit "$PROBE_STATUS"
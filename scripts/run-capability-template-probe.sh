#!/usr/bin/env bash
# Seed once, run the capability-template lifecycle probe with both accounts from that single run.
#
# `seed-demo-accounts.mjs` regenerates both passwords on every invocation, so calling it twice
# yields two different pairs — the second run invalidates the first, which is why an earlier
# attempt died on a 401 for a password that had been correct a moment earlier.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
# shellcheck source=scripts/probe-common.sh
source scripts/probe-common.sh
probe_export_demo_admin_env

# Sweep prior residue *before* seeding the fixture. An earlier version of this probe could not
# restore the fleet -- publishing refused to move backwards, and re-creating an existing version
# raised a Prisma unique violation -- so it left a real device on 9.9.9. The probe's
# precondition correctly refused to certify that state, which is right, but it means the probe
# cannot run twice in a row without this sweep in between.
#
# Scoped by name. No statement here can match a row the probe did not create.
docker exec -i iot-rescue-postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -q -v ON_ERROR_STOP=1' \
  < scripts/probe-capability-template-cleanup.sql >/dev/null

# The refusal fixture has to exist before the probe runs: the demo tenant holds no bound
# capability of its own, so without it the refusal assertions have nothing to refuse.
docker cp scripts/probe-capability-refusal-fixture.ts iot-rescue-api:/app/fixture.mts >/dev/null
docker exec iot-rescue-api sh -c 'cd /app && PROBE_APP_ROOT=/app/dist node --experimental-strip-types ./fixture.mts' \
  2>/dev/null | tail -1

PROBE_STATUS=0
node --experimental-strip-types scripts/probe-capability-template-lifecycle.mts || PROBE_STATUS=$?

# Sweep again afterwards, so a successful run leaves nothing behind. The probe restores the
# fleet's versions through the lifecycle but keeps its fixture device and templates -- useful
# while reading the output, residue afterwards. The exit status is captured before the sweep so
# a cleanup failure cannot be mistaken for a passing probe, or the reverse.
docker exec -i iot-rescue-postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -q -v ON_ERROR_STOP=1' \
  < scripts/probe-capability-template-cleanup.sql >/dev/null

exit "$PROBE_STATUS"

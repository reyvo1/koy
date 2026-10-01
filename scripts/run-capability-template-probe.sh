#!/usr/bin/env bash
# Seed once, run the capability-template lifecycle probe with both accounts from that single run.
#
# `seed-demo-accounts.mjs` regenerates both passwords on every invocation, so calling it twice
# yields two different pairs — the second run invalidates the first, which is why an earlier
# attempt died on a 401 for a password that had been correct a moment earlier.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
set -a; source .env 2>/dev/null || true; set +a

SEED_OUT=$(node scripts/seed-demo-accounts.mjs 2>&1)
SUPER_PW=$(printf '%s\n' "$SEED_OUT" | grep -A 4 'PLATFORM ADMIN' | grep 'Password' | awk '{print $3}')
TENANT_PW=$(printf '%s\n' "$SEED_OUT" | grep -A 5 'TENANT ADMIN' | grep 'Password' | awk '{print $3}')

if [ -z "$SUPER_PW" ] || [ -z "$TENANT_PW" ]; then
  printf '%s\n' "$SEED_OUT" | tail -20
  echo "could not read both passwords from one seed run" >&2
  exit 2
fi

# Sweep prior residue *before* seeding the fixture. An earlier version of this probe could not
# restore the fleet -- publishing refused to move backwards, and re-creating an existing version
# raised a Prisma unique violation -- so it left a real device on 9.9.9. The probe's
# precondition correctly refused to certify that state, which is right, but it means the probe
# cannot run twice in a row without this sweep in between.
#
# Scoped by name. No statement here can match a row the probe did not create.
docker exec -i iot-rescue-postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -q' \
  < scripts/probe-capability-template-cleanup.sql >/dev/null

# The refusal fixture has to exist before the probe runs: the demo tenant holds no bound
# capability of its own, so without it the refusal assertions have nothing to refuse.
docker cp scripts/probe-capability-refusal-fixture.ts iot-rescue-api:/app/fixture.mts >/dev/null
docker exec iot-rescue-api sh -c 'cd /app && PROBE_APP_ROOT=/app/dist node --experimental-strip-types ./fixture.mts' \
  2>/dev/null | tail -1

PROBE_STATUS=0
PROBE_EMAIL=demo.superadmin@iot.local \
PROBE_PASSWORD="$SUPER_PW" \
PROBE_TENANT_ADMIN_EMAIL=demo.admin@iot.local \
PROBE_TENANT_ADMIN_PASSWORD="$TENANT_PW" \
  node --experimental-strip-types scripts/probe-capability-template-lifecycle.mts || PROBE_STATUS=$?

# Sweep again afterwards, so a successful run leaves nothing behind. The probe restores the
# fleet's versions through the lifecycle but keeps its fixture device and templates -- useful
# while reading the output, residue afterwards. The exit status is captured before the sweep so
# a cleanup failure cannot be mistaken for a passing probe, or the reverse.
docker exec -i iot-rescue-postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -q' \
  < scripts/probe-capability-template-cleanup.sql >/dev/null

exit "$PROBE_STATUS"

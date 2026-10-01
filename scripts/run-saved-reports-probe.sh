#!/usr/bin/env bash
# Run the saved-reports probe with both accounts from a single seed run.
#
# `seed-demo-accounts.mjs` regenerates both passwords on every invocation, so calling it twice
# yields two different pairs and the second run invalidates the first. Seed once, read both.
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

# Sweep before and after, so a run is repeatable and leaves nothing behind.
#
# The sweep deletes every saved report rather than the demo tenant's only. An earlier version was
# scoped to that one tenant and left a row behind on a real tenant called "Browser Demo Tenant" --
# residue written by an earlier build of the console, not by this probe, and invisible to a
# hardcoded-tenant sweep. The full-table scope is safe here because every row is a reproducible
# snapshot; see the header of the SQL file for why, and for the case that would make it wrong.
docker exec -i iot-rescue-postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -q' \
  < scripts/probe-saved-reports-cleanup.sql >/dev/null

PROBE_STATUS=0
PROBE_API_BASE="${PROBE_API_BASE:-http://127.0.0.1:5000}" \
PROBE_EMAIL=demo.superadmin@iot.local \
PROBE_PASSWORD="$SUPER_PW" \
PROBE_TENANT_EMAIL=demo.admin@iot.local \
PROBE_TENANT_PASSWORD="$TENANT_PW" \
  node --experimental-strip-types scripts/probe-saved-reports.mts || PROBE_STATUS=$?

# The exit status is captured before the sweep, so a cleanup failure cannot be mistaken for a
# passing probe, or the reverse.
docker exec -i iot-rescue-postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -q' \
  < scripts/probe-saved-reports-cleanup.sql >/dev/null

exit "$PROBE_STATUS"
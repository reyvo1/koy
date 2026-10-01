#!/usr/bin/env bash
# Run the MQTT management probe with both accounts from a single seed run.
#
# This probe stops and restarts the rescue broker, so it is not a read-only script. That is
# deliberate: the claim being proved is that an unreachable broker is *reported* as unreachable
# rather than as an empty fleet, and the only way to observe that is to make the broker unreachable.
# The probe restores it in a `finally` block and asserts the restore succeeded, so a failure part
# way through does not leave the environment down.
#
# `seed-demo-accounts.mjs` regenerates both passwords on every invocation, so it is called once and
# both passwords are read from that single run.
set -euo pipefail
cd /home/ivo/Desktop/program/iot
set -a; source .env 2>/dev/null || true; set +a

SEED_OUT=$(node scripts/seed-demo-accounts.mjs 2>&1)
SUPER_PW=$(printf '%s\n' "$SEED_OUT" | grep -A 4 'PLATFORM ADMIN' | grep 'Password' | awk '{print $3}')
TENANT_PW=$(printf '%s\n' "$SEED_OUT" | grep -A 5 'TENANT ADMIN' | grep 'Password' | awk '{print $3}')

if [ -z "$SUPER_PW" ] || [ -z "$TENANT_PW" ]; then
  printf '%s\n' "$SEED_OUT" | tail -20
  echo "could not read both passwords from one seed run" >&2
  exit 2
fi

# The API must reach the broker, and the probe talks to the API on the host. If the broker is
# already stopped when this starts, the outage test would prove nothing -- the reachable case would
# fail first, which is loud enough, so no pre-check is needed here.
PROBE_STATUS=0
PROBE_API_BASE="${PROBE_API_BASE:-http://127.0.0.1:5000}" \
PROBE_EMAIL=demo.superadmin@iot.local \
PROBE_PASSWORD="$SUPER_PW" \
PROBE_TENANT_EMAIL=demo.admin@iot.local \
PROBE_TENANT_PASSWORD="$TENANT_PW" \
PROBE_TENANT_ID=22222222-2222-4222-8222-222222222222 \
  node --experimental-strip-types scripts/probe-mqtt-management.mts || PROBE_STATUS=$?

# Belt and braces: the probe restores the broker itself, but a hard kill between the stop and the
# restore would leave it down. Start it unconditionally -- starting a running container is a no-op.
docker start iot-rescue-emqx >/dev/null 2>&1 || true

exit "$PROBE_STATUS"

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
cd "$(dirname "${BASH_SOURCE[0]}")/.."
# shellcheck source=scripts/probe-common.sh
source scripts/probe-common.sh
probe_export_demo_admin_env

# The API must reach the broker, and the probe talks to the API on the host. If the broker is
# already stopped when this starts, the reachable case fails before outage evidence is accepted.
# An EXIT trap is only emergency cleanup: it never turns a failed UAT into PASS.
restore_broker() {
  if ! docker start iot-rescue-emqx >/dev/null 2>&1; then
    echo 'WARN: emergency broker restore failed; live probe result remains authoritative' >&2
  fi
}
trap restore_broker EXIT

PROBE_STATUS=0
node --experimental-strip-types scripts/probe-mqtt-management.mts || PROBE_STATUS=$?

exit "$PROBE_STATUS"

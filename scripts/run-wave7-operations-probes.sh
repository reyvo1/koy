#!/usr/bin/env bash
# Canonical Wave 7 mobile + technician entrypoint. Both probes run so one regression cannot hide
# the other; final status is still red if either probe fails.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
# shellcheck source=scripts/probe-common.sh
source scripts/probe-common.sh

probe_require_uat

MOBILE_STATUS=0
MAINTENANCE_STATUS=0

bash scripts/run-mobile-notification-probe.sh || MOBILE_STATUS=$?
bash scripts/run-device-maintenance-probe.sh || MAINTENANCE_STATUS=$?

if [ "$MOBILE_STATUS" -eq 0 ] && [ "$MAINTENANCE_STATUS" -eq 0 ]; then
  echo 'WAVE 7 MOBILE + TECHNICIAN LIVE PROBE PASS'
  exit 0
fi

echo "WAVE 7 MOBILE + TECHNICIAN LIVE PROBE FAIL (mobile=${MOBILE_STATUS} maintenance=${MAINTENANCE_STATUS})" >&2
exit 1

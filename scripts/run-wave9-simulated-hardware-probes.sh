#!/usr/bin/env bash
# Canonical Wave 9 simulated-hardware entrypoint. Media, camera onboarding and device location are
# independent enough to diagnose together. The later evidence sealer still requires every receipt,
# so running all three here improves diagnostics without weakening acceptance.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
# shellcheck source=scripts/probe-common.sh
source scripts/probe-common.sh

probe_require_uat

MEDIA_STATUS=0
CAMERA_STATUS=0
LOCATION_STATUS=0

bash scripts/run-media-probe.sh || MEDIA_STATUS=$?
bash scripts/run-camera-probe.sh || CAMERA_STATUS=$?
bash scripts/run-device-location-probe.sh || LOCATION_STATUS=$?

if [ "$MEDIA_STATUS" -eq 0 ] && [ "$CAMERA_STATUS" -eq 0 ] && [ "$LOCATION_STATUS" -eq 0 ]; then
  echo 'WAVE 9 SIMULATED HARDWARE LIVE PROBE PASS'
  exit 0
fi

echo "WAVE 9 SIMULATED HARDWARE LIVE PROBE FAIL (media=${MEDIA_STATUS} camera=${CAMERA_STATUS} location=${LOCATION_STATUS})" >&2
exit 1

#!/usr/bin/env bash
# Canonical Wave 6 management-plane entrypoint.
#
# Seed the demo admin identities exactly once and export them to every child probe. Individual
# wrappers stay runnable on their own, but under CI they must not rotate the same passwords four
# times or parse credential-bearing stdout independently.
#
# All four probes run even if one fails so the same expensive live environment returns a complete
# Wave 6 diagnosis. Final status remains fail-closed if any child failed.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
# shellcheck source=scripts/probe-common.sh
source scripts/probe-common.sh

probe_export_demo_admin_env

# Authenticate each Wave 6 identity exactly once. The sensitive-auth limiter is keyed by login path
# and runner IP, not by email, so four independent management probes each logging in both identities
# can exhaust the production rate limit even though authentication itself is healthy. Child probes
# consume these tokens and still run their authorization checks with distinct platform/tenant actors.
export PROBE_SESSION_TENANT_ID="${PROBE_SESSION_TENANT_ID:-11111111-1111-4111-8111-111111111111}"
PLATFORM_SESSION="reports/wave6-platform-session.json"
TENANT_SESSION="reports/wave6-tenant-session.json"
rm -f "$PLATFORM_SESSION" "$TENANT_SESSION"
probe_login_identity "$PROBE_API_BASE" "$PLATFORM_SESSION" \
  "$PROBE_EMAIL" "$PROBE_PASSWORD" "$PROBE_SESSION_TENANT_ID"
probe_login_identity "$PROBE_API_BASE" "$TENANT_SESSION" \
  "$PROBE_TENANT_EMAIL" "$PROBE_TENANT_PASSWORD" "$PROBE_TENANT_ID"
export PROBE_ACCESS_TOKEN="$(probe_session_token "$PLATFORM_SESSION")"
export PROBE_TENANT_ACCESS_TOKEN="$(probe_session_token "$TENANT_SESSION")"

CAPABILITY_STATUS=0
REPORTS_STATUS=0
MQTT_STATUS=0
NOC_STATUS=0

bash scripts/run-capability-template-probe.sh || CAPABILITY_STATUS=$?
bash scripts/run-saved-reports-probe.sh || REPORTS_STATUS=$?
bash scripts/run-mqtt-management-probe.sh || MQTT_STATUS=$?
bash scripts/run-noc-probe.sh || NOC_STATUS=$?

if [ "$CAPABILITY_STATUS" -eq 0 ] &&
   [ "$REPORTS_STATUS" -eq 0 ] &&
   [ "$MQTT_STATUS" -eq 0 ] &&
   [ "$NOC_STATUS" -eq 0 ]; then
  echo 'WAVE 6 MANAGEMENT PLANE LIVE PROBE PASS'
  exit 0
fi

echo "WAVE 6 MANAGEMENT PLANE LIVE PROBE FAIL (capability=${CAPABILITY_STATUS} reports=${REPORTS_STATUS} mqtt=${MQTT_STATUS} noc=${NOC_STATUS})" >&2
exit 1

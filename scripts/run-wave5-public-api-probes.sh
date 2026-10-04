#!/usr/bin/env bash
# Canonical Wave 5 live-probe entrypoint.
#
# Wave 4 seeds `.uat-credentials`. Wave 5 must consume that exact source-bound UAT identity rather
# than assume GitHub has PROBE_EMAIL/PROBE_PASSWORD exported globally. Calling the low-level probes
# directly from CI caused `set -u` to abort before login on a fresh runner, while local shells that
# happened to carry those variables could mask the defect.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# shellcheck source=scripts/probe-common.sh
source scripts/probe-common.sh

probe_export_uat_admin_env

printf 'Wave 5 UAT identity: %s tenant=%s api=%s\n' "$PROBE_EMAIL" "$PROBE_TENANT_ID" "$PROBE_BASE"

bash scripts/probe-webhook-event-vocabulary.sh
node --experimental-strip-types scripts/probe-public-api-sdk.mts

printf 'WAVE 5 PUBLIC API + WEBHOOK LIVE PROBE PASS\n'

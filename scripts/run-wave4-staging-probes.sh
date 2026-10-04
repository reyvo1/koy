#!/usr/bin/env bash
# Canonical Wave 4 staging entrypoint. Run every independent contract and aggregate the result so
# one failure does not hide another. A non-zero child remains a non-zero Wave 4 result.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

DOCS_STATUS=0
LOGIN_STATUS=0
TLS_STATUS=0

npm run uat:docs || DOCS_STATUS=$?
npm run uat:login || LOGIN_STATUS=$?
npm run tls:verify || TLS_STATUS=$?

if [ "$DOCS_STATUS" -eq 0 ] && [ "$LOGIN_STATUS" -eq 0 ] && [ "$TLS_STATUS" -eq 0 ]; then
  echo 'WAVE 4 STAGING UAT + TLS PROBE PASS'
  exit 0
fi
echo "WAVE 4 STAGING UAT + TLS PROBE FAIL (docs=${DOCS_STATUS} login=${LOGIN_STATUS} tls=${TLS_STATUS})" >&2
exit 1

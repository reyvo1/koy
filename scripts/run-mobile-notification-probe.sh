#!/usr/bin/env bash
# Wave 7 — mobile notification parity, end to end.
#
# Two halves, in this order, because the second reads what the first writes:
#
#   1. The writer probe drives `POST /auth/register` and `POST /auth/forgot-password`, the product's
#      own two notification writers, and then reads the operator log back. Nothing here is a
#      fixture: if those verbs stopped enqueueing, this half would fail rather than pass quietly.
#   2. The integration spec calls the *mobile client* against the running API. The unit spec drives
#      that client with a fake gateway, so it proves parsing and refusal and nothing about the wire;
#      this is the half that proves the paths the client asks for exist and that its picture of the
#      response matches the server's.
#
# Read-only against the database after the writer runs, and the sweep removes only rows this probe
# created, matched on a per-run stamp. The probe asserts zero remaining rows rather than trusting
# its own DELETE count.
#
# Requires: the API container healthy on $PROBE_API_BASE (default http://127.0.0.1:3000) and a
# UAT tenant session already written to the credentials file by scripts/seed-uat-baseline.mjs.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
DIR="$(dirname "$0")"
# shellcheck source=scripts/probe-common.sh
source scripts/probe-common.sh

API="${PROBE_API_BASE:-$(probe_resolve_api_base)}"
CREDS="${PROBE_LOGIN_FILE:-reports/probe-session.json}"
mkdir -p "$(dirname "$CREDS")"

WRITER_STATUS=0
PROBE_STATUS=0

probe_require_uat
probe_login "$API" "$CREDS"

# The sweep runs *before* the writers, for the same reason the NOC probe does it: a previous run's
# rows would otherwise satisfy an assertion about a notification this run just wrote.
docker exec -i iot-rescue-postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -q -v ON_ERROR_STOP=1' \
  < "$DIR/probe-notification-cleanup.sql" >/dev/null

# ---------------------------------------------------------------- 1. the writers, then the operator log
# `set -e` is deliberately suspended around this call so the second half still runs and its result
# is reported alongside; a probe that stops at the first failure leaves the reader guessing whether
# the later half was merely unreached.
PROBE_LOGIN_FILE="$CREDS" PROBE_API_BASE="$API" \
  python3 "$(dirname "$0")/probe-notification-writers.py" || WRITER_STATUS=$?

# ---------------------------------------------------------------- 2. the mobile client against the wire
PROBE_LOGIN_FILE="$CREDS" PROBE_API_BASE="$API" \
  npx jest --config ./test/jest-mobile-notification-integration.json --runInBand || PROBE_STATUS=$?

# ---------------------------------------------------------------- 3. sweep, and prove it swept
# Scoped by the `wave7-notif-` marker on the registered address, so nothing here can match a row a
# real operator's account produced. The SQL raises rather than reporting its own DELETE count as
# clean, so a sweep failure fails the script through `set -e`.
docker exec -i iot-rescue-postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -q -v ON_ERROR_STOP=1' \
  < "$DIR/probe-notification-cleanup.sql"

printf '\n'
if [ "$WRITER_STATUS" -eq 0 ] && [ "$PROBE_STATUS" -eq 0 ]; then
  echo 'WAVE 7 MOBILE NOTIFICATION PROBE: PASS'
  exit 0
fi
echo "WAVE 7 MOBILE NOTIFICATION PROBE: FAIL (writers=${WRITER_STATUS} client=${PROBE_STATUS})" >&2
exit 1
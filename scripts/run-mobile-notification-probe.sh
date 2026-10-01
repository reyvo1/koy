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
# Requires: the API container healthy on $PROBE_API_BASE (default http://127.0.0.1:5000) and a
# UAT tenant session already written to the credentials file by scripts/seed-uat-baseline.mjs.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

PROBE_API_BASE="${PROBE_API_BASE:-http://127.0.0.1:5000}"
# Session response, written by probe_login. It defaults to a repo-local path because this used to
# point at a scratch directory that exists on exactly one machine, where curl could not write on
# a runner -- and a probe whose session file cannot be created fails as a mystery, not as a config
# error. `reports/` is git-ignored, so nothing is committed. PROBE_LOGIN_FILE still overrides it.
CREDS="${PROBE_LOGIN_FILE:-reports/probe-session.json}"
mkdir -p "$(dirname "$CREDS")"

# Both halves start from "no rows of this probe's own", so a previous run's data cannot satisfy an
# assertion about a freshly written notification.
WRITER_STATUS=0
PROBE_STATUS=0

# ---------------------------------------------------------------- 0. a session for the UAT tenant
# Read from the git-ignored credentials file, never from seed stdout: this environment redacts
# credential-shaped output, so a stdout-parsed password is not the password and the 401 that follows
# reads as an application fault rather than as a parsing artefact.
if [ ! -f .uat-credentials ]; then
  echo "run 'npm run uat:seed' first: .uat-credentials is missing" >&2
  exit 2
fi
PW=$(awk '/uat.admin@iot.local/{f=1} f && /password/{sub(/^[^:]*: */,""); print; exit}' .uat-credentials)
TENANT=44444444-4444-4444-8444-444444444444
mkdir -p "$(dirname "$CREDS")"
STATUS=$(curl -s -o "$CREDS" -w '%{http_code}' -X POST "$PROBE_API_BASE/auth/login" \
  -H 'content-type: application/json' \
  --data "{\"tenantId\":\"$TENANT\",\"email\":\"uat.admin@iot.local\",\"password\":\"$PW\"}")
if [ "$STATUS" != "200" ] && [ "$STATUS" != "201" ]; then
  echo "UAT tenant login failed: HTTP $STATUS" >&2
  exit 2
fi
printf 'UAT session ok\n'

# The sweep runs *before* the writers, for the same reason the NOC probe does it: a previous run's
# rows would otherwise satisfy an assertion about a notification this run just wrote.
docker exec -i iot-rescue-postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -q -v ON_ERROR_STOP=1' \
  < "$(dirname "$0")/probe-notification-cleanup.sql" >/dev/null

# ---------------------------------------------------------------- 1. the writers, then the operator log
# `set -e` is deliberately suspended around this call so the second half still runs and its result
# is reported alongside; a probe that stops at the first failure leaves the reader guessing whether
# the later half was merely unreached.
PROBE_LOGIN_FILE="$CREDS" PROBE_API_BASE="$PROBE_API_BASE" \
  python3 "$(dirname "$0")/probe-notification-writers.py" || WRITER_STATUS=$?

# ---------------------------------------------------------------- 2. the mobile client against the wire
PROBE_LOGIN_FILE="$CREDS" PROBE_API_BASE="$PROBE_API_BASE" \
  npx jest --config ./test/jest-mobile-notification-integration.json --runInBand || PROBE_STATUS=$?

# ---------------------------------------------------------------- 3. sweep, and prove it swept
# Scoped by the `wave7-notif-` marker on the registered address, so nothing here can match a row a
# real operator's account produced. The SQL raises rather than reporting its own DELETE count as
# clean, so a sweep failure fails the script through `set -e`.
docker exec -i iot-rescue-postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -q -v ON_ERROR_STOP=1' \
  < "$(dirname "$0")/probe-notification-cleanup.sql"

printf '\n'
if [ "$WRITER_STATUS" -eq 0 ] && [ "$PROBE_STATUS" -eq 0 ]; then
  echo 'WAVE 7 MOBILE NOTIFICATION PROBE: PASS'
  exit 0
fi
echo "WAVE 7 MOBILE NOTIFICATION PROBE: FAIL (writers=${WRITER_STATUS} client=${PROBE_STATUS})" >&2
exit 1
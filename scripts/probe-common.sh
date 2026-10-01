#!/usr/bin/env bash
# Shared live-probe preamble: resolve the API base and mint a UAT session.
#
# The port is read from the rescue environment rather than hardcoded. `rescue:local:up` publishes the
# API on `PORT` (3000 in the generated env), while a hand-built stack used 5000 -- a hardcoded default
# would pass locally and fail in CI, which is the worst direction for a port.
#
# The credential field is parsed by label with a tolerant separator, because the UAT file writes
# "password  :" with two spaces. An earlier awk pattern assumed one, matched nothing, and left the
# probe exiting with no output at all -- which reads like a passing skip rather than a failure.
set -euo pipefail

probe_resolve_api_base() {
  local port
  port=$(awk -F= '/^PORT=/{print $2; exit}' .env 2>/dev/null || true)
  printf 'http://127.0.0.1:%s' "${port:-3000}"
}

probe_uat_password() {
  awk '
    /^uat\.admin@iot\.local/ { admin = 1; next }
    admin && /password[[:space:]]*:/ {
      sub(/^[^:]*:[[:space:]]*/, "")
      gsub(/[[:space:]]/, "")
      print
      exit
    }
  ' .uat-credentials
}

probe_require_uat() {
  if [ ! -f .uat-credentials ]; then
    echo "run 'npm run uat:seed' first: .uat-credentials is missing" >&2
    exit 2
  fi
}

probe_login() {
  local api="$1" creds="$2" password status
  password=$(probe_uat_password)
  if [ -z "$password" ]; then
    # Refuse rather than sending an empty password: a 401 here is indistinguishable from a wrong
    # tenant, and the failure would be diagnosed in the wrong place.
    echo "could not read the UAT admin password from .uat-credentials" >&2
    exit 2
  fi
  status=$(curl -s -o "$creds" -w '%{http_code}' -X POST "$api/auth/login" \
    -H 'content-type: application/json' \
    --data "{\"tenantId\":\"44444444-4444-4444-8444-444444444444\",\"email\":\"uat.admin@iot.local\",\"password\":\"$password\"}")
  if [ "$status" != "200" ] && [ "$status" != "201" ]; then
    echo "UAT login failed: HTTP $status" >&2
    exit 2
  fi
  printf 'UAT session ok (%s)\n' "$api"
}

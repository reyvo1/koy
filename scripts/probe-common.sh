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
  if [ -z "$password" ] || [[ "$password" == \(unknown* ]]; then
    # Refuse rather than sending an empty/placeholder password: a 401 here is indistinguishable
    # from a wrong tenant, and the failure would be diagnosed in the wrong place.
    echo "could not read a usable UAT admin password from .uat-credentials" >&2
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

probe_export_uat_admin_env() {
  probe_require_uat

  local password
  password="${PROBE_PASSWORD:-$(probe_uat_password)}"
  if [ -z "$password" ] || [[ "$password" == \(unknown* ]]; then
    echo "could not read a usable UAT admin password from .uat-credentials" >&2
    exit 2
  fi

  export PROBE_EMAIL="${PROBE_EMAIL:-uat.admin@iot.local}"
  export PROBE_PASSWORD="$password"
  export PROBE_TENANT_ID="${PROBE_TENANT_ID:-44444444-4444-4444-8444-444444444444}"
  export PROBE_BASE="${PROBE_BASE:-$(probe_resolve_api_base)}"
  export PROBE_API_BASE="${PROBE_API_BASE:-$PROBE_BASE}"
}

probe_source_env() {
  if [ -f .env ]; then
    set -a
    # shellcheck disable=SC1091
    source .env
    set +a
  fi
}

probe_export_demo_admin_env() {
  if [ -n "${PROBE_EMAIL:-}" ] &&
     [ -n "${PROBE_PASSWORD:-}" ] &&
     [ -n "${PROBE_TENANT_EMAIL:-${PROBE_TENANT_ADMIN_EMAIL:-}}" ] &&
     [ -n "${PROBE_TENANT_PASSWORD:-${PROBE_TENANT_ADMIN_PASSWORD:-}}" ]; then
    export PROBE_TENANT_EMAIL="${PROBE_TENANT_EMAIL:-$PROBE_TENANT_ADMIN_EMAIL}"
    export PROBE_TENANT_PASSWORD="${PROBE_TENANT_PASSWORD:-$PROBE_TENANT_ADMIN_PASSWORD}"
    export PROBE_TENANT_ADMIN_EMAIL="${PROBE_TENANT_ADMIN_EMAIL:-$PROBE_TENANT_EMAIL}"
    export PROBE_TENANT_ADMIN_PASSWORD="${PROBE_TENANT_ADMIN_PASSWORD:-$PROBE_TENANT_PASSWORD}"
    export PROBE_TENANT_ID="${PROBE_TENANT_ID:-22222222-2222-4222-8222-222222222222}"
    export PROBE_API_BASE="${PROBE_API_BASE:-$(probe_resolve_api_base)}"
    return
  fi

  probe_source_env

  local credential_file own_file parsed
  credential_file="${PROBE_DEMO_CREDENTIAL_FILE:-reports/.wave6-demo-credentials-$$.json}"
  own_file=0
  mkdir -p "$(dirname "$credential_file")"

  if [ ! -f "$credential_file" ]; then
    own_file=1
    if ! node scripts/seed-demo-accounts.mjs \
      "--credentials-file=$credential_file" --quiet >/dev/null; then
      rm -f "$credential_file"
      echo "could not seed Wave 6 demo accounts" >&2
      return 2
    fi
  fi

  if ! parsed=$(node -e '
    const fs = require("node:fs");
    const file = process.argv[1];
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    const values = [
      data.platformAdmin?.email,
      data.platformAdmin?.password,
      data.tenantAdmin?.email,
      data.tenantAdmin?.password,
      data.tenantAdmin?.tenantId,
    ];
    if (values.some((value) => typeof value !== "string" || value.length === 0)) process.exit(2);
    process.stdout.write(values.join("\n"));
  ' "$credential_file"); then
    [ "$own_file" -eq 0 ] || rm -f "$credential_file"
    echo "could not read Wave 6 demo credential file" >&2
    return 2
  fi

  [ "$own_file" -eq 0 ] || rm -f "$credential_file"

  export PROBE_EMAIL="$(printf '%s\n' "$parsed" | sed -n '1p')"
  export PROBE_PASSWORD="$(printf '%s\n' "$parsed" | sed -n '2p')"
  export PROBE_TENANT_EMAIL="$(printf '%s\n' "$parsed" | sed -n '3p')"
  export PROBE_TENANT_PASSWORD="$(printf '%s\n' "$parsed" | sed -n '4p')"
  export PROBE_TENANT_ADMIN_EMAIL="$PROBE_TENANT_EMAIL"
  export PROBE_TENANT_ADMIN_PASSWORD="$PROBE_TENANT_PASSWORD"
  export PROBE_TENANT_ID="$(printf '%s\n' "$parsed" | sed -n '5p')"
  export PROBE_API_BASE="${PROBE_API_BASE:-$(probe_resolve_api_base)}"
}

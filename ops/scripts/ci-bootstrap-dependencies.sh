#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'

readonly PINNED_NPM_VERSION="${CI_BOOTSTRAP_NPM_VERSION:-10.8.0}"
readonly PIN_TIMEOUT_SECONDS="${CI_BOOTSTRAP_PIN_TIMEOUT_SECONDS:-120}"
readonly INSTALL_TIMEOUT_SECONDS="${CI_BOOTSTRAP_INSTALL_TIMEOUT_SECONDS:-360}"
readonly HEARTBEAT_SECONDS="${CI_BOOTSTRAP_HEARTBEAT_SECONDS:-30}"
readonly POLL_SECONDS=5
readonly RUN_TEMP="${RUNNER_TEMP:-${TMPDIR:-/tmp}}"
readonly RUN_ID="${GITHUB_RUN_ID:-local}"
readonly RUN_ATTEMPT="${GITHUB_RUN_ATTEMPT:-1}"
readonly NPM_CACHE_DIR="${RUN_TEMP}/iot-platform-npm-cache-${RUN_ID}-${RUN_ATTEMPT}"
readonly NPM_LOG_DIR="${RUN_TEMP}/iot-platform-npm-logs-${RUN_ID}-${RUN_ATTEMPT}"
readonly NPM_CLI_DIR="${RUN_TEMP}/iot-platform-npm-cli-${RUN_ID}-${RUN_ATTEMPT}"
readonly NPM_TARBALL="${NPM_CLI_DIR}/npm-${PINNED_NPM_VERSION}.tgz"
readonly PINNED_NPM_CLI="${NPM_CLI_DIR}/package/bin/npm-cli.js"

require_file() {
  local path="$1"
  if [[ ! -f "${path}" ]]; then
    echo "Required file is missing: ${path}" >&2
    exit 1
  fi
}

require_command() {
  local name="$1"
  if ! command -v "${name}" >/dev/null 2>&1; then
    echo "Required command is unavailable: ${name}" >&2
    exit 1
  fi
}

dump_npm_diagnostics() {
  local exit_code="$1"
  set +e

  echo "::group::CI dependency bootstrap diagnostics"
  echo "Bootstrap exit code: ${exit_code}"
  echo "Node: $(node --version 2>&1)"
  echo "Bundled npm: $(npm --version 2>&1)"
  if [[ -f "${PINNED_NPM_CLI}" ]]; then
    echo "Pinned npm: $(node "${PINNED_NPM_CLI}" --version 2>&1)"
  fi
  echo "Registry: $(npm config get registry 2>&1)"
  echo "Working directory: $(pwd)"
  echo "Disk usage:"
  df -h . "${RUN_TEMP}" 2>&1 || true
  echo "Relevant processes:"
  ps -ef 2>&1 | grep -E '[n]pm|[n]ode|[t]ar' || true
  if [[ -d node_modules ]]; then
    echo "node_modules top-level entry count: $(find node_modules -mindepth 1 -maxdepth 1 -print 2>/dev/null | wc -l | tr -d ' ')"
  fi

  local found_log=0
  local search_dir
  for search_dir in "${NPM_LOG_DIR}" "${NPM_CACHE_DIR}/_logs"; do
    if [[ -d "${search_dir}" ]]; then
      while IFS= read -r -d '' log_file; do
        found_log=1
        echo "--- ${log_file} (last 300 lines) ---"
        tail -n 300 "${log_file}" 2>&1 || true
      done < <(find "${search_dir}" -maxdepth 2 -type f -print0 2>/dev/null)
    fi
  done

  if [[ "${found_log}" -eq 0 ]]; then
    echo "No npm diagnostic log was produced."
  fi
  echo "::endgroup::"
}

on_exit() {
  local exit_code=$?
  if [[ "${exit_code}" -ne 0 ]]; then
    dump_npm_diagnostics "${exit_code}"
  fi
}
trap on_exit EXIT

run_bounded() {
  local label="$1"
  local limit_seconds="$2"
  shift 2

  echo "${label}"
  timeout --signal=TERM --kill-after=20s "${limit_seconds}s" "$@" &
  local process_id=$!
  local elapsed=0

  while kill -0 "${process_id}" >/dev/null 2>&1; do
    sleep "${POLL_SECONDS}"
    elapsed=$((elapsed + POLL_SECONDS))
    if kill -0 "${process_id}" >/dev/null 2>&1 && (( elapsed % HEARTBEAT_SECONDS == 0 )); then
      echo "${label} still running (${elapsed}s elapsed)."
    fi
  done

  set +e
  wait "${process_id}"
  local exit_code=$?
  set -e

  if [[ "${exit_code}" -eq 124 || "${exit_code}" -eq 137 ]]; then
    echo "${label} exceeded its ${limit_seconds}s internal timeout." >&2
  elif [[ "${exit_code}" -ne 0 ]]; then
    echo "${label} failed with exit code ${exit_code}." >&2
  fi

  return "${exit_code}"
}

assert_public_lockfile_registry() {
  if grep -Eiq 'applied-caas-gateway|internal\.api\.openai\.org|artifactory/api/npm/npm-public' package-lock.json; then
    echo "package-lock.json contains a private or environment-specific npm registry URL." >&2
    echo "Normalize the lockfile against https://registry.npmjs.org/ before CI." >&2
    exit 1
  fi
}
require_file package.json
require_file package-lock.json
require_file prisma/schema.prisma
require_command node
require_command npm
assert_public_lockfile_registry

if [[ "${1:-}" == "--validate-only" ]]; then
  echo "CI dependency bootstrap recovery validation passed."
  echo "Project Node runtime: $(node --version)"
  echo "Bundled npm: $(npm --version)"
  echo "CI install-only npm: ${PINNED_NPM_VERSION}"
  echo "Module activation is not performed by this script."
  exit 0
fi

require_command timeout
require_command tar

rm -rf "${NPM_CACHE_DIR}" "${NPM_LOG_DIR}" "${NPM_CLI_DIR}" node_modules
mkdir -p "${NPM_CACHE_DIR}" "${NPM_LOG_DIR}" "${NPM_CLI_DIR}"

export npm_config_cache="${NPM_CACHE_DIR}"
export npm_config_logs_dir="${NPM_LOG_DIR}"
export npm_config_registry="https://registry.npmjs.org/"
export npm_config_replace_registry_host="always"
export npm_config_audit=false
export npm_config_fund=false
export npm_config_update_notifier=false
export npm_config_color=false
export npm_config_progress=false
export npm_config_maxsockets=8
export npm_config_fetch_timeout=60000
export npm_config_fetch_retries=3
export npm_config_fetch_retry_factor=2
export npm_config_fetch_retry_mintimeout=10000
export npm_config_fetch_retry_maxtimeout=60000

if [[ -n "${NODE_OPTIONS:-}" ]]; then
  export NODE_OPTIONS="${NODE_OPTIONS} --dns-result-order=ipv4first"
else
  export NODE_OPTIONS="--dns-result-order=ipv4first"
fi

run_bounded \
  "Fetching CI install-only npm ${PINNED_NPM_VERSION} as a verified registry package..." \
  "${PIN_TIMEOUT_SECONDS}" \
  npm pack "npm@${PINNED_NPM_VERSION}" \
    --pack-destination "${NPM_CLI_DIR}" \
    --ignore-scripts \
    --no-audit \
    --no-fund \
    --timing \
    --loglevel=notice

require_file "${NPM_TARBALL}"
tar -xzf "${NPM_TARBALL}" -C "${NPM_CLI_DIR}"
require_file "${PINNED_NPM_CLI}"

actual_npm_version="$(node "${PINNED_NPM_CLI}" --version)"
if [[ "${actual_npm_version}" != "${PINNED_NPM_VERSION}" ]]; then
  echo "Expected pinned npm ${PINNED_NPM_VERSION}, found ${actual_npm_version}." >&2
  exit 1
fi

echo "Using Node $(node --version) with CI install-only npm ${actual_npm_version}."

run_bounded \
  "Installing the locked dependency tree with pinned npm and lifecycle scripts disabled..." \
  "${INSTALL_TIMEOUT_SECONDS}" \
  node "${PINNED_NPM_CLI}" ci \
    --ignore-scripts \
    --no-audit \
    --no-fund \
    --prefer-online \
    --timing \
    --loglevel=verbose

./node_modules/.bin/prisma generate
node "${PINNED_NPM_CLI}" ls --depth=0

echo "CI dependency bootstrap completed successfully."
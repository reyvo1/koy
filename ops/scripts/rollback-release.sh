#!/usr/bin/env bash
set -Eeuo pipefail

application_root="${APPLICATION_ROOT:-/opt/iot-platform}"
current_link="$application_root/current"
previous_link="$application_root/previous"
service_name="${SERVICE_NAME:-iot-platform.service}"
health_url="${HEALTH_URL:-http://127.0.0.1:3000/health/live}"

if [[ ! -L "$previous_link" ]]; then
  echo "Previous release symlink is unavailable" >&2
  exit 1
fi
previous_target="$(readlink -f "$previous_link")"
if [[ ! -f "$previous_target/dist/main.js" ]]; then
  echo "Previous release is incomplete" >&2
  exit 1
fi

current_target=""
if [[ -L "$current_link" ]]; then
  current_target="$(readlink -f "$current_link")"
fi
ln -sfn "$previous_target" "$current_link"
if [[ -n "$current_target" ]]; then
  ln -sfn "$current_target" "$previous_link"
fi
systemctl restart "$service_name"
curl --fail --silent --show-error --retry 10 --retry-delay 2 "$health_url" >/dev/null
systemctl is-active --quiet "$service_name"

echo "Application release rolled back to: $previous_target"
echo "Database migrations were not reversed. Rollback-compatible migrations are required."

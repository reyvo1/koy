#!/usr/bin/env bash
set -Eeuo pipefail
umask 027

: "${RELEASE_SOURCE_DIR:?RELEASE_SOURCE_DIR is required}"
: "${RELEASE_ID:?RELEASE_ID is required}"
environment_file="${ENVIRONMENT_FILE:-/etc/iot-platform/iot-platform.env}"
backup_environment_file="${BACKUP_ENVIRONMENT_FILE:-/etc/iot-platform/iot-platform-backup.env}"

if [[ ! "$RELEASE_ID" =~ ^[A-Za-z0-9._-]+$ ]]; then
  echo "RELEASE_ID contains unsupported characters" >&2
  exit 1
fi
if [[ ! -f "$RELEASE_SOURCE_DIR/release-manifest.json" || ! -f "$RELEASE_SOURCE_DIR/dist/main.js" || ! -f "$RELEASE_SOURCE_DIR/scripts/verify-production-release.mjs" ]]; then
  echo "Release source is incomplete" >&2
  exit 1
fi
RELEASE_OUTPUT_DIR="$RELEASE_SOURCE_DIR" node "$RELEASE_SOURCE_DIR/scripts/verify-production-release.mjs" --require-approved
node "$RELEASE_SOURCE_DIR/scripts/verify-migration-compatibility.mjs" --root="$RELEASE_SOURCE_DIR"
if [[ ! -r "$environment_file" ]]; then
  echo "Runtime environment file is not readable: $environment_file" >&2
  exit 1
fi
if [[ ! -r "$backup_environment_file" ]]; then
  echo "Backup environment file is not readable: $backup_environment_file" >&2
  exit 1
fi
node "$RELEASE_SOURCE_DIR/scripts/verify-production-environment-current.mjs" \
  --evidence="$RELEASE_SOURCE_DIR/production-environment-evidence.json" \
  --env="$environment_file" \
  --backup-env="$backup_environment_file"

application_root="${APPLICATION_ROOT:-/opt/iot-platform}"
release_dir="$application_root/releases/$RELEASE_ID"
current_link="$application_root/current"
previous_link="$application_root/previous"
service_name="${SERVICE_NAME:-iot-platform.service}"
health_url="${HEALTH_URL:-http://127.0.0.1:3000/health/live}"

install -d -o iot-platform -g iot-platform -m 0750 "$application_root/releases"
if [[ -e "$release_dir" ]]; then
  echo "Release already exists: $release_dir" >&2
  exit 1
fi
install -d -o iot-platform -g iot-platform -m 0750 "$release_dir"
cp -a "$RELEASE_SOURCE_DIR/." "$release_dir/"
chown -R iot-platform:iot-platform "$release_dir"

sudo -u iot-platform npm --prefix "$release_dir" ci
database_url="$(sed -n 's/^DATABASE_URL=//p' "$environment_file" | head -n 1)"
if [[ -z "$database_url" ]]; then
  echo "DATABASE_URL is required in $environment_file" >&2
  exit 1
fi
sudo -u iot-platform env DATABASE_URL="$database_url" npm --prefix "$release_dir" run migrate:deploy
sudo -u iot-platform npm --prefix "$release_dir" prune --omit=dev

previous_target=""
if [[ -L "$current_link" ]]; then
  previous_target="$(readlink -f "$current_link")"
  ln -sfn "$previous_target" "$previous_link"
fi
ln -sfn "$release_dir" "$current_link"
systemctl restart "$service_name"

if ! curl --fail --silent --show-error --retry 10 --retry-delay 2 "$health_url" >/dev/null; then
  echo "Release health check failed; restoring previous release symlink" >&2
  if [[ -n "$previous_target" ]]; then
    ln -sfn "$previous_target" "$current_link"
    systemctl restart "$service_name"
  else
    rm -f "$current_link"
    systemctl stop "$service_name"
  fi
  exit 1
fi

systemctl is-active --quiet "$service_name"
echo "Release installed: $RELEASE_ID"

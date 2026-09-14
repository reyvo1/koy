#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

: "${BACKUP_FILE:?BACKUP_FILE is required}"
: "${RESTORE_TARGET_DATABASE_URL:?RESTORE_TARGET_DATABASE_URL is required}"
: "${DATABASE_URL:?DATABASE_URL is required for source/target safety comparison}"

if [[ "$RESTORE_TARGET_DATABASE_URL" == "$DATABASE_URL" && "${ALLOW_PRODUCTION_RESTORE:-false}" != "true" ]]; then
  echo "Refusing to restore over the configured production database" >&2
  exit 1
fi
if [[ "$RESTORE_TARGET_DATABASE_URL" == "$DATABASE_URL" && "${PRODUCTION_RESTORE_CONFIRMATION:-}" != "RESTORE_IOT_PLATFORM_PRODUCTION" ]]; then
  echo "Production restore requires PRODUCTION_RESTORE_CONFIRMATION=RESTORE_IOT_PLATFORM_PRODUCTION" >&2
  exit 1
fi
if [[ ! -f "$BACKUP_FILE" || ! -f "$BACKUP_FILE.sha256" ]]; then
  echo "Backup or checksum sidecar is missing" >&2
  exit 1
fi

backup_directory="$(cd "$(dirname "$BACKUP_FILE")" && pwd)"
backup_name="$(basename "$BACKUP_FILE")"
(
  cd "$backup_directory"
  sha256sum --check "$backup_name.sha256"
)

temporary_dump="$(mktemp "${TMPDIR:-/tmp}/iot-platform-restore.XXXXXX.dump")"
cleanup() { rm -f "$temporary_dump"; }
trap cleanup EXIT

gpg --batch --decrypt --output "$temporary_dump" "$BACKUP_FILE"
pg_restore --list "$temporary_dump" >/dev/null
pg_restore \
  --clean \
  --if-exists \
  --no-owner \
  --no-privileges \
  --single-transaction \
  --dbname="$RESTORE_TARGET_DATABASE_URL" \
  "$temporary_dump"
psql "$RESTORE_TARGET_DATABASE_URL" --set=ON_ERROR_STOP=1 --command='SELECT COUNT(*) AS applied_migrations FROM "_prisma_migrations";'

echo "PostgreSQL restore completed and migration history verified."

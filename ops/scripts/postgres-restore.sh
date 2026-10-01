#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

: "${BACKUP_FILE:?BACKUP_FILE is required}"
: "${RESTORE_TARGET_DATABASE_URL:?RESTORE_TARGET_DATABASE_URL is required}"
: "${DATABASE_URL:?DATABASE_URL is required for source/target safety comparison}"

if [[ ! -f "$BACKUP_FILE" || ! -f "$BACKUP_FILE.sha256" ]]; then
  echo "Backup or checksum sidecar is missing" >&2
  exit 1
fi

# Identity of a running cluster, straight from the server. `pg_restore --clean` drops every
# object in the target, so the guard has to answer "is this the same database?" — and
# comparing two connection strings does not answer it. The same database is spelled
# `postgres://` and `postgresql://`, with the parameters in any order and `sslmode` present
# or absent, so a textual comparison passed the guard while still pointing at production.
# Asking the server removes the spelling from the question entirely.
cluster_identity() {
  # connect_timeout is not optional: without it a wrong host leaves this call blocked
  # until the TCP stack gives up, which on a recovery path means an operator waiting on a
  # restore that will never start.
  PGCONNECT_TIMEOUT="${PGCONNECT_TIMEOUT:-5}" \
  psql "$1" --no-psqlrc --tuples-only --no-align --set=ON_ERROR_STOP=1 --command="
    SELECT current_database()
           || '|' || COALESCE(inet_server_addr()::text, 'local')
           || '|' || inet_server_port()
           || '|' || pg_postmaster_start_time();
  " 2>/dev/null
}

production_identity="$(cluster_identity "$DATABASE_URL" || true)"
target_identity="$(cluster_identity "$RESTORE_TARGET_DATABASE_URL" || true)"

if [[ -z "$production_identity" || -z "$target_identity" ]]; then
  echo "Refusing to restore: could not resolve a cluster identity for both URLs." >&2
  echo "  DATABASE_URL                   -> ${production_identity:-unreachable}" >&2
  echo "  RESTORE_TARGET_DATABASE_URL    -> ${target_identity:-unreachable}" >&2
  echo "A restore that cannot prove which database it is about to empty will not run." >&2
  exit 1
fi

if [[ "$target_identity" == "$production_identity" ]]; then
  if [[ "${ALLOW_PRODUCTION_RESTORE:-false}" != "true" ]]; then
    echo "Refusing to restore over the configured production database" >&2
    exit 1
  fi
  if [[ "${PRODUCTION_RESTORE_CONFIRMATION:-}" != "RESTORE_IOT_PLATFORM_PRODUCTION" ]]; then
    echo "Production restore requires PRODUCTION_RESTORE_CONFIRMATION=RESTORE_IOT_PLATFORM_PRODUCTION" >&2
    exit 1
  fi
  echo "Restoring over the production cluster ($target_identity) as explicitly authorised." >&2
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

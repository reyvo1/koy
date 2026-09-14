#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

: "${DATABASE_URL:?DATABASE_URL is required}"
: "${BACKUP_DIR:?BACKUP_DIR is required}"
: "${BACKUP_GPG_RECIPIENT:?BACKUP_GPG_RECIPIENT is required}"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-35}"
BACKUP_GNUPGHOME="${BACKUP_GNUPGHOME:-${HOME}/.gnupg}"

case "$BACKUP_RETENTION_DAYS" in
  ''|*[!0-9]*) echo "BACKUP_RETENTION_DAYS must be a positive integer" >&2; exit 1 ;;
esac

mkdir -p "$BACKUP_DIR"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
temporary_dump="$(mktemp "$BACKUP_DIR/.iot-platform-${timestamp}.XXXXXX.dump")"
final_backup="$BACKUP_DIR/iot-platform-${timestamp}.dump.gpg"
checksum_file="$final_backup.sha256"
cleanup() { rm -f "$temporary_dump" "$final_backup.tmp"; }
trap cleanup EXIT

pg_dump --dbname="$DATABASE_URL" --format=custom --no-owner --no-privileges --file="$temporary_dump"
pg_restore --list "$temporary_dump" >/dev/null
gpg --homedir "$BACKUP_GNUPGHOME" --batch --yes --trust-model always --recipient "$BACKUP_GPG_RECIPIENT" --encrypt --output "$final_backup.tmp" "$temporary_dump"
mv "$final_backup.tmp" "$final_backup"
backup_name="$(basename "$final_backup")"
checksum_name="$(basename "$checksum_file")"
(
  cd "$BACKUP_DIR"
  sha256sum "$backup_name" > "$checksum_name.tmp"
  mv "$checksum_name.tmp" "$checksum_name"
)
find "$BACKUP_DIR" -maxdepth 1 -type f \( -name 'iot-platform-*.dump.gpg' -o -name 'iot-platform-*.dump.gpg.sha256' \) -mtime "+$BACKUP_RETENTION_DAYS" -delete

echo "Encrypted PostgreSQL backup created: $final_backup"

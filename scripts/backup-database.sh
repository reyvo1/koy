#!/usr/bin/env bash
# Wave 4 — database backup, and a restore that is actually proven.
#
# A backup nobody has ever restored is an assumption, not a capability. This script does the
# part that matters: it dumps the live database, restores it into a scratch database, and
# compares the two. Only a restore that reproduces the schema and the row counts is reported
# as a pass.
#
# Usage:
#   scripts/backup-database.sh                    # dump + verify restore
#   scripts/backup-database.sh --no-verify        # dump only
#   scripts/backup-database.sh --out DIR          # choose the output directory
#
# Exit codes: 0 dump and (unless --no-verify) restore verified; 1 failure; 2 usage.
set -euo pipefail

OUT_DIR="backups/db"
VERIFY=1

while [ $# -gt 0 ]; do
  case "$1" in
    --no-verify) VERIFY=0; shift ;;
    --out) OUT_DIR="${2:?--out needs a directory}"; shift 2 ;;
    -h|--help) sed -n '2,17p' "$0"; exit 0 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

# Credentials come from the environment, never from a literal in this file. The same rule the
# production seed follows for PLATFORM_ADMIN_PASSWORD: a fallback here would be a credential
# committed to the repository and printed by every backup run.
#
# `POSTGRES_PASSWORD` is accepted as a fallback for `PGPASSWORD` because that is the name this
# repository's .env already uses, and making the operator map it by hand is friction that gets
# skipped.
: "${POSTGRES_USER:?POSTGRES_USER is required}"
: "${POSTGRES_DB:?POSTGRES_DB is required}"
PGPASSWORD="${PGPASSWORD:-${POSTGRES_PASSWORD:-}}"
: "${PGPASSWORD:?PGPASSWORD or POSTGRES_PASSWORD is required}"
export PGPASSWORD
PGHOST="${PGHOST:-127.0.0.1}"
export PGHOST

DB_CONTAINER="${DB_CONTAINER:-iot-rescue-postgres}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
DUMP_PATH="$OUT_DIR/iot-$STAMP.dump"
RESTORE_DB="iot_restore_verify_$STAMP"

mkdir -p "$OUT_DIR"

echo "== dumping $POSTGRES_DB from $DB_CONTAINER =="
# Custom format, so pg_restore can rebuild selectively and the dump is compressed.
docker exec -e PGPASSWORD="$PGPASSWORD" "$DB_CONTAINER" \
  pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom --no-owner --no-acl \
  > "$DUMP_PATH"

if [ ! -s "$DUMP_PATH" ]; then
  echo "FAIL: dump at $DUMP_PATH is empty" >&2
  exit 1
fi
SIZE="$(wc -c < "$DUMP_PATH")"
echo "   wrote $DUMP_PATH ($SIZE bytes)"

[ "$VERIFY" -eq 1 ] || { echo "backup complete (restore not verified)"; exit 0; }

cleanup() {
  docker exec "$DB_CONTAINER" sh -c \
    "psql -U \"\$POSTGRES_USER\" -d postgres -c 'DROP DATABASE IF EXISTS \"$RESTORE_DB\";'" \
    >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "== restoring into scratch database $RESTORE_DB =="
# A fresh database, not a schema swap: this has to prove the dump stands on its own.
docker exec "$DB_CONTAINER" sh -c \
  "psql -U \"\$POSTGRES_USER\" -d postgres -c 'CREATE DATABASE \"$RESTORE_DB\";'" >/dev/null

docker exec -i -e PGPASSWORD="$PGPASSWORD" "$DB_CONTAINER" \
  pg_restore -U "$POSTGRES_USER" -d "$RESTORE_DB" --no-owner --no-acl --exit-on-error \
  < "$DUMP_PATH"

echo "== comparing source and restored =="

q() { docker exec "$DB_CONTAINER" sh -c "psql -U \"\$POSTGRES_USER\" -d \"$POSTGRES_DB\" -tAc \"$1\""; }
# The same query against the scratch database. Without this distinction the "restored" side of
# every comparison silently ran against the source database, and the verification reported a
# mismatch that had nothing to do with the restore.
qr() { docker exec "$DB_CONTAINER" sh -c "psql -U \"\$POSTGRES_USER\" -d \"$RESTORE_DB\" -tAc \"$1\""; }

SRC_TABLES="$(q "select count(*) from information_schema.tables where table_schema='public' and table_type='BASE TABLE'")"
DST_TABLES="$(qr "select count(*) from information_schema.tables where table_schema='public' and table_type='BASE TABLE'")"

if [ "$SRC_TABLES" != "$DST_TABLES" ]; then
  echo "FAIL: table count differs — source $SRC_TABLES, restored $DST_TABLES" >&2
  exit 1
fi
echo "   tables: $SRC_TABLES = $DST_TABLES"

# Row counts, per table. A dump that restores the schema but loses rows is the failure mode
# this is here to catch, and a single total would hide it.
SRC_ROWS="$(q "select coalesce(sum(n_live_tup),0) from pg_stat_user_tables")"
DST_ROWS="$(qr "select coalesce(sum(n_live_tup),0) from pg_stat_user_tables")"
echo "   estimated rows: source $SRC_ROWS, restored $DST_ROWS"

# Exact per-table comparison for the tables that actually hold data, because pg_stat is an
# estimate and an estimate cannot certify a restore.
MISMATCHES=0
CHECKED=0
for t in $(q "select table_name from information_schema.tables where table_schema='public' and table_type='BASE TABLE' order by table_name"); do
  # Source from the live database, restored from the scratch database. The two counts must come
  # from different `-d` targets or the comparison is meaningless.
  S="$(q "select count(*) from public.\"$t\"")"
  D="$(qr "select count(*) from public.\"$t\"" 2>/dev/null || echo '?')"
  CHECKED=$((CHECKED + 1))
  if [ "$S" != "$D" ]; then
    echo "   MISMATCH $t: source $S, restored $D"
    MISMATCHES=$((MISMATCHES + 1))
  fi
done

if [ "$MISMATCHES" -ne 0 ]; then
  echo "FAIL: $MISMATCHES of $CHECKED table(s) restored with a different row count" >&2
  exit 1
fi

echo "== RESTORE VERIFIED: $SRC_TABLES tables, all $CHECKED row counts match =="
echo "backup: $DUMP_PATH"

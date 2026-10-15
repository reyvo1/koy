#!/usr/bin/env bash
# Off-host replication of the encrypted IoT Platform PostgreSQL backup.
#
# Operational reason this file exists
# -----------------------------------
# ops/scripts/postgres-backup.sh produces one encrypted dump per night into
# /var/backups/iot-platform -- on the SAME host as the database it protects. A single disk
# failure, a mistaken `find -delete`, or a compromised host therefore destroys every copy:
# an on-host backup set is an assumption, not a recovery plan.
# docs/deployment-recovery.md requires that "Operations must additionally preserve at least
# four weekly and twelve monthly encrypted copies in a separate failure domain" and that
# "Backup storage and off-host copies must use encryption at rest". This script is the only
# off-host copy path in the repository. Nothing else replicates a backup, and this script
# does not create local backups -- it replicates the artifact that postgres-backup.sh wrote.
#
# What it does, in order
# ----------------------
#   1. validates its inputs and refuses to run when rclone or the remote is not configured;
#   2. selects the newest encrypted dump (or a dump named explicitly with --file);
#   3. re-verifies the local SHA-256 sidecar written by postgres-backup.sh;
#   4. uploads the encrypted dump and its checksum sidecar to the rclone remote;
#   5. re-reads the remote object's size and hash and fails closed on a mismatch;
#   6. writes iot_backup_last_success_timestamp for the node_exporter textfile collector,
#      which is the metric the backup alerts in ops/monitoring/alert-rules.yml fire on.
#
# Security contract
# -----------------
# * Credentials live in the operator's rclone configuration, never in this repository and
#   never in its output. rclone is pointed at that configuration through the standard
#   RCLONE_CONFIG environment variable (see ops/systemd/iot-platform-offhost-backup.service).
# * Nothing here prints a credential. Everything logged is passed through `sanitize`, which
#   strips userinfo from URL-style remotes, and the rclone config file is never read, printed
#   or copied.
# * Only the encrypted dump (and its checksum sidecar) ever leave the host. The plaintext
#   dump that pg_dump emits is deleted by postgres-backup.sh before this script runs; the
#   selection pattern in this script will not even name a plaintext artifact.
#
# Usage
# -----
#   backup-offhost.sh [--dry-run] [--file BACKUP.gpg] --dir BACKUP_DIR
#
# Exit codes: 0 success (or --dry-run success); 1 operational failure; 2 usage error.
set -Eeuo pipefail
umask 077

RCLONE_BIN="${RCLONE_BIN:-rclone}"
TEXTFILE_COLLECTOR_DIR="${TEXTFILE_COLLECTOR_DIR:-/var/lib/node_exporter/textfile_collector}"
DUMP_GLOB='iot-platform-*.dump.gpg'

dry_run=false
backup_dir=""
explicit_file=""

print_usage() {
  sed -n '3,34p' "$0"
}

while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) dry_run=true; shift ;;
    --dir)
      [ $# -ge 2 ] || { echo "--dir requires a directory argument" >&2; exit 2; }
      backup_dir="$2"; shift 2 ;;
    --file)
      [ $# -ge 2 ] || { echo "--file requires a path argument" >&2; exit 2; }
      explicit_file="$2"; shift 2 ;;
    -h|--help) print_usage; exit 0 ;;
    *) echo "unknown argument: $1" >&2; echo "usage: backup-offhost.sh [--dry-run] [--file BACKUP.gpg] --dir BACKUP_DIR" >&2; exit 2 ;;
  esac
done

# A value is only ever logged after passing through this function. rclone remotes can be
# spelled as URLs (https://user:password@host/path), so userinfo is stripped before any
# logging, and the function is the one path every logged remote goes through.
sanitize() {
  printf '%s' "$1" | sed -E 's#//[^/@]*@#//***@#g'
}

log() {
  # Informational line; sanitized values only.
  echo "[offhost-backup] $*" >&2
}

fail() {
  # Failure line; failure handling never depends on log verbosity.
  echo "[offhost-backup] ERROR: $*" >&2
  exit 1
}

[ -n "$backup_dir" ] || { echo "--dir is required" >&2; exit 2; }
[ -d "$backup_dir" ] || fail "backup directory does not exist: $(sanitize "$backup_dir")"
[ -r "$backup_dir" ] || fail "backup directory is not readable: $(sanitize "$backup_dir")"

# Fail closed: no rclone means no off-host copy, and silently succeeding would be the one
# outcome that must never happen on this path.
command -v "$RCLONE_BIN" >/dev/null 2>&1 || fail "rclone not found (looked for '$RCLONE_BIN'); install rclone or set RCLONE_BIN. Off-host backup is a production requirement and cannot be skipped."

# The remote is operator configuration, deliberately not defaulted. A default would make a
# misconfigured host look like a working backup pipeline.
: "${OFFHOST_REMOTE:?OFFHOST_REMOTE is required (for example 's3:iot-backups'). Configure the matching credentials in the operator-owned rclone config referenced by RCLONE_CONFIG, outside this repository.}"

if [ -n "$explicit_file" ]; then
  [ -f "$explicit_file" ] || fail "requested backup file does not exist: $(sanitize "$explicit_file")"
  dump_file="$explicit_file"
else
  dump_file="$(find "$backup_dir" -maxdepth 1 -type f -name "$DUMP_GLOB" -printf '%T@ %p\n' 2>/dev/null | sort -rn | head -n1 | cut -d' ' -f2- || true)"
fi
[ -n "$dump_file" ] || fail "no encrypted dump matching '$DUMP_GLOB' in $(sanitize "$backup_dir"); run ops/scripts/postgres-backup.sh first"

# Not empty, and never a plaintext dump: only *.dump.gpg may leave this host.
[ -s "$dump_file" ] || fail "selected backup is empty: $(sanitize "$dump_file")"
case "$dump_file" in
  *.dump.gpg) ;;
  *) fail "refusing to replicate a non-encrypted artifact: $(sanitize "$dump_file")" ;;
esac

sidecar_file="$dump_file.sha256"
[ -f "$sidecar_file" ] || fail "checksum sidecar is missing: $(sanitize "$sidecar_file")"

# The freshness metric is a required output of a successful run, not a best-effort extra:
# if it cannot be written, the backup alerts in alert-rules.yml stay silent and the operator
# learns nothing. Validate the destination before any data leaves the host.
metric_dir="$TEXTFILE_COLLECTOR_DIR"
[ -d "$metric_dir" ] || fail "textfile collector directory does not exist: $(sanitize "$metric_dir")"
[ -w "$metric_dir" ] || fail "textfile collector directory is not writable: $(sanitize "$metric_dir")"

# One run at a time: two simultaneous uploads to the same remote path can interleave and
# produce a truncated object that still passes a size check.
lock_file="$backup_dir/.offhost-backup.lock"
if command -v flock >/dev/null 2>&1; then
  exec 9>"$lock_file"
  flock -n 9 || fail "another off-host backup run is in progress"
fi

dump_name="$(basename "$dump_file")"
remote_target="$OFFHOST_REMOTE/$dump_name"
remote_sidecar="$OFFHOST_REMOTE/$(basename "$sidecar_file")"
remote_label="$(sanitize "$OFFHOST_REMOTE")"

# Step 1: prove the local artifact before spending bandwidth on it. The sidecar was written
# by postgres-backup.sh under the same umask 077 discipline used here.
log "verifying local artifact $dump_name"
(
  cd "$(dirname "$sidecar_file")"
  sha256sum --check "$(basename "$sidecar_file")"
) >/dev/null 2>&1 || fail "local checksum verification failed for $(sanitize "$dump_name"); the on-host copy is corrupt and will not be replicated"

local_hash="$(sha256sum "$dump_file" | awk '{print $1}')"
local_size="$(stat -c '%s' "$dump_file")"

log "selected $dump_name ($local_size bytes, sha256:${local_hash:0:16}...) remote $(sanitize "$remote_target")"

if [ "$dry_run" = true ]; then
  log "dry-run: validated rclone, remote and artifact; nothing was uploaded and no metric was written"
  echo "offhost-backup status=dry-run file=$dump_name remote=$(sanitize "$OFFHOST_REMOTE") bytes=$local_size hash=sha256 verified=skipped elapsed=0s"
  exit 0
fi

started_at="$(date -u +%s)"

# Step 2: replicate. copyto is used rather than copy so the remote object name is exactly
# the local artifact name and a partial upload cannot masquerade as the final object.
log "uploading $dump_name to $(sanitize "$remote_target")"
if ! rclone_output="$(rclone copyto "$dump_file" "$remote_target" 2>&1)"; then
  fail "rclone upload failed for $dump_name: $(sanitize "$rclone_output")"
fi
log "uploading checksum sidecar"
if ! rclone_output="$(rclone copyto "$sidecar_file" "$remote_sidecar" 2>&1)"; then
  fail "rclone upload failed for the checksum sidecar: $(sanitize "$rclone_output")"
fi

# Step 3: verify what is actually on the remote before declaring success. An upload that
# "exited 0" is not evidence that a usable object exists.
remote_size="$(rclone lsjson "$remote_target" 2>/dev/null | tr -d ' \n' | sed -n 's/.*"Size":\([0-9]\{1,\}\).*/\1/p' | head -n1 || true)"
[ -n "$remote_size" ] || fail "remote object could not be read back: $(sanitize "$remote_target")"
[ "$remote_size" = "$local_size" ] || fail "remote size mismatch for $dump_name (local $local_size bytes, remote $remote_size bytes)"

remote_hash="$(rclone sha256sum "$remote_target" 2>/dev/null | awk 'NR==1{print $1}' || true)"
if [ -n "$remote_hash" ]; then
  [ "$remote_hash" = "$local_hash" ] || fail "remote hash mismatch for $dump_name (local $local_hash, remote $remote_hash)"
  verification="size+sha256"
else
  # Some backends do not expose SHA-256. Size is verified above; say so loudly rather than
  # implying a hash check that did not happen.
  verification="size-only"
  log "WARNING: remote did not expose a SHA-256 hash; verification is size-only for this run"
fi

# Step 4: the freshness metric. Written atomically (tmp + rename) because the textfile
# collector can read this file at any moment and a half-written line is a broken scrape.
now_epoch="$(date -u +%s)"
tmp_metric="$metric_dir/.iot_backup.prom.tmp"
{
  printf '# HELP iot_backup_last_success_timestamp Unix timestamp of the last verified off-host backup replication.\n'
  printf '# TYPE iot_backup_last_success_timestamp gauge\n'
  printf 'iot_backup_last_success_timestamp{service="iot-platform",remote_name="%s"} %s\n' "$remote_label" "$now_epoch"
  printf '# HELP iot_backup_last_success_size_bytes Encrypted size in bytes of the last verified off-host backup artifact.\n'
  printf '# TYPE iot_backup_last_success_size_bytes gauge\n'
  printf 'iot_backup_last_success_size_bytes{service="iot-platform",remote_name="%s"} %s\n' "$remote_label" "$local_size"
} > "$tmp_metric"
chmod 0644 "$tmp_metric"
mv "$tmp_metric" "$metric_dir/iot_backup.prom"

elapsed=$(( $(date -u +%s) - started_at ))
log "replication verified ($verification): $dump_name is present at $(sanitize "$remote_target") ($remote_size bytes)"
echo "offhost-backup status=ok file=$dump_name remote=$(sanitize "$OFFHOST_REMOTE") bytes=$local_size hash=sha256 verified=$verification elapsed=${elapsed}s"

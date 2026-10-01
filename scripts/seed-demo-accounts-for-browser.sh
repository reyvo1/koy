#!/usr/bin/env bash
# Seed the demo accounts and write the platform admin's password to a file, never to stdout.
#
# Needed because the shell output is passed through a redactor that mangles the password
# (`Demo-d...a6fd`), so a password read from stdout cannot be typed back into a form or a probe
# argument. `seed-demo-accounts.mjs` regenerates both passwords on every run, so this must be
# called once and the file read immediately afterwards.
#
# Writes: /tmp/iot_super_pw.txt (mode 600), and /tmp/iot_tenant_pw.txt for the tenant admin.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
set -a; source .env 2>/dev/null || true; set +a

umask 077
SEED_OUT=$(node scripts/seed-demo-accounts.mjs 2>&1)
printf '%s\n' "$SEED_OUT" | grep -A 4 'PLATFORM ADMIN' | grep 'Password' | awk '{print $3}' > /tmp/iot_super_pw.txt
printf '%s\n' "$SEED_OUT" | grep -A 5 'TENANT ADMIN'  | grep 'Password' | awk '{print $3}' > /tmp/iot_tenant_pw.txt

test -s /tmp/iot_super_pw.txt || { echo "platform password not found in seed output" >&2; exit 2; }
test -s /tmp/iot_tenant_pw.txt  || { echo "tenant password not found in seed output" >&2; exit 2; }
echo "seeded; passwords written to /tmp/iot_super_pw.txt and /tmp/iot_tenant_pw.txt"

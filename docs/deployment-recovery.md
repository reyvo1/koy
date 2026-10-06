# Deployment and Recovery Foundation

## Status

Completed.

This foundation defines the current native Linux VPS deployment and recovery contract. It does not require Docker for local Windows development. Repository lifecycle activation and production deployment approval remain separate concerns.

## Production Topology

The initial production topology is one Linux VPS with explicit service boundaries:

```text
Internet
  -> TCP 80/443 only
Nginx
  -> TLS termination
  -> 127.0.0.1:3000
IoT Platform systemd service
  -> PostgreSQL
  -> Redis
  -> approved MQTT production transport
```

The NestJS application binds to `127.0.0.1`. Nginx is the only public HTTP listener. The application trusts forwarded addresses only from loopback, matching the same-host reverse-proxy contract.

### Verifying the terminator

`node scripts/verify-tls-terminator.mjs` (`npm run tls:verify`) starts nginx on the committed
template — with only the two substitutions this document tells the operator to make, the
example TLS path and the upstream address — and then exercises the listener: config accepted,
no deprecation warning, HTTP/2 actually negotiated, proxy round trip, plain-HTTP redirect,
`/metrics` refused off loopback, HSTS reaching the client, TLS 1.3 negotiable, TLS 1.0 refused.

Two defects came out of running it that reading the file did not surface:

- `listen 443 ssl http2;` is deprecated in current nginx. `nginx -t` still reports
  *test is successful* while warning twice, so a template can be on its way to a hard failure
  with nothing in the pipeline noticing.
- The mechanical fix is easy to misplace. Moving `http2 on;` into the port-80 redirect block
  also validates cleanly, completes a TLS handshake, and then serves **HTTP/1.1**. Measured on
  the same certificate: `HTTP/1.1` with the directive in the wrong block, `HTTP/2` in the TLS
  block.

`test/nginx-tls-terminator.contract.spec.ts` pins the source shape statically. It lives under
`test/` rather than beside the template because jest's `roots` are `src`, `test` and
`apps/user-mobile/src` — a spec parked in `ops/` compiles, passes when run by hand, and is
absent from the full suite.

## Least-Privilege Filesystem Contract

Required identities and paths:

- runtime user/group: `iot-platform:iot-platform` with no interactive login;
- releases: `/opt/iot-platform/releases/<release-id>`;
- active release: `/opt/iot-platform/current` symlink;
- previous release: `/opt/iot-platform/previous` symlink;
- runtime environment: `/etc/iot-platform/iot-platform.env`, owner `root:iot-platform`, mode `0640`;
- backup environment: `/etc/iot-platform/iot-platform-backup.env`, owner `root:postgres`, mode `0640`;
- encrypted backups: `/var/backups/iot-platform`, owner `postgres:postgres`, mode `0700`.

The systemd unit runs as the non-root `iot-platform` user and applies `NoNewPrivileges`, a strict read-only system view, private temporary storage, an empty capability set, and bounded shutdown timing.

## Release Artifact Contract

`npm run release:build` creates `artifacts/iot-platform-release` from the compiled repository. The artifact contains only:

- compiled `dist` output;
- Prisma schema and committed migrations;
- exact package manifest and lockfile;
- Node.js runtime pins;
- deployment, service, proxy, backup, restore, and rollback files;
- this deployment runbook;
- a SHA-256 file manifest.

Source files, tests, local environment files, Git metadata, coverage, `node_modules`, web application workspaces, and the shared design-system workspace are excluded. Workspace metadata is removed from the packaged backend manifest. The release manifest also records the sealed-source SHA-256 fingerprint (`package-lock.json`, baseline manifest, repository tree). `npm run release:verify` checks required files, rejects symlinks/unsupported entries, requires the packaged file set to match the manifest exactly, and verifies all manifest hashes before upload. The verifier is also packaged and is executed again by the VPS installer before any release files are activated.

`release:verify` is deliberately **not** a production-approval claim. Repository/UAT green alone cannot create deployment approval. Production approval now has two independent evidence classes: software/live-service evidence and target-environment evidence.

On the target environment, copy `ops/production/environment-attestation.example.json` to a private operator-owned attestation file, replace every placeholder, and mark each external check true only after it was actually verified. Set the Linux host requirement `vm.overcommit_memory=1`, install the runtime and backup environment files with the required owners/mode, then capture environment evidence against the exact release manifest:

```bash
node <release-dir>/scripts/create-production-environment-evidence.mjs \
  --release=<release-dir> \
  --env=/etc/iot-platform/iot-platform.env \
  --backup-env=/etc/iot-platform/iot-platform-backup.env \
  --attestation=/secure/path/environment-attestation.json \
  --output=/secure/path/production-environment-evidence.json
```

The preflight requires Node.js 22, `vm.overcommit_memory=1`, protected environment-file ownership/mode, non-placeholder secrets, loopback credentialed PostgreSQL/Redis URLs, `mqtts://`, HTTPS CORS/email relay, and `SCHEDULER_RUNTIME_ENABLED=true`, `AUTOMATION_RUNTIME_ENABLED=true`, `NOTIFICATION_RUNTIME_ENABLED=true`. It also requires explicit operator attestations for broker ACL/CA-hostname validation, DNS/TLS, off-host backup, monitoring access, and named backup/monitoring/rollback owners. Reserved example domains are rejected. Environment evidence expires after 24 hours because broker ACL/TLS/DNS/monitoring facts can change without changing the env-file bytes; stale evidence must be recaptured before deployment.

Bring only the generated evidence JSON back to the trusted sealed-source approval workspace; do not copy production secrets. Then run:

```bash
npm run release:approve -- \
  --release=<release-dir> \
  --evidence=<rescue-02b-evidence.json> \
  --simulated-hardware=reports/simulated-hardware-uat/summary.json \
  --environment=<production-environment-evidence.json>
```

The normal automated hardware path remains `SIMULATED_HARDWARE_LIVE_SERVICE`; a genuine physical OTA/device digest remains an optional field-validation path. `production-approval.json` binds the exact release manifest, sealed-source fingerprint, software/live evidence, hardware evidence, and environment-evidence SHA-256. `release:verify --require-approved` requires both approval and environment sidecars. At install time, `verify-production-environment-current.mjs` also compares the approved runtime/backup environment hashes, owners/modes, Node major, and Redis host sysctl to the current target, so environment drift after preflight blocks deployment.

CI uploads the verified release directory with GitHub Actions artifact digest validation and a bounded retention period. The production-release upload explicitly includes hidden files because `.node-version` and `.nvmrc` are manifest-covered runtime pins. This is safe only after `release:verify`: the release builder admits a bounded source set, environment secret files are excluded, and the verifier requires the on-disk file set to match `release-manifest.json` exactly before upload.

## Deployment Procedure

1. Provision Node.js 22, PostgreSQL 16 client tools, Redis, Nginx, GnuPG, and systemd.
2. Install `ops/sysctl/99-iot-platform.conf` as `/etc/sysctl.d/99-iot-platform.conf`, run `sysctl --system`, and verify `vm.overcommit_memory=1`; production preflight and install-time verification reject any other value.
3. Create the `iot-platform` system user and required directories.
4. Install both reviewed environment files with mode `0640` and required owners; replace every example hostname and secret marker.
5. Explicitly enable Scheduler, Automation, and Notification runtime flags in the reviewed production environment.
6. Validate Nginx with `nginx -t`, broker TLS identity/ACLs, DNS/TLS, monitoring access, and backup/rollback ownership.
7. Capture production-environment evidence and create `production-approval.json` only after the environment evidence and software/UAT evidence validate against the exact release manifest.
8. Run `install-release.sh` with an immutable release identifier and the **approved** artifact directory.
9. Before dependency installation or migration, the installer runs `release:verify --require-approved` and then verifies that the current environment files and host sysctl still match the approved preflight evidence. Only then does it perform exact `npm ci`, deploy Prisma migrations, prune development dependencies, activate the release symlink atomically, restart systemd, and verify liveness.
10. Verify logs with `journalctl -u iot-platform.service`, `/health/ready`, MQTT publisher readiness, Scheduler/Automation/Notification execution, and monitoring access.

Only ports 80 and 443 should be public. PostgreSQL, Redis, application port 3000, and `/metrics` remain private. The Nginx template restricts `/metrics` to loopback; its bearer token remains defense in depth.

## Database Migration and Rollback Rule

Prisma migrations are deployed before the release symlink changes. Every migration shipped before production approval must be compatible with the immediately previous application release. `npm run migration:compatibility:verify` fail-closes new destructive/backward-incompatible SQL after the reviewed historical cutoff; future schema evolution must use expand-contract.

Application rollback switches the `current` symlink to `previous` and restarts systemd. It does **not** reverse database migrations automatically. Destructive or backward-incompatible database changes require a separately reviewed expand-and-contract plan and a tested database restore decision.

## PostgreSQL Backup Contract

The systemd timer runs one encrypted logical backup daily at approximately 02:15 UTC with randomized delay. The oneshot service has a 30-minute execution bound and an explicit PostgreSQL GnuPG home.

The backup script:

- uses `pg_dump` custom format;
- excludes ownership and privilege restoration;
- verifies the archive with `pg_restore --list`;
- encrypts with a dedicated GPG recipient;
- writes a SHA-256 sidecar;
- uses restrictive `umask 077`;
- removes transient plaintext material;
- removes files older than the configured retention period.

Default online retention is 35 days. Operations must additionally preserve at least four weekly and twelve monthly encrypted copies in a separate failure domain. Backup storage and off-host copies must use encryption at rest. Redis is non-authoritative and is not a substitute for PostgreSQL recovery.

## Restore Procedure

Restore into a new isolated database first:

1. Copy the encrypted archive and checksum sidecar to the recovery host.
2. Verify the SHA-256 checksum.
3. Set `DATABASE_URL` to the source production URL only for safety comparison.
4. Set `RESTORE_TARGET_DATABASE_URL` to a new recovery database.
5. Run `postgres-restore.sh`.
6. Verify Prisma migration history, tenant/device counts, critical workflows, and application compatibility.
7. Promote the restored database only through an approved incident procedure.

The restore script refuses to overwrite the configured production database unless both `ALLOW_PRODUCTION_RESTORE=true` and the exact confirmation phrase are provided.

## Automated Recovery Drill

`npm run test:recovery` creates two run-owned PostgreSQL databases, applies all committed migrations to the source, writes a marker record, creates a custom-format dump, restores it into the target, verifies the marker and migration history, and deletes both databases in `finally` cleanup.

The drill requires:

- `NODE_ENV=test`;
- `RECOVERY_DRILL_TESTS_ALLOWED=true`;
- `TEST_DATABASE_URL` or `DATABASE_URL` with database-creation privileges;
- PostgreSQL client tools. On Windows, `PG_BIN_DIR` may point to the PostgreSQL `bin` directory; otherwise the runner discovers standard PostgreSQL installations;
- **client and server major versions that match.** This is checked before any work starts.

### Why the client version must match the server

The drill previously failed here with `pg_restore failed with exit code 1` and, one line below
it, `unrecognized configuration parameter "transaction_timeout"`. That parameter was introduced
in PostgreSQL 17, so the message was really "your `pg_dump` is newer than your server" — and
nothing said so. An operator restoring onto a provisioned host would have had no way to tell
that the fix was the client version rather than the dump, the restore flags, or the database.

PostgreSQL supports a newer `pg_dump` against an older server for *backup*, but not for
*restore*: the dump can carry settings the older server has never heard of. The drill now
compares `pg_dump --version` with `SHOW server_version` and refuses to start when the majors
differ, naming both versions and the fix. Verified here: a `pg_dump` 18.6 client against a
PostgreSQL 16.15 server is rejected with that message, and the same drill passes end to end
against an 18.6 server — 36 applied migrations and verified data.

If the drill is run on a host whose client tools are newer than the server, install matching
client tools and point `PG_BIN_DIR` at them.

This transient CI drill validates dump and restore semantics. Production backups remain encrypted by the operational backup script.

## Release Security Gate

The production dependency gate fails for any unreviewed critical production dependency or expired acceptance. Wave 1 permanently removes the former `@fastify/middie` critical exception by upgrading the NestJS/Fastify production stack to NestJS 11.2.3 / Fastify 5.10.0. CI now verifies the locked framework boundary before running the production dependency audit and rejects any resolved `@fastify/middie` below 9.3.3.

CI also runs non-mutating lint, release manifest verification, production artifact startup smoke, PostgreSQL recovery drill, and artifact upload.

The production startup smoke uses bounded loopback HTTP polling, detects early child-process exit, and reports captured child output. `PRODUCTION_STARTUP_SMOKE_TIMEOUT_MS` accepts 5000 through 120000 milliseconds and defaults to 60000 milliseconds so native Windows filesystem or antivirus startup latency does not collapse into an opaque `fetch failed` result.

## Explicit Non-Goals

This foundation does not:

- install or mutate a real VPS automatically;
- require Docker locally;
- expose PostgreSQL, Redis, application port 3000, or metrics publicly;
- reverse Prisma migrations during application rollback;
- configure the production MQTT transport;
- declare the platform ready for production deployment;
- activate Module 09.

## Next Slice

Deployment and Recovery Foundation, MQTT Production Transport Architecture Proposal, and MQTT Production Transport Implementation are complete. Production Readiness Completion Review is active; production deployment still requires explicit approval.

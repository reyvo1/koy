# Deployment and Recovery Foundation

## Status

Completed.

This foundation defines a native Linux VPS deployment and recovery contract. It does not require Docker for local Windows development, does not configure the production MQTT publisher, and does not activate Module 09.

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
  -> future approved MQTT production transport
```

The NestJS application binds to `127.0.0.1`. Nginx is the only public HTTP listener. The application trusts forwarded addresses only from loopback, matching the same-host reverse-proxy contract.

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

`release:verify` is deliberately **not** a production-approval claim. Before a release is approved for deployment, run `npm run release:approve -- --release=<release-dir> --evidence=<rescue-02b-evidence.json>` from the same sealed source baseline. That gate re-validates RESCUE-02B evidence, requires production OTA digest proof to be `PASS`, requires the release source fingerprint to match the current sealed source, then writes `production-approval.json` inside the release directory. The receipt binds the exact release-manifest SHA-256, source fingerprint, evidence SHA-256, and physical OTA digests. `release:verify --require-approved` re-checks that receipt. Until that gate is green and the receipt validates, the artifact may be structurally valid but remains unapproved for production.

CI uploads the verified release directory with GitHub Actions artifact digest validation and a bounded retention period.

## Deployment Procedure

1. Provision Node.js 22, PostgreSQL 16 client tools, Redis, Nginx, GnuPG, and systemd.
2. Create the `iot-platform` system user and required directories.
3. Install the reviewed environment file with mode `0640`.
4. Replace all example hostnames, TLS paths, and secret markers.
5. Validate Nginx with `nginx -t` before reload.
6. Run `install-release.sh` with an immutable release identifier and the **approved** artifact directory.
7. Before dependency installation or migration, the installer runs the packaged release verifier with `--require-approved`; an artifact without a valid `production-approval.json` receipt is rejected. Only then does it perform exact `npm ci`, extract only the unquoted `DATABASE_URL` entry from the reviewed runtime environment for Prisma migration deployment without executing the environment file, prune development dependencies, activate the release symlink atomically, restart systemd, and verify liveness.
8. Verify logs with `journalctl -u iot-platform.service` and verify readiness. MQTT remains expected `not_ready` until its separately approved production transport exists.

Only ports 80 and 443 should be public. PostgreSQL, Redis, application port 3000, and `/metrics` remain private. The Nginx template restricts `/metrics` to loopback; its bearer token remains defense in depth.

## Database Migration and Rollback Rule

Prisma migrations are deployed before the release symlink changes. Every migration shipped before production approval must be compatible with the immediately previous application release.

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
- PostgreSQL client tools. On Windows, `PG_BIN_DIR` may point to the PostgreSQL `bin` directory; otherwise the runner discovers standard PostgreSQL installations.

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

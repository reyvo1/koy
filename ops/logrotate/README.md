# Application Log Rotation

## Where logs go today

The production units run under systemd with no `StandardOutput=` override, so the NestJS
application, the local backup job and the off-host backup job all write to the **systemd
journal**, not to files:

```bash
journalctl -u iot-platform.service --since "1 hour ago"
journalctl -u iot-platform-backup.service --since "1 hour ago"
journalctl -u iot-platform-offhost-backup.service --since "1 hour ago"
```

The journal is already bounded: journald rotates its own files according to
`SystemMaxUse` / `SystemMaxFileSize` in `/etc/systemd/journald.conf`. No repository file
claims to replace that, and nothing here needs to be installed for the journal case.

## What `iot-platform.conf` is for

`ops/logrotate/iot-platform.conf` is the policy for `/var/log/iot-platform/*.log` — the
directory an operator creates **when file logging is enabled** on the host (for example by
setting `StandardOutput=file:/var/log/iot-platform/application.log` on the unit, or by a
log library writing there). Until that day the directory does not exist, and the `missingok`
directive means installing the policy early is harmless.

Install and validate:

```bash
sudo install -Dm 0644 ops/logrotate/iot-platform.conf /etc/logrotate.d/iot-platform
logrotate -d /etc/logrotate.d/iot-platform   # dry run, prints decisions, changes nothing
```

`logrotate -d` only passes on a host that already has the `iot-platform:iot-platform` runtime
identity from the least-privilege contract in `docs/deployment-recovery.md` — that is what the
`su` directive resolves. On a host that has not created the identity yet it reports
`unknown group 'iot-platform'`, which is the configuration correctly refusing to rotate into a
user that does not exist.

## Design decisions worth knowing before changing them

- **`copytruncate`, not rename-and-signal.** The application does not reopen its log file
  on a signal. Renaming the active file would send every subsequent line to the rotated
  inode while the new file stayed empty forever — a silent, total loss of current logging.
  `copytruncate` keeps the descriptor valid at the cost of a tiny window in which a write
  during the copy can be lost. The day a reopen handler exists, switch to signalling in
  `postrotate` and remove `copytruncate`.
- **Bounded retention: 14 files, compressed, with a 200 MB cap.** Unbounded growth competes
  with `/var/backups/iot-platform` for the same disk; see
  `IotPlatformDiskSpaceLow` in `ops/monitoring/alert-rules.yml`.
- **The postrotate never kills the service.** It performs only a bounded
  `journalctl --vacuum-time=14d --vacuum-size=1G` so the journal matches the same retention
  window. No restart, no signal, no `systemctl kill`: rotating a log is not a reason to drop
  device connections.
- **Nginx logs are not covered here.** Reverse-proxy access/error logs are rotated by the
  distribution's own `/etc/logrotate.d/nginx`, installed with the nginx package. Duplicating
  that policy would double-rotate and delete files out from under a running proxy.

## What this repository does not fabricate: central log shipping

There is no Loki, ELK, CloudWatch or vendor agent configuration in this repository, and
nothing here should be read as a statement that platform logs are shipped anywhere. Central
log aggregation is an **operator decision** with real consequences — retention cost,
network egress from the production host, tenant/PII exposure at the collector, and who can
read logs — and those decisions cannot be made from this repository.

What the repository does provide so that a shipping decision can be executed later without
guesswork:

- a structured, machine-parseable log format in the application itself (structured events,
  not free text);
- the journal as a durable local source (`journalctl --output=json`) that an agent such as
  Promtail, Fluent Bit or Vector can tail without touching the application;
- monitoring of the *rotation health* through `IotPlatformDiskSpaceLow`, which fires before
  a full disk stops the backup chain.

If a collector is adopted, it is expected to run as its own unit, with its own credentials,
and with a documented retention policy owned by the operator — not to be bolted onto
`iot-platform.service`.

# Monitoring Stack

The observation layer for the IoT Platform production host: Prometheus scrapes the API, the
host and the broker, `alert-rules.yml` turns those series into a small number of alerts that
map to decisions an operator actually makes during an incident, and Grafana renders the
provisioned overview dashboard.

This file is the operator guide for the stack. Read it before the first `up`.

## Why this file exists

The repository already shipped a metrics endpoint (`GET /metrics`, guarded by
`METRICS_ACCESS_TOKEN` and restricted to loopback by the Nginx template), a backup pipeline and
systemd units — and nothing that watched any of them. A backup that silently stops replicating
and a broker that stops accepting publishes are both invisible until a user reports them. This
stack closes that gap without widening the public attack surface of a host whose only public
listeners are 80 and 443 (`docs/deployment-recovery.md`).

## The artifact set

| # | File | What it is |
|---|------|------------|
| 1 | `prometheus.yml` | Scrape configuration: the API, node_exporter, EMQX, and the operator-run exporter jobs. |
| 2 | `alert-rules.yml` | The alert definitions Prometheus evaluates, one group per decision class. |
| 3 | `compose.yml` | The stack itself: Prometheus, Grafana, node_exporter, Alertmanager. |
| 4 | `grafana/provisioning/datasources/datasource.yml` + `grafana/provisioning/dashboards/dashboards.yml` | Provisioning: the datasource and dashboard provider are repository source, not UI clicks. |
| 5 | `grafana/dashboards/iot-platform-overview.json` | The overview dashboard (provisioned, read-only). |
| 6 | `../scripts/backup-offhost.sh` + `../systemd/iot-platform-offhost-backup.service`/`.timer` | Not part of Compose: the off-host backup job that writes the freshness metric the backup alerts fire on. |

Files 1–5 are Compose-relative to this directory. File 6 is why the backup alerts exist at
all: the timestamp metric `iot_backup_last_success_timestamp` is produced **only** by that
script, through the node_exporter textfile collector.

## What the stack does NOT do

Read this section before trusting any panel.

- **It does not route a single alert anywhere.** Alertmanager ships with a minimal
  null-receiver configuration inlined in `compose.yml`: it collects alerts in its own UI and
  sends nothing. The routing target (email, webhook, chat ops) is an operator decision with
  credentials attached, and it is deliberately not a committed guess. To route alerts, mount
  your own `alertmanager.yml` over `/etc/alertmanager/alertmanager.yml` and keep it outside
  this repository.
- **It does not ship logs.** No Loki/ELK/CloudWatch/agent configuration exists here, and
  nothing in this stack should be read as a claim that logs are centralized. See the reasoning
  in `../logrotate/README.md`.
- **It does not install database or Redis exporters.** `pg_up`, `pg_stat_activity_count`,
  `pg_settings_max_connections` and `redis_up` come from `postgres_exporter` /
  `redis_exporter`, which run on the database and Redis hosts as their own systemd units. A
  "No data" panel for PostgreSQL means *the exporter is not deployed*, not that the database
  is idle. Until they run, the PostgreSQL alerts stay silent.
- **It does not manage TLS.** The stack binds to loopback and is meant to sit behind the same
  Nginx that terminates the API's TLS (`ops/nginx/iot-platform.conf.template`), or to be
  reached over SSH/VPN. Publishing any port on a public interface is an operator action, not a
  default.
- **It does not replace the readiness endpoint.** `/health/ready` on the API remains the
  authority on dependency health; Prometheus observes it, it does not decide it.

## Required environment

The stack fails to start without these, by design — there are no baked-in admin credentials:

```bash
export GRAFANA_ADMIN_USER='<operator-owned>'
export GRAFANA_ADMIN_PASSWORD='<operator-owned, never committed>'
```

Keep them out of the repository and out of your shell history (a file sourced from
`/etc/iot-platform/` with `chmod 0600` is the documented pattern; see
`docs/production-configuration.md`).

## Optional environment

| Variable | Default | Notes |
|---|---|---|
| `MONITORING_BIND_ADDRESS` | `127.0.0.1` | Change only to a VPN/LAN address you control; never `0.0.0.0`. |
| `PROMETHEUS_PORT` | `9090` | |
| `GRAFANA_PORT` | `3001` | **Not 3000** — `127.0.0.1:3000` is the API upstream in the Nginx template. |
| `ALERTMANAGER_PORT` | `9093` | |
| `NODE_EXPORTER_PORT` | `9100` | |
| `NODE_EXPORTER_TEXTFILE_DIR` | `/var/lib/node_exporter/textfile_collector` | Must be the same path `backup-offhost.sh` writes to, and the directory must exist and be writable by the backup job before the first run. |
| `PROMETHEUS_RETENTION_TIME` | `30d` | Metric retention. Alert *state* is not archived; backup history is not archived by Prometheus. |
| `IOT_PLATFORM_RUNTIME_NETWORK` | — | External Docker network joining this stack to the API/EMQX containers. See the commented block in `compose.yml`. |

## First bring-up

```bash
# 1. The directory the backup freshness metric is written to must exist first.
sudo install -d -o postgres -g postgres -m 0750 /var/lib/node_exporter/textfile_collector

# 2. Bring the stack up (from this directory).
docker compose --env-file /etc/iot-platform/monitoring.env up -d

# 3. Wait for healthy, then confirm the jobs actually scraped:
curl -fsS http://127.0.0.1:9090/api/v1/targets | jq '.data.activeTargets[] | {job:.labels.job, health:.health}'
```

On the documented single-host topology (`docs/deployment-recovery.md`) the API binds loopback
and a container cannot reach it through the bridge gateway, so replace the placeholder
`api:3000` target in `prometheus.yml` with the loopback URL of the scraping process (the
commented notes in that file show the supported shapes). Expect the following to be honest
"No data" until their exporter jobs exist: `postgres`, `redis`, `cadvisor`, `blackbox-https`.

Enable the backup chain — without it, `IotPlatformBackupMetricMissing` pages within an hour,
which is the intended fail-closed behaviour, not a defect:

```bash
sudo install -m 0644 ../systemd/iot-platform-offhost-backup.timer   /etc/systemd/system/
sudo install -m 0644 ../systemd/iot-platform-offhost-backup.service /etc/systemd/system/
# /etc/iot-platform/iot-platform-offhost-backup.env holds OFFHOST_REMOTE (root:postgres 0640).
sudo systemctl daemon-reload && sudo systemctl enable --now iot-platform-offhost-backup.timer
```

## The backup freshness metric chain

The one metric in this stack that is not a scrape, and the reason a broken backup chain pages
instead of hiding:

1. `iot-platform-backup.service` writes the encrypted dump and its SHA-256 sidecar to
   `/var/backups/iot-platform`.
2. `iot-platform-offhost-backup.service` (after it, no `Requires=`) replicates only
   `*.dump.gpg` artifacts off-host with `backup-offhost.sh`.
3. On a *verified* replication (local sidecar check, remote size, remote SHA-256 when the
   backend exposes it) the script writes `iot_backup.prom` into the textfile collector
   directory atomically — a half-written line would be a broken scrape.
4. node_exporter reads that file; `IotPlatformBackupStale` fires on a timestamp older than 36
   hours, and `IotPlatformBackupMetricMissing` fires on its absence — which is also what
   happens when the timer was never enabled. A dashboard with no data must not look healthy.

## Day-2 operations

```bash
# Reload Prometheus config/rules without a restart (lifecycle is enabled in compose.yml).
curl -fsS -X POST http://127.0.0.1:9090/-/reload

# Which rules are loaded, and what is firing right now.
curl -fsS http://127.0.0.1:9090/api/v1/rules     | jq '.data.groups[].rules[] | {alert, state}'
curl -fsS http://127.0.0.1:9090/api/v1/alerts    | jq '.data.alerts[] | {alert:.labels.alertname, state:.state}'

# The backup metric the alerts depend on, straight from the source of truth.
cat /var/lib/node_exporter/textfile_collector/iot_backup.prom
```

The dashboard and datasource are provisioned; a rebuilt container renders the same view. If a
panel shows "No data", find the exporter job (see "What the stack does NOT do") before
changing the dashboard.

## Related: the k6 function stress dashboard

`ops/loadtest/` holds the k6 function stress suite (declared coverage in
`config/stress-budget.json`, run through `npm run stress:seed` + `npm run stress:suite`), and
`grafana/dashboards/k6-stress-overview.json` is provisioned beside this stack's own dashboards. It
renders "No data" until the operator exports k6 results to Prometheus with
`--out experimental-prometheus-rw=<prometheus>/api/v1/write`, because remote write is a write
credential for this host and is therefore an operator decision, exactly like alert routing above.
The dashboard's first panel says so on the dashboard itself.

## Attestations this stack feeds

`docs/deployment-recovery.md` requires explicit operator attestations for monitoring access
and named backup/monitoring/rollback owners. Running this stack produces the *technical*
half of the monitoring attestation; the ownership names, the alert routing target and the
24-hour environment evidence (`scripts/create-production-environment-evidence.mjs`) remain
operator-owned facts that this repository cannot manufacture.

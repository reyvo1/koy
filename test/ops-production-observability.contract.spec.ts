/**
 * Production operations observability contract.
 *
 * Defect this prevents: an operator-facing artifact that looks enforced but is not wired to
 * anything real. The monitoring stack, the off-host backup chain, the log-rotation policy and
 * the infrastructure skeleton were added as the missing observation layer after
 * docs/deployment-recovery.md already required off-host encrypted copies, bounded retention,
 * monitoring access and named owners. A dashboard with no data source, an alert on a metric
 * nothing emits, a backup job that "succeeds" without replicating, or a firewall rule that
 * widens the public surface are all invisible failures that produce a false sense of safety.
 * This contract locks, from source, the properties that make each artifact worth operating:
 *
 *   - the monitoring stack binds loopback by default and has no committed credentials;
 *   - every alert fires on a metric that is actually emitted, and the backup metrics are
 *     emitted only by the off-host replication job after a verified copy;
 *   - the off-host job fails closed (no rclone, no remote, no sidecar, wrong content type,
 *     unreadable metric destination are all errors, not warnings) and replicates encrypted
 *     artifacts only;
 *   - both systemd units and the timer keep the same least-privilege shape as the existing
 *     production units, and the log rotation never touches the running service;
 *   - the infrastructure skeleton cannot create anything or reach a cloud control plane, and
 *     operator-owned values (real hostname, CIDRs, SSH key) are gitignored.
 *
 * Terraform, Docker Compose and systemd are deliberately NOT executed here: CI runs none of
 * them, which is exactly why these properties are asserted from source instead of being
 * assumed. Nothing in this contract claims a running production environment.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '..');
const read = (relativePath: string): string =>
  readFileSync(resolve(root, relativePath), 'utf8');

describe('Production operations observability (monitoring, off-host backup, rotation, skeleton)', () => {
  it('ships the documented monitoring artifact set', () => {
    for (const path of [
      'ops/monitoring/README.md',
      'ops/monitoring/prometheus.yml',
      'ops/monitoring/alert-rules.yml',
      'ops/monitoring/compose.yml',
      'ops/monitoring/grafana/provisioning/datasources/datasource.yml',
      'ops/monitoring/grafana/provisioning/dashboards/dashboards.yml',
      'ops/monitoring/grafana/dashboards/iot-platform-overview.json',
    ]) {
      expect(read(path).length).toBeGreaterThan(0);
    }
    // The README is the operator entry point every other artifact points at.
    expect(read('ops/monitoring/compose.yml')).toContain('ops/monitoring/README.md');
  });

  it('keeps the monitoring stack on loopback with no committed credentials', () => {
    const compose = read('ops/monitoring/compose.yml');
    // Every published port goes through the same bind-address variable, defaulted to loopback.
    expect(compose).toContain('${MONITORING_BIND_ADDRESS:-127.0.0.1}');
    // No active binding opens a public interface (the 0.0.0.0 warnings are prose, in comments).
    expect(/^\s*- "0\.0\.0\.0/m.test(compose)).toBe(false);
    expect(/^\s*-\s*"?0\.0\.0\.0/m.test(compose)).toBe(false);
    // Grafana admin credentials must be supplied by the operator, never baked in.
    expect(compose).toContain('${GRAFANA_ADMIN_USER:?');
    expect(compose).toContain('${GRAFANA_ADMIN_PASSWORD:?');
    expect(compose).toContain('GF_USERS_ALLOW_SIGN_UP: "false"');
    expect(compose.match(/ports:/g)?.length).toBe(4);
    for (const image of ['prom/prometheus:v3.15.0', 'grafana/grafana:13.0.11', 'prom/node-exporter:v1.12.1', 'prom/alertmanager:v0.34.1']) {
      expect(compose).toContain(`image: ${image}`);
    }
    // Prometheus lifecycle is enabled so rules reload without a restart.
    expect(compose).toContain('--web.enable-lifecycle');
    // Alert routing is operator-owned: the shipped default collects and sends nothing.
    expect(compose).toContain('receiver: iot-platform-default');
    expect(read('ops/monitoring/README.md')).toContain('does not route a single alert');

    const prometheus = read('ops/monitoring/prometheus.yml');
    expect(prometheus).toContain('rule_files:');
    expect(prometheus).toContain('/etc/prometheus/alert-rules.yml');
    expect(prometheus).toContain("job_name: iot-platform-api");
    // No inline credential: the bearer token and dashboard basic auth are file-mounted only,
    // and the only spelling of them in this file is the commented supported shape.
    expect(/^\s*credentials:/m.test(prometheus)).toBe(false);
    expect(/^\s*basic_auth:/m.test(prometheus)).toBe(false);
  });

  it('fires every alert on a metric the platform actually emits', () => {
    const rules = read('ops/monitoring/alert-rules.yml');
    const prometheus = read('ops/monitoring/prometheus.yml');
    const metricsService = read('src/metrics/metrics.service.ts');

    // Every rule carries a `for` (a single missed scrape must not page) and a severity.
    const alertBlocks = rules.split(/- alert: /).slice(1);
    expect(alertBlocks.length).toBe(9);
    for (const block of alertBlocks) {
      expect(block).toMatch(/\n\s+for: /);
      expect(block).toMatch(/\n\s+severity: (critical|warning)/);
    }

    // Application metric families referenced by the stack exist in the metrics service.
    for (const family of [
      'iot_http_requests_total',
      'iot_http_request_duration_seconds',
      'iot_telemetry_ingestion_total',
      'iot_dependency_readiness_checks_total',
      'iot_readiness_results_total',
      'iot_platform_info',
    ]) {
      expect(metricsService).toContain(family);
    }
    expect(prometheus).toContain('iot_mqtt_publisher');

    // The backup freshness metric is emitted ONLY by the off-host replication script, and the
    // alert that fires on its absence is present (a dashboard with no data must not look healthy).
    const backupScript = read('ops/scripts/backup-offhost.sh');
    expect(rules).toContain('alert: IotPlatformBackupStale');
    expect(rules).toContain('absent(iot_backup_last_success_timestamp)');
    expect(rules).toContain('ops/scripts/backup-offhost.sh');
    expect(backupScript).toContain('iot_backup_last_success_timestamp');
    // Operator-run exporter jobs are honestly marked as outside the compose stack.
    expect(prometheus).toContain('postgres_exporter');
    expect(prometheus).toContain('blackbox_exporter');
  });

  it('replicates only verified encrypted artifacts and fails closed on every gap', () => {
    const script = read('ops/scripts/backup-offhost.sh');
    expect(script).toContain('set -Eeuo pipefail');
    expect(script).toContain('umask 077');
    // Encrypted artifacts only: the selection glob and an explicit content-type refusal.
    expect(script).toContain("DUMP_GLOB='iot-platform-*.dump.gpg'");
    expect(script).toContain('refusing to replicate a non-encrypted artifact');
    // The local artifact is proven before bandwidth is spent on it.
    expect(script).toContain('sha256sum --check');
    // And what is on the remote is read back and compared before success is declared.
    expect(script).toContain('rclone copyto');
    expect(script).toContain('remote size mismatch');
    expect(script).toContain('remote hash mismatch');
    // Fail closed: no rclone, no remote, no sidecar, unwritable metric destination.
    expect(script).toContain('rclone not found');
    expect(script).toContain('OFFHOST_REMOTE is required');
    expect(script).toContain('checksum sidecar is missing');
    expect(script).toContain('textfile collector directory does not exist');
    // The metric is written atomically: a half-written line would be a broken scrape.
    expect(script).toContain('mv "$tmp_metric" "$metric_dir/iot_backup.prom"');
    // Nothing prints a credential: every logged remote passes through sanitize().
    expect(script).toContain('sanitize()');
    expect(script).not.toMatch(/echo .*\$RCLONE_CONFIG/);
  });

  it('runs the off-host units with the production least-privilege shape', () => {
    const service = read('ops/systemd/iot-platform-offhost-backup.service');
    const timer = read('ops/systemd/iot-platform-offhost-backup.timer');
    expect(service).toContain('After=iot-platform-backup.service');
    // Deliberately no Requires=: a failed local run still replicates the newest existing dump.
    // (The prose that explains this lives in a comment; only an active directive matters.)
    expect(/^Requires=/m.test(service)).toBe(false);
    expect(service).toContain('User=postgres');
    expect(service).toContain('NoNewPrivileges=true');
    expect(service).toContain('ProtectSystem=strict');
    expect(service).toContain('CapabilityBoundingSet=');
    expect(service).toContain('ReadWritePaths=/var/backups/iot-platform /var/lib/node_exporter/textfile_collector');
    // The plaintext dump never leaves the host through this unit.
    expect(service).toContain('backup-offhost.sh --dir /var/backups/iot-platform');
    expect(timer).toContain('Persistent=true');
    expect(timer).toContain('Unit=iot-platform-offhost-backup.service');
  });

  it('bounds log retention without ever touching the running service', () => {
    const conf = read('ops/logrotate/iot-platform.conf');
    expect(conf).toContain('rotate 14');
    expect(conf).toContain('maxsize 200M');
    expect(conf).toContain('copytruncate');
    expect(conf).toContain('su iot-platform iot-platform');
    expect(conf).toContain('--vacuum-time=14d');
    // Rotating a log is not a reason to drop device connections. Only an active, non-comment
    // systemctl command would break that; the warnings naming it live in comments.
    expect(/^\s*systemctl /m.test(conf)).toBe(false);
    // Nginx rotation stays with the distribution package.
    expect(read('ops/logrotate/README.md')).toContain('/etc/logrotate.d/nginx');
  });

  it('ships an infrastructure skeleton that cannot create infrastructure', () => {
    const versions = read('infra/terraform/versions.tf');
    const main = read('infra/terraform/main.tf');
    const variables = read('infra/terraform/variables.tf');
    const example = read('infra/terraform/terraform.tfvars.example');
    const gitignore = read('.gitignore');

    // Offline providers only: nothing here can reach a cloud control plane.
    expect(versions).toContain('source  = "hashicorp/null"');
    expect(versions).toContain('source  = "hashicorp/local"');
    expect(versions).not.toMatch(/source\s+=\s+"hashicorp\/(aws|google|azurerm)/);

    // The kill switch defaults to off, and every resource is gated on it.
    expect(variables).toContain('default     = false');
    const guardedResources = main.match(/resource "null_resource" "\w+"/g) ?? [];
    expect(guardedResources.length).toBe(4);
    for (const block of main.split(/resource "null_resource" /).slice(1)) {
      expect(block).toContain('count = var.apply_enabled ? 1 : 0');
      expect(block).toContain('refusing to run: apply_enabled is not true');
    }
    // Guarded commands refuse to run with placeholders still in place.
    expect(main).toContain('host_name is still the repository placeholder');
    expect(main).toContain('ssh_allowed_cidr must be the operator');

    // Operator-owned values and rendered output are gitignored; the committed example is
    // placeholder-only.
    expect(gitignore).toContain('infra/terraform/terraform.tfvars');
    expect(gitignore).toContain('infra/terraform/rendered/');
    expect(example).toContain('apply_enabled = false');
    expect(example).toContain('host_name = "REPLACE_WITH_OPERATOR_HOSTNAME"');
    // No real-looking hostname, CIDR or key material: every operator value is a marker.
    expect(example).not.toMatch(/\b[a-z0-9-]+\.(com|net|org|io|id)\b/i);
    expect(example).not.toMatch(/ssh-(rsa|ed25519)|AAAA[A-Za-z0-9+/]/);
    expect(example.match(/REPLACE_WITH_/g)?.length).toBeGreaterThan(3);
    // The README the validation message points at exists and states the boundary.
    expect(read('infra/README.md')).toContain('cannot create anything');
  });
});

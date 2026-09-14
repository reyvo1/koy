import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '..');
function read(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), 'utf8');
}

describe('Deployment and Recovery Foundation contract', () => {
  it('packages a manifest-verified release without source or secrets', () => {
    const build = read('scripts/build-production-release.mjs');
    const verify = read('scripts/verify-production-release.mjs');
    expect(build).toContain("'dist'");
    expect(build).toContain("'prisma/migrations'");
    expect(build).toContain("'release-manifest.json'");
    expect(build).toContain("createHash('sha256')");
    expect(build).toContain('delete packageJson.workspaces');
    expect(verify).toContain('forbiddenSegments');
    expect(verify).toContain('Environment secret file must not be packaged');
    expect(verify).toContain('Manifest checksum mismatch');
    expect(verify).toContain("'apps'");
    expect(verify).toContain("'packages'");
    expect(verify).toContain(
      'Backend release must not retain workspace metadata',
    );
  });

  it('runs the application as a hardened non-root systemd service', () => {
    const service = read('ops/systemd/iot-platform.service');
    expect(service).toContain('User=iot-platform');
    expect(service).toContain('Group=iot-platform');
    expect(service).toContain(
      'EnvironmentFile=/etc/iot-platform/iot-platform.env',
    );
    expect(service).toContain('NoNewPrivileges=true');
    expect(service).toContain('ProtectSystem=strict');
    expect(service).toContain('CapabilityBoundingSet=');
    expect(service).toContain('KillSignal=SIGTERM');
    expect(service).not.toContain('User=root');
  });

  it('terminates TLS at Nginx and keeps app and metrics private', () => {
    const nginx = read('ops/nginx/iot-platform.conf.template');
    const environment = read('ops/env/iot-platform.env.example');
    expect(environment).toContain('HOST=127.0.0.1');
    expect(nginx).toContain('listen 443 ssl http2');
    expect(nginx).toContain('ssl_protocols TLSv1.2 TLSv1.3');
    expect(nginx).toContain('server 127.0.0.1:3000');
    expect(nginx).toContain('location = /metrics');
    expect(nginx).toContain('allow 127.0.0.1');
    expect(nginx).toContain('deny all');
    expect(nginx).toContain('client_max_body_size 256k');
  });

  it('deploys atomically and rolls back only the application release', () => {
    const install = read('ops/scripts/install-release.sh');
    const rollback = read('ops/scripts/rollback-release.sh');
    expect(install).toContain('verify-production-release.mjs" --require-approved');
    expect(install.indexOf('--require-approved')).toBeLessThan(
      install.indexOf('npm --prefix \"$release_dir\" ci'),
    );
    expect(install).toContain('npm --prefix "$release_dir" ci');
    expect(install).toContain('run migrate:deploy');
    expect(install).toContain('ln -sfn "$release_dir" "$current_link"');
    expect(install).toContain('curl --fail');
    expect(install).toContain('restoring previous release symlink');
    expect(install).toContain('systemctl stop "$service_name"');
    expect(rollback).toContain('Database migrations were not reversed');
    expect(rollback).not.toContain('migrate reset');
  });

  it('creates encrypted verified backups with bounded retention', () => {
    const backup = read('ops/scripts/postgres-backup.sh');
    const timer = read('ops/systemd/iot-platform-backup.timer');
    expect(backup).toContain('umask 077');
    expect(backup).toContain('pg_dump');
    expect(backup).toContain('--format=custom');
    expect(backup).toContain('pg_restore --list');
    expect(backup).toContain('BACKUP_GNUPGHOME');
    expect(backup).toContain('gpg --homedir');
    expect(backup).toContain('sha256sum');
    expect(backup).toContain('BACKUP_RETENTION_DAYS');
    expect(timer).toContain('OnCalendar=*-*-* 02:15:00');
    expect(timer).toContain('Persistent=true');
    expect(read('ops/systemd/iot-platform-backup.service')).toContain(
      'TimeoutStartSec=30min',
    );
  });

  it('restores safely into an isolated target and verifies migrations', () => {
    const restore = read('ops/scripts/postgres-restore.sh');
    const drill = read('test/scripts/run-recovery-drill.ts');
    expect(restore).toContain(
      'Refusing to restore over the configured production database',
    );
    expect(restore).toContain('RESTORE_IOT_PLATFORM_PRODUCTION');
    expect(restore).toContain('sha256sum --check');
    expect(restore).toContain('--single-transaction');
    expect(restore).toContain('"_prisma_migrations"');
    expect(drill).toContain('RECOVERY_DRILL_TESTS_ALLOWED');
    expect(drill).toContain('recovery_drill_marker');
    expect(drill).toContain('pg_dump');
    expect(drill).toContain('pg_restore');
    expect(drill).toContain('timeout: 180_000');
    expect(drill).toContain('finally');
  });

  it('fails closed on critical dependencies and pins the remediated Fastify stack', () => {
    const audit = read('scripts/check-production-dependencies.mjs');
    const policy = JSON.parse(
      read('ops/security/production-audit-policy.json'),
    ) as { acceptedCriticalFindings: Array<{ package: string }> };
    const packageJson = JSON.parse(read('package.json')) as {
      dependencies: Record<string, string>;
      scripts: Record<string, string>;
    };
    expect(audit).toContain('Unreviewed critical production dependency');
    expect(audit).toContain('Critical dependency acceptance expired');
    expect(policy.acceptedCriticalFindings).toEqual([]);
    expect(packageJson.dependencies['@nestjs/platform-fastify']).toBe('11.2.3');
    expect(packageJson.dependencies.fastify).toBe('5.10.0');
    expect(packageJson.scripts['security:stack:verify']).toBe(
      'node scripts/verify-secure-fastify-stack.mjs',
    );
    expect(read('scripts/verify-secure-fastify-stack.mjs')).toContain(
      "compare(version, '9.3.3') < 0",
    );
  });

  it('adds CI release, recovery, security, and artifact gates', () => {
    const workflow = read('.github/workflows/ci.yml');
    expect(workflow).toContain('Non-mutating lint');
    expect(workflow).toContain('Production dependency audit policy');
    expect(workflow).toContain('PostgreSQL recovery drill');
    expect(workflow).toContain('Build production release artifact');
    expect(workflow).toContain('Production artifact startup smoke');
    expect(workflow).toContain('actions/upload-artifact@v4');
    expect(workflow).toContain('retention-days: 14');
  });

  it('keeps production startup smoke bounded and diagnosable', () => {
    const startupSmoke = read('test/scripts/run-production-startup-smoke.ts');

    expect(startupSmoke).toContain('PRODUCTION_STARTUP_SMOKE_TIMEOUT_MS');
    expect(startupSmoke).toContain('STARTUP_SMOKE_LOG_LEVEL');
    expect(startupSmoke).toContain('Startup child exited before');
    expect(startupSmoke).toContain('Child exit: code=');
    expect(startupSmoke).not.toContain('await fetch(');
  });

  it('preserves deployment recovery completion after later module transitions', () => {
    const recovery = read('docs/deployment-recovery.md');
    const readiness = read('docs/production-readiness.md');
    const mqtt = read('src/mqtt/mqtt.service.ts');

    expect(recovery).toContain('Deployment and Recovery Foundation');
    expect(recovery).toContain('application rollback');
    expect(recovery).toContain('PostgreSQL recovery drill');
    expect(readiness).toContain('Status: NOT READY FOR PRODUCTION DEPLOYMENT');
    expect(mqtt).toContain('this.publisherTransport.publish(topic, message)');
  });
});

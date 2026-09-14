import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '..');

function readRepositoryFile(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), 'utf8');
}

describe('Production Configuration and Process Lifecycle contract', () => {
  it('uses validated host and port instead of hardcoded listener settings', () => {
    const validation = readRepositoryFile('src/config/config.validation.ts');
    const runtime = readRepositoryFile('src/bootstrap/production-runtime.ts');
    const main = readRepositoryFile('src/main.ts');

    expect(validation).toContain("HOST = '0.0.0.0'");
    expect(validation).toContain('@Min(1)');
    expect(validation).toContain('@Max(65535)');
    expect(runtime).toContain("configService.getOrThrow<string>('HOST')");
    expect(runtime).toContain("configService.getOrThrow<number>('PORT')");
    expect(runtime).toContain('await app.listen(settings.port, settings.host)');
    expect(main).not.toContain("app.listen(3000, '0.0.0.0')");
  });

  it('enforces a production-safe Swagger policy', () => {
    const validation = readRepositoryFile('src/config/config.validation.ts');
    const runtime = readRepositoryFile('src/bootstrap/production-runtime.ts');

    expect(validation).toContain('environment !== Environment.Production');
    expect(validation).toContain('SWAGGER_ENABLED must be false in production');
    expect(runtime).toContain('enableSwagger: settings.swaggerEnabled');
  });

  it('rejects documented production secret placeholders', () => {
    const validation = readRepositoryFile('src/config/config.validation.ts');
    const environment = readRepositoryFile('.env.example');

    expect(validation).toContain("'change_me_in_production'");
    expect(validation).toContain('assertProductionSecret');
    expect(environment).toContain('JWT_SECRET=change_me_in_production');
    expect(environment).toContain(
      'MQTT_WEBHOOK_SECRET=change_me_in_production',
    );
  });

  it('enables shutdown hooks before starting the listener', () => {
    const runtime = readRepositoryFile('src/bootstrap/production-runtime.ts');

    expect(runtime.indexOf('app.enableShutdownHooks()')).toBeGreaterThan(-1);
    expect(runtime.indexOf('await app.listen')).toBeGreaterThan(
      runtime.indexOf('app.enableShutdownHooks()'),
    );
  });

  it('disconnects Prisma through an application shutdown hook', () => {
    const prisma = readRepositoryFile('src/prisma/prisma.service.ts');

    expect(prisma).toContain('implements OnApplicationShutdown');
    expect(prisma).toContain('async onApplicationShutdown()');
    expect(prisma).toContain('await this.$disconnect()');
  });

  it('registers bounded and idempotent Redis shutdown cleanup', () => {
    const module = readRepositoryFile('src/redis/redis.module.ts');
    const lifecycle = readRepositoryFile(
      'src/redis/redis-lifecycle.service.ts',
    );

    expect(module).toContain('RedisLifecycleService');
    expect(lifecycle).toContain('REDIS_SHUTDOWN_TIMEOUT_MS = 5000');
    expect(lifecycle).toContain('this.shutdownPromise ??=');
    expect(lifecycle).toContain('await this.withTimeout(this.redis.quit())');
    expect(lifecycle).toContain('this.redis.disconnect(false)');
  });

  it('has focused startup, configuration, and shutdown tests', () => {
    for (const path of [
      'src/config/config.validation.spec.ts',
      'src/bootstrap/production-runtime.spec.ts',
      'src/prisma/prisma.service.spec.ts',
      'src/redis/redis-lifecycle.service.spec.ts',
    ]) {
      expect(readRepositoryFile(path)).toContain('describe(');
    }
  });

  it('documents the completed slice and its explicit non-goals', () => {
    const documentation = readRepositoryFile(
      'docs/production-configuration.md',
    );

    expect(documentation).toContain('Runtime Binding Contract');
    expect(documentation).toContain('Resource Shutdown Contract');
    expect(documentation).toContain('does not:');
    expect(documentation).toContain('Implement the production MQTT publisher');
    expect(documentation).toContain('Activate Module 09');
  });

  it('preserves the approved production MQTT adapter boundary', () => {
    const mqtt = readRepositoryFile('src/mqtt/mqtt.service.ts');
    const adapter = readRepositoryFile('src/mqtt/mqtt-js-publisher.adapter.ts');
    const mqttConfig = readRepositoryFile('src/mqtt/mqtt-publisher.config.ts');
    const readiness = readRepositoryFile('docs/production-readiness.md');

    expect(mqtt).toContain('this.publisherTransport.publish(topic, message)');
    expect(adapter).toContain('publishAsync');
    expect(mqttConfig).toContain('protocolVersion: 5');
    expect(readiness).toContain('MQTT Production Transport Implementation');
  });

  it('preserves lifecycle and deployment completion after later module transitions', () => {
    const documentation = readRepositoryFile('docs/production-configuration.md');
    const readiness = readRepositoryFile('docs/production-readiness.md');

    expect(documentation).toContain('Production Configuration and Process Lifecycle Foundation');
    expect(readiness).toContain(
      'Production Configuration and Process Lifecycle Foundation — Completed',
    );
  });
});

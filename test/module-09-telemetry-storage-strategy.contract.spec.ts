import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(__dirname, '..');
const read = (path: string) => readFileSync(join(root, path), 'utf8');

describe('Module 09 telemetry storage strategy contract', () => {
  it('records the approved non-partitioned and retention-disabled baseline', () => {
    const strategy = read('docs/telemetry-storage-strategy.md');
    const schema = read('prisma/schema.prisma');
    const service = read('src/telemetry/telemetry.service.ts');

    expect(strategy).toContain(
      'PostgreSQL 16 remains the authoritative telemetry store',
    );
    expect(strategy).toContain('remains non-partitioned');
    expect(strategy).toContain('automatic deletion is disabled by default');
    expect(strategy).toContain(
      'Backup retention and telemetry row retention are separate policies',
    );
    expect(strategy).toContain('Aggregation remains read-time');
    expect(strategy).toContain('PostgreSQL advisory lock');
    expect(strategy).toContain('bounded batches');
    expect(strategy).toContain('derive the cutoff from `createdAt`');
    expect(schema).toContain('@@index([tenantId, deviceId, createdAt, id])');
    expect(service).not.toContain('deleteMany');
  });

  it('keeps strategy ownership inside its immutable decision record', () => {
    const strategy = read('docs/telemetry-storage-strategy.md');

    expect(strategy).toContain('# Telemetry Storage Strategy');
    expect(strategy).toContain('Module 09 is complete at the repository level');
  });
});

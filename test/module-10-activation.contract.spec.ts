import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '..');
const read = (relativePath: string): string =>
  readFileSync(resolve(root, relativePath), 'utf8');

describe('Module 10 activation and multiplatform architecture contract', () => {
  it('records the approved web and mobile topology', () => {
    const architecture = read('docs/module-10-multiplatform-architecture.md');

    expect(architecture).toContain('Next.js App Router with TypeScript');
    expect(architecture).toContain(
      'React Native with Expo development builds and TypeScript',
    );
    expect(architecture).toContain('Android first');
    expect(architecture).toContain('iOS-ready');
    expect(architecture).toContain(
      'existing NestJS and Fastify application remains authoritative',
    );
    expect(architecture).toContain(
      'existing backend stays at the repository root',
    );
    expect(architecture).toContain('npm workspaces');
  });

  it('keeps dashboard behavior capability-driven and tenant-isolated', () => {
    const architecture = read('docs/module-10-multiplatform-architecture.md');

    for (const widget of ['card', 'switch', 'gauge', 'chart', 'map', 'table']) {
      expect(architecture).toContain(`- ${widget};`);
    }
    expect(architecture).toContain('- status.');

    expect(architecture).toContain(
      'The backend remains authoritative for device ownership',
    );
    expect(architecture).toContain(
      'Every dashboard, layout, widget, query, and command interaction must preserve the trusted tenant context',
    );
    expect(architecture).toContain('no client-only authorization decisions');
    expect(architecture).toContain(
      'no direct browser or mobile connection to the MQTT broker',
    );
  });

  it('preserves CCTV and barcode work as future adapter-driven scope', () => {
    const architecture = read('docs/module-10-multiplatform-architecture.md');

    expect(architecture).toContain(
      'CCTV, ONVIF, RTSP, vendor camera connectors, stream gateways',
    );
    expect(architecture).toContain(
      'treating QR or barcode scanning as a universal camera protocol',
    );
    expect(architecture).toContain(
      'activating a device solely because a code was scanned',
    );
    expect(architecture).toContain(
      'resolved through the appropriate adapter or connector',
    );
    expect(architecture).toContain(
      'no raw RTSP URL or camera credential exposed',
    );
  });

  it('preserves activation history while later Slice 10.6 adds isolated web workspaces', () => {
    const packageJson = JSON.parse(read('package.json')) as {
      workspaces?: unknown;
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const schema = read('prisma/schema.prisma');
    const review = read('docs/module-10-multiplatform-architecture.md');

    expect(packageJson.workspaces).toEqual([
      'apps/admin-web',
      'apps/user-web',
      'apps/user-mobile',
      'packages/design-system',
    ]);
    expect(packageJson.dependencies?.next).toBeUndefined();
    expect(packageJson.dependencies?.['react-native']).toBeUndefined();
    expect(packageJson.dependencies?.expo).toBeUndefined();
    expect(packageJson.devDependencies?.next).toBeUndefined();
    expect(schema).toContain('model Dashboard');
    expect(schema).toContain('model DashboardWidget');
    expect(review).toContain(
      'This checkpoint changes lifecycle metadata, documentation, and contract tests only',
    );
    expect(review).toContain(
      '**10.2 Dashboard Persistence Foundation** - completed and green remotely',
    );
  });

  it('records mandatory security and observability boundaries in the architecture contract', () => {
    const prompt = read('docs/module-10-multiplatform-architecture.md');

    expect(prompt).toContain('## Tenant, Authorization, and Security');
    expect(prompt).toContain('They never establish authorization');
    expect(prompt).toContain(
      'no direct browser or mobile connection to the MQTT broker',
    );
    expect(prompt).toContain('Module 11 remains inactive');
    expect(prompt).toContain(
      'Production deployment remains separately controlled and NOT APPROVED',
    );
  });
});

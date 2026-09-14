import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Module 10 Android native proof preparation contract', () => {
  const repositoryRoot = resolve(__dirname, '..');
  const appConfig = readFileSync(
    resolve(repositoryRoot, 'apps/user-mobile/app.config.ts'),
    'utf8',
  );
  const mobilePackage = JSON.parse(
    readFileSync(
      resolve(repositoryRoot, 'apps/user-mobile/package.json'),
      'utf8',
    ),
  ) as {
    dependencies?: Record<string, string>;
  };

  it('pins the approved Android application identity', () => {
    expect(appConfig).toContain("package: 'com.reyvo.iotplatform'");
  });

  it('pins the Expo SDK-compatible system UI dependency', () => {
    expect(mobilePackage.dependencies?.['expo-system-ui']).toBe('~57.0.1');
  });
});

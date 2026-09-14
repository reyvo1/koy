import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '..');
const read = (path: string): string =>
  readFileSync(resolve(root, path), 'utf8');
const readJson = <T>(path: string): T => JSON.parse(read(path)) as T;

type ValidationStep = {
  label: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
  requiredEnv?: string[];
};

describe('iOS final release proof policy contract', () => {
  const documentation = read('docs/ios-final-release-proof-policy.md');
  const mobilePackage = readJson<{
    scripts: Record<string, string>;
  }>('apps/user-mobile/package.json');
  const mobileConfig = read('apps/user-mobile/app.config.ts');
  const profiles = readJson<{ profiles: Record<string, ValidationStep[]> }>(
    'tools/module-runner/profiles/validation-profiles.json',
  );
  const policy = readJson<{
    contractClasses: Record<string, string>;
    transitionProof: { immutableEvidenceDocuments: string[] };
  }>('test/contract-surface-policy.json');
  const handoff = read('tools/module-runner/lib/handoff-core.mjs');
  const lifecycle = read('scripts/manage-module-state.mjs');
  const sourceCheck = read('tools/module-runner/check-sources.mjs');

  it('documents deferred native proof without reading mutable current-state data', () => {
    expect(documentation).toContain('IOS_RELEASE_POLICY_SCHEMA=1');
    expect(documentation).toContain(
      'IOS_NATIVE_PROOF_MODE=deferred-until-final-release',
    );
    expect(documentation).toContain('IOS_PROOF_BLOCKS_MODULE_LIFECYCLE=false');
  });

  it('preserves shared Expo and React Native compatibility during current modules', () => {
    expect(mobilePackage.scripts.ios).toBe('expo run:ios');
    expect(mobilePackage.scripts['config:validate']).toBe(
      'expo config --type public',
    );
    expect(mobilePackage.scripts.typecheck).toContain('tsc --noEmit');
    expect(mobileConfig).toContain('ios: {');
    expect(mobileConfig).toContain('supportsTablet: true');
    expect(documentation).toContain(
      'IOS_SHARED_CODE_COMPATIBILITY_REQUIRED=true',
    );

    for (const profileName of [
      'module-11-automation-command-dispatch-foundation-selection',
      'module-11-automation-command-dispatch-foundation',
    ]) {
      const profile = profiles.profiles[profileName];
      expect(profile).toBeDefined();
      expect(
        profile.some(
          (step) =>
            step.command === 'npm' &&
            JSON.stringify(step.args) ===
              JSON.stringify(['run', 'mobile:validate']),
        ),
      ).toBe(true);
      const nativeCommandText = profile
        .map((step) => `${step.command} ${step.args.join(' ')}`)
        .join('\n');
      expect(nativeCommandText).not.toMatch(
        /expo run:ios|eas build|xcodebuild|pod install/i,
      );
    }
  });

  it('requires cloud build, signing, TestFlight, and physical iPhone proof only at final release', () => {
    for (const marker of [
      'IOS_FINAL_RELEASE_GATE_AFTER_MODULE=30',
      'IOS_CLOUD_BUILD_ALLOWED=true',
      'IOS_PREFERRED_BUILD_PROVIDER=Expo_EAS',
      'IOS_APPLE_SIGNING_REQUIRED_AT_FINAL_RELEASE=true',
      'IOS_TESTFLIGHT_REQUIRED_AT_FINAL_RELEASE=true',
      'IOS_PHYSICAL_DEVICE_PROOF_REQUIRED_AT_FINAL_RELEASE=true',
      'IOS_APP_STORE_APPROVAL_SEPARATE=true',
    ]) {
      expect(documentation).toContain(marker);
    }
  });

  it('persists the release policy in lifecycle validation, source checks, and future handoffs', () => {
    expect(lifecycle).toContain('validateReleasePolicy');
    expect(sourceCheck).toContain('validateIosFinalReleasePolicy');
    expect(handoff).toContain('iosNativeProofMode');
    expect(handoff).toContain('iosProofBlocksModuleLifecycle');
    expect(handoff).toContain('docs/ios-final-release-proof-policy.md');
  });

  it('registers the stable policy contract and binding policy document', () => {
    const contractPath = 'test/ios-final-release-proof-policy.contract.spec.ts';
    expect(policy.contractClasses[contractPath]).toBe('stable-contract');
    expect(policy.transitionProof.immutableEvidenceDocuments).toContain(
      'docs/ios-final-release-proof-policy.md',
    );
  });
});

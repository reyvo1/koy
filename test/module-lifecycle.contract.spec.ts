import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '..');
const read = (relativePath: string): string =>
  readFileSync(resolve(root, relativePath), 'utf8');

describe('Module lifecycle foundation contract', () => {
  const registry = JSON.parse(
    read('AI-Development-Kit/modules/module-registry.json'),
  ) as {
    version: number;
    modules: Array<{
      module: number;
      title: string;
      scope: string;
      prompt: string;
    }>;
  };
  const config = JSON.parse(read('project-config.json')) as {
    development: {
      currentModule: number | null;
      lastCompletedModule: number;
      nextModule: number | null;
      nextModuleStatus: string;
      activeWorkstream: string;
      activeSlice: string;
      milestone: string;
      productionDeploymentStatus: string;
      moduleLifecycleState: string;
      moduleLifecycleEvidence: string;
      moduleRegistry: string;
    };
    releasePolicy: {
      schemaVersion: number;
      iosNativeProofMode: string;
      iosProofBlocksModuleLifecycle: boolean;
      iosSharedCodeCompatibilityRequired: boolean;
      iosFinalReleaseGateAfterModule: number;
      iosCloudBuildAllowed: boolean;
      iosPreferredBuildProvider: string;
      iosAppleSigningRequiredAtFinalRelease: boolean;
      iosTestFlightRequiredAtFinalRelease: boolean;
      iosPhysicalDeviceProofRequiredAtFinalRelease: boolean;
      iosAppStoreApprovalSeparate: boolean;
    };
  };

  it('registers every prompt from Module 01 through Module 30', () => {
    expect(registry.version).toBe(1);
    expect(registry.modules).toHaveLength(30);

    registry.modules.forEach((module, index) => {
      const expectedNumber = index + 1;
      expect(module.module).toBe(expectedNumber);
      expect(module.title.length).toBeGreaterThan(0);
      expect(module.scope.length).toBeGreaterThan(0);
      expect(read(module.prompt)).toContain(
        `# MODULE ${String(expectedNumber).padStart(2, '0')} ---`,
      );
    });
  });

  it('keeps current, completed, and next module state sequential', () => {
    const development = config.development;
    expect(development.moduleRegistry).toBe(
      'AI-Development-Kit/modules/module-registry.json',
    );

    if (development.currentModule !== null) {
      expect(development.currentModule).toBe(
        development.lastCompletedModule + 1,
      );
      expect(development.nextModule).toBe(
        development.currentModule < 30 ? development.currentModule + 1 : null,
      );
      expect(development.moduleLifecycleState).toBe('active');
      expect(development.activeWorkstream).toContain(
        `Module ${String(development.currentModule).padStart(2, '0')}`,
      );
      expect(development.activeSlice).toContain(
        `Module ${String(development.currentModule).padStart(2, '0')}`,
      );
    } else if (development.lastCompletedModule < 30) {
      expect(development.nextModule).toBe(development.lastCompletedModule + 1);
      expect(development.moduleLifecycleState).toBe('awaiting-activation');
    } else {
      expect(development.nextModule).toBeNull();
      expect(development.moduleLifecycleState).toBe('complete');
    }

    expect(development.moduleLifecycleEvidence.length).toBeGreaterThan(7);
    expect(development.productionDeploymentStatus).toMatch(/not approved/i);
  });

  it('defers native iOS proof without weakening shared compatibility', () => {
    expect(config.releasePolicy).toMatchObject({
      schemaVersion: 1,
      iosNativeProofMode: 'deferred-until-final-release',
      iosProofBlocksModuleLifecycle: false,
      iosSharedCodeCompatibilityRequired: true,
      iosFinalReleaseGateAfterModule: 30,
      iosCloudBuildAllowed: true,
      iosPreferredBuildProvider: 'Expo EAS',
      iosAppleSigningRequiredAtFinalRelease: true,
      iosTestFlightRequiredAtFinalRelease: true,
      iosPhysicalDeviceProofRequiredAtFinalRelease: true,
      iosAppStoreApprovalSeparate: true,
    });
    expect(config.development.lastCompletedModule).toBeLessThanOrEqual(
      config.releasePolicy.iosFinalReleaseGateAfterModule,
    );
    expect(read('scripts/manage-module-state.mjs')).toContain(
      'validateReleasePolicy',
    );
  });

  it('tracks the completed roadmap after the Module 30 ESP32 SDK delivery', () => {
    expect(config.development.activeSlice).toContain('Completion Review');
    expect(config.development.milestone).toContain('ESP32 Device SDK');
    expect(config.development.moduleLifecycleEvidence).toContain(
      'ROADMAP COMPLETE',
    );
    expect(config.development.lastCompletedModule).toBe(30);
  });

  it('uses one managed current-status block in every source of truth', () => {
    for (const path of [
      'docs/project-state.md',
      'docs/roadmap.md',
      'docs/architecture.md',
      'AI-Development-Kit/agent/REPOSITORY-MEMORY.md',
      'AI-Development-Kit/bootstrap/PROJECT-BOOTSTRAP-v1.0.md',
      'AI-Development-Kit/architecture/SYSTEM.md',
    ]) {
      const content = read(path);
      expect(content.match(/<!-- MODULE-LIFECYCLE:START -->/g)).toHaveLength(1);
      expect(content.match(/<!-- MODULE-LIFECYCLE:END -->/g)).toHaveLength(1);
      expect(content).toContain(config.development.activeSlice);
    }
  });

  it('provides generic lifecycle commands without commit or push behavior', () => {
    const manager = read('scripts/manage-module-state.mjs');
    const packageJson = JSON.parse(read('package.json')) as {
      scripts: Record<string, string>;
    };

    expect(packageJson.scripts['module:status']).toContain(
      'manage-module-state',
    );
    expect(packageJson.scripts['module:validate']).toContain(
      'manage-module-state',
    );
    expect(packageJson.scripts['module:slice']).toContain(
      'manage-module-state',
    );
    expect(packageJson.scripts['module:activate']).toContain(
      'manage-module-state',
    );
    expect(packageJson.scripts['module:complete']).toContain(
      'manage-module-state',
    );
    expect(packageJson.scripts['module:simulate']).toContain(
      'manage-module-state',
    );
    expect(manager).toContain("command === 'slice'");
    expect(manager).toContain('selectSlice');
    expect(manager).toContain("command === 'activate'");
    expect(manager).toContain("command === 'complete'");
    expect(manager).toContain("command === 'simulate'");
    expect(manager).toContain('simulateLifecycle');
    expect(manager).toContain('normalizeManagedLifecycleBlock');
    expect(manager).toContain("content.replace(/\\s+/g, ' ').trim()");
    expect(manager).toContain('extractManagedLifecycleBlock');
    expect(manager).not.toContain('content.includes(expectedBlock)');
    expect(manager).toContain(
      'Activation requires the explicit --approved flag',
    );
    expect(manager).not.toContain('git commit');
    expect(manager).not.toContain('git push');
  });
});

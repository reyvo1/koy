import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '..');
const read = (path: string): string =>
  readFileSync(resolve(root, path), 'utf8');

const SELF_TEST_PROCESS_TIMEOUT_MS = 300_000;
const SELF_TEST_PATH = 'tools/module-runner/self-test.mjs';

describe('Module Execution Kit contract', () => {
  const packageJson = JSON.parse(read('package.json')) as {
    scripts: Record<string, string>;
  };

  it('exposes one reusable Node-based execution workflow', () => {
    expect(packageJson.scripts['module:doctor']).toBe(
      'node tools/module-runner/doctor.mjs',
    );
    expect(packageJson.scripts['module:execute']).toBe(
      'node tools/module-runner/execute.mjs',
    );
    expect(packageJson.scripts['module:package']).toBe(
      'node tools/module-runner/package.mjs',
    );
    expect(packageJson.scripts['module:cleanup']).toBe(
      'node tools/module-runner/cleanup.mjs',
    );
    expect(packageJson.scripts['module:handoff']).toBe(
      'node tools/module-runner/handoff.mjs',
    );
    expect(packageJson.scripts['module:push']).toBe(
      'node tools/module-runner/push.mjs',
    );
    expect(packageJson.scripts['module:runner:self-test']).toBe(
      'node tools/module-runner/self-test.mjs',
    );
  });

  it('keeps native stdout and stderr separate without a shell', () => {
    const processRunner = read('tools/module-runner/lib/process.mjs');

    expect(processRunner).toContain('shell: false');
    expect(processRunner).toContain("stdio: ['pipe', 'pipe', 'pipe']");
    expect(processRunner).toContain("child.stdout.on('data'");
    expect(processRunner).toContain("child.stderr.on('data'");
    expect(processRunner).toContain("['npm', 'npx'].includes(command)");
    expect(processRunner).toContain("'npm-cli.js'");
    expect(processRunner).toContain("'npx-cli.js'");
    expect(processRunner).toContain('executable: execPath');
    expect(processRunner).toContain('[module-runner] still running');
    expect(processRunner).toContain('taskkill.exe');
    expect(processRunner).toContain('streamed: stream');
    expect(processRunner).toContain('MAX_CAPTURE_BYTES');
    expect(processRunner).not.toContain('`${command}.cmd`');
    expect(processRunner).not.toContain('npm.cmd');
    expect(processRunner).not.toContain('2>&1');
    expect(processRunner).not.toContain('shell: true');
  });

  it('uses exact payloads and hermetic Git fixtures across platforms', () => {
    const manifest = read('tools/module-runner/lib/manifest.mjs');
    const selfTest = read('tools/module-runner/self-test.mjs');
    const workspace = read('tools/module-runner/lib/workspace.mjs');
    const packageRunner = read('tools/module-runner/package.mjs');

    expect(manifest).toContain("const payloadFormat = 'exact-files-v1'");
    expect(manifest).toContain('resolvePayloadPath');
    expect(manifest).not.toContain('resolvePatchPath');
    expect(selfTest).toContain("['core.autocrlf', 'false']");
    expect(selfTest).toContain("['core.eol', 'lf']");
    expect(selfTest).toContain("['core.safecrlf', 'true']");
    expect(selfTest).toContain('await assertClean(repository);');
    expect(selfTest).toContain('known-safe requested root was not selected');
    expect(selfTest).toContain('over-budget requested root was not rejected');
    expect(selfTest).toContain(
      'over-budget explicit work root was not rejected without fallback',
    );
    expect(selfTest).toContain(
      'implicit IOT_MODULE_WORK_ROOT redirected the workspace',
    );
    expect(selfTest).not.toContain('slice.patch');
    expect(workspace).toContain('WINDOWS_SAFE_PATH_LIMIT');
    expect(workspace).toContain("resolve(tmpdir(), 'iw')");
    expect(workspace).not.toContain("resolve(root, '.iotw')");
    expect(workspace).toContain("resolve(temporaryRoot, 'w')");
    expect(workspace).toContain('WORKSPACE_MARKER');
    expect(workspace).toContain('cleanupWorkspace');
    expect(workspace).toContain('IOT_MODULE_MIN_FREE_BYTES');
    expect(workspace).toContain(
      'Another module-runner workspace is active or stale',
    );
    expect(packageRunner).toContain('extractZip');
    expect(packageRunner).toContain('Expected exactly one slice manifest');
    expect(packageRunner).toContain('cleanupWorkspace');
    expect(packageRunner).toContain('workspace: extraction');
  });

  it('proves the exact commit in a disposable worktree before fast-forward', () => {
    const executor = read('tools/module-runner/execute.mjs');
    const git = read('tools/module-runner/lib/git.mjs');

    expect(executor).toContain('createDetachedWorktree');
    expect(executor).toContain('verifyPayloadAssets');
    expect(executor).toContain('materializePayload');
    expect(executor).not.toContain("'apply', '--check'");
    expect(executor).toContain('verifyAllowedChanges');
    expect(executor).toContain('verifyExpectedFileHashes');
    expect(executor).toContain('writeFailureOutputs');
    expect(executor).toContain('createCommit');
    expect(executor).toContain('fastForward(repo, provenCommit)');
    expect(executor).toContain('createWorkspace');
    expect(executor).toContain('cleanupWorkspace');
    expect(executor).toContain('cleanupReport');
    expect(executor).toContain(
      'Workspace cleanup was verified before handoff creation',
    );
    expect(executor).toContain("optionalString(options, 'work-root')");
    expect(git).toContain("'merge', '--ff-only', commitSha");
    expect(executor).not.toContain('git push');
    expect(executor).not.toContain('reset --hard');
    expect(executor).not.toContain('git clean');
  });

  it('locks exact manifests, validation profiles, and forbidden paths', () => {
    const schema = JSON.parse(
      read('tools/module-runner/schema/slice-manifest.schema.json'),
    ) as { properties: Record<string, unknown> };
    const profiles = JSON.parse(
      read('tools/module-runner/profiles/validation-profiles.json'),
    ) as {
      version: number;
      profiles: Record<
        string,
        Array<{
          label: string;
          command: string;
          timeoutMs?: number;
          args: string[];
          env?: Record<string, string>;
        }>
      >;
    };

    expect(schema.properties).toHaveProperty('baseSha');
    expect(schema.properties).toHaveProperty('commitSubject');
    expect(schema.properties).toHaveProperty('payload');
    expect(schema.properties).toHaveProperty('allowedChanges');
    expect(schema.properties).toHaveProperty('expectedFileHashes');
    expect(schema.properties).toHaveProperty('forbiddenPrefixes');
    expect(profiles.version).toBe(1);
    expect(profiles.profiles['framework-bootstrap']).toBeDefined();
    expect(profiles.profiles['module-10-admin-web']).toBeDefined();
    expect(profiles.profiles['module-10-admin-web-one-pack']).toBeDefined();
    expect(profiles.profiles['workflow-efficiency-remediation']).toBeDefined();
    expect(profiles.profiles['workflow-efficiency-post-apply']).toBeDefined();
    expect(
      profiles.profiles[
        'module-11-automation-command-dispatch-foundation-selection'
      ],
    ).toBeDefined();
    expect(
      profiles.profiles['module-11-automation-command-dispatch-foundation'],
    ).toBeDefined();
    const adminProfile = profiles.profiles['module-10-admin-web-one-pack'];
    const broadProfiles = Object.entries(profiles.profiles).filter(
      ([, steps]) =>
        steps.some(
          (step) =>
            step.command === 'npm' &&
            JSON.stringify(step.args) ===
              JSON.stringify(['test', '--', '--runInBand']),
        ),
    );
    for (const [profileName, steps] of broadProfiles) {
      const indexes = [
        steps.findIndex(
          (step) =>
            step.command === 'node' &&
            JSON.stringify(step.args) === JSON.stringify([SELF_TEST_PATH]),
        ),
        steps.findIndex(
          (step) =>
            step.command === 'npm' &&
            JSON.stringify(step.args) ===
              JSON.stringify(['run', 'module:runner:check']),
        ),
        steps.findIndex(
          (step) => step.command === 'npm' && step.args[0] === 'ci',
        ),
        steps.findIndex(
          (step) =>
            step.command === 'node' &&
            JSON.stringify(step.args) ===
              JSON.stringify([
                'tools/module-runner/check-format.mjs',
                '{changed}',
              ]),
        ),
        steps.findIndex(
          (step) =>
            step.command === 'npm' &&
            JSON.stringify(step.args) === JSON.stringify(['run', 'lint:check']),
        ),
        steps.findIndex(
          (step) =>
            step.command === 'npm' &&
            JSON.stringify(step.args) ===
              JSON.stringify(['run', 'module:validate']),
        ),
        steps.findIndex(
          (step) =>
            step.command === 'npm' &&
            JSON.stringify(step.args) ===
              JSON.stringify(['run', 'module:simulate']),
        ),
      ];
      expect(indexes).not.toContain(-1);
      expect(indexes).toEqual([...indexes].sort((a, b) => a - b));
      expect(profileName).not.toHaveLength(0);
    }
    expect(
      adminProfile.find((step) => step.label === 'Clean dependency bootstrap')
        ?.timeoutMs,
    ).toBe(1_800_000);
    expect(
      adminProfile.find((step) => step.label === 'Admin Web production build')
        ?.args,
    ).toContain('--webpack');
    expect(
      adminProfile.find(
        (step) => step.label === 'Full Jest suite once for the exact candidate',
      )?.timeoutMs,
    ).toBe(900_000);
    expect(
      adminProfile.find(
        (step) =>
          step.label === 'Pre-dependency Module Execution Kit self-test',
      )?.timeoutMs,
    ).toBe(SELF_TEST_PROCESS_TIMEOUT_MS);
    expect(adminProfile[0]).toMatchObject({
      label: 'Pre-dependency Module Execution Kit self-test',
      command: 'node',
      args: [SELF_TEST_PATH],
    });
    expect(adminProfile[1]).toMatchObject({
      label: 'Module Execution Kit source checks',
      command: 'npm',
      args: ['run', 'module:runner:check'],
    });

    const selfTest = read(SELF_TEST_PATH);
    expect(
      selfTest.indexOf('await verifyFailFastRepositoryState();'),
    ).toBeLessThan(selfTest.indexOf('await verifyNativeStreams();'));
    expect(selfTest).toContain("['tools/module-runner/check-sources.mjs']");
    expect(selfTest).toContain("['run', 'module:validate']");
    expect(selfTest).toContain("['run', 'module:simulate']");
    expect(
      selfTest
        .slice(
          selfTest.indexOf('async function verifyFailFastRepositoryState()'),
          selfTest.indexOf('async function verifyNativeStreams()'),
        )
        .match(/stream: true/g),
    ).toHaveLength(3);
    const sourceCheck = read('tools/module-runner/check-sources.mjs');
    expect(sourceCheck).toContain(
      'validateValidationProfileContractFlexibility',
    );
    expect(sourceCheck).toContain(
      'validation-profile contracts must assert required labels and safety partial order',
    );
    expect(sourceCheck).toContain('stale validation-profile contract order');
    expect(sourceCheck).toContain('validateClosureInvariantBindings');
    expect(sourceCheck).toContain(
      'closure safety state must bind a namespaced machine-readable CLOSURE_INVARIANT marker',
    );
    expect(sourceCheck).toContain(
      'asserted closure invariant ${marker} is missing from the closure document',
    );
    expect(sourceCheck).toContain('validateValidationStepContractShapes');
    expect(sourceCheck).toContain(
      'ValidationStep accesses .${field} but the local type does not declare ${field}',
    );
    expect(sourceCheck).toContain(
      'validateDatabaseIntegrationProfileEnvironmentGuards',
    );
    expect(sourceCheck).toContain(
      'Database integration profile guard did not reject ${expectedMessage}',
    );
    expect(sourceCheck).toContain('validateBaseCompatibleGateOrderGuard');
    expect(sourceCheck).toContain(
      'validateStableContractMutableSurfaceIsolation',
    );
    expect(sourceCheck).toContain(
      'Stable contracts must not reference mutable current-state documents',
    );
    expect(sourceCheck).toContain(
      'validateAutomationReservationTimestampInvariant',
    );
    expect(sourceCheck).toContain(
      'Automation reservation actions must bind createdAt and terminal completedAt to databaseNow.',
    );
    expect(sourceCheck).toContain('validateStructuredLoggingLiteralEvents');
    expect(sourceCheck).toContain(
      'Structured logger events must use valid literal event names',
    );
    expect(sourceCheck).toContain(
      'Validation profile guard did not reject source check before self-test.',
    );

    const persistenceProfile =
      profiles.profiles['module-11-automation-persistence-foundation'];
    const validationDatabaseUrl =
      'postgresql://module_runner:module_runner@127.0.0.1:5432/module_runner_validation?schema=public';
    for (const label of [
      'Prisma schema validation',
      'Prisma client generation',
      'Nest application build',
    ]) {
      expect(
        persistenceProfile.find((step) => step.label === label)?.env,
      ).toEqual({ DATABASE_URL: validationDatabaseUrl });
    }

    expect(
      persistenceProfile.find(
        (step) =>
          step.label ===
          'Focused Module 11 persistence and handoff continuity tests',
      )?.args,
    ).toContain('test/historical-contract-transition-safety.contract.spec.ts');

    const manifestPolicy = read('tools/module-runner/lib/manifest.mjs');
    expect(manifestPolicy).toContain('validateValidationProfiles');
    expect(manifestPolicy).toContain('contains more than one npm ci');
    expect(manifestPolicy).toContain('duplicates Full Jest');
    expect(manifestPolicy).toContain('must order formatting before lint');
    expect(manifestPolicy).toContain(
      'Prisma validate steps require DATABASE_URL',
    );
    expect(manifestPolicy).toContain(
      'database integration steps require NODE_ENV=test',
    );
    expect(manifestPolicy).toContain(
      'database integration steps require DATABASE_INTEGRATION_TESTS_ALLOWED=true',
    );
    expect(manifestPolicy).toContain(
      'database integration steps require a safe literal URL or requiredEnv TEST_DATABASE_URL',
    );
    expect(manifestPolicy).toContain('validateDatabaseIntegrationUrl');
    expect(manifestPolicy).toContain('isDatabaseIntegrationCommand');
    const validationRunner = read('tools/module-runner/lib/validation.mjs');
    expect(validationRunner).toContain('Validation step env must be an object');
    expect(validationRunner).toContain('requires host environment variable');
    expect(validationRunner).toContain('step.requiredEnv');
  });

  it('uses one coherent repository-native line-ending policy', () => {
    const prettier = JSON.parse(read('.prettierrc')) as {
      endOfLine?: string;
    };

    expect(prettier.endOfLine).toBe('auto');
    expect(read('.eslintrc.js').trim()).toBe(
      "module.exports = require('./.eslintrc.cjs');",
    );
    expect(read('.gitattributes')).toContain(
      'tools/module-runner/** text eol=lf',
    );
    expect(read('.editorconfig')).toContain('end_of_line = lf');
    expect(read('tools/module-runner/lib/file-policy.mjs')).toContain(
      'verifyChangedTextFiles',
    );
    expect(read('tools/module-runner/lib/zip.mjs')).toContain('extractZip');
  });

  it('keeps push separate, guarded, and non-force', () => {
    const push = read('tools/module-runner/push.mjs');

    expect(push).toContain('verifyAllowedChanges');
    expect(push).toContain("'--left-right'");
    expect(push).toContain("'--count'");
    expect(push).toContain('HEAD:refs/heads/');
    expect(push).not.toMatch(/--force|force-with-lease/);
  });

  it('creates a portable handoff for a new chat or account', () => {
    const handoff = read('tools/module-runner/lib/handoff-core.mjs');

    expect(handoff).toContain('01-FIRST-MESSAGE-NEW-CHAT.txt');
    expect(handoff).toContain('05-STATE.json');
    expect(handoff).toContain('06-SESSION-PROTOCOL.md');
    expect(handoff).toContain('07-VALIDATION-POLICY.json');
    expect(handoff).toContain('08-CONTEXT-MAP.json');
    expect(handoff).toContain('09-FAILURE-PREVENTION.md');
    expect(handoff).toContain('10-CONTINUITY-CHECKLIST.md');
    const protocolVersion = handoff.match(
      /const HANDOFF_PROTOCOL_VERSION = (\d+);/,
    )?.[1];
    expect(protocolVersion).toBeDefined();
    expect(Number(protocolVersion)).toBeGreaterThanOrEqual(6);
    expect(handoff).toContain(
      'const HANDOFF_SCHEMA = `iot-platform-portable-handoff-v${HANDOFF_PROTOCOL_VERSION}`;',
    );
    expect(handoff).toContain('DRAFT CANDIDATE');
    expect(handoff).toContain('Cross-slice impact audit');
    expect(handoff).toContain('contract-surface-policy.json');
    expect(handoff).toContain('namespaced machine-readable');
    expect(handoff).toContain('CLOSURE_INVARIANT_');
    expect(handoff).toContain('Historical contracts must prove historical');
    expect(handoff).toContain('Full Jest');
    expect(handoff).toContain('No repository changes made.');
    expect(handoff).toContain("status = 'local-unpushed'");
    expect(handoff).toContain("status === 'remote-green'");
    expect(handoff).toContain('MANIFEST-SHA256.txt');
    expect(handoff).toContain('remote-green handoff requires both');
    expect(handoff).toContain('LOCAL_CHECKPOINT_UNVERIFIED_CONTINUITY_ONLY');
    expect(read('tools/module-runner/execute.mjs')).toContain(
      'localProofVerified: true',
    );
    expect(handoff).toContain('AI-Development-Kit/agent/REPOSITORY-MEMORY.md');
    expect(handoff).toContain('AI-Development-Kit/architecture/SYSTEM.md');
    expect(handoff).toContain('docs/ios-final-release-proof-policy.md');
    expect(handoff).toContain('OPTIONAL_CONTEXT_PATHS');
    expect(handoff).toContain('SAFE_DEFAULT_RELEASE_POLICY');
    expect(handoff).toContain('resolveReleasePolicy');
    expect(handoff).toContain('selectExistingContextPaths');
    expect(handoff).toContain("error?.code !== 'ENOENT'");
    const coreContextBlock = handoff.slice(
      handoff.indexOf('const CORE_CONTEXT_PATHS = ['),
      handoff.indexOf('];', handoff.indexOf('const CORE_CONTEXT_PATHS = [')),
    );
    expect(coreContextBlock).not.toContain(
      'docs/ios-final-release-proof-policy.md',
    );
    expect(handoff).toContain('iosNativeProofMode');
    expect(handoff).toContain(
      'iosNativeProofDeferredUntilFinalReleaseRequired',
    );
    expect(handoff).toContain('sharedIosCompatibilityRequiredDuringModules');
    expect(read('docs/architecture.md')).toContain(
      'Session Handoff Architecture',
    );
  });
});

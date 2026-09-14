import { access, readFile, writeFile, mkdir } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { createStoredZip } from './zip.mjs';
import { sha256Buffer, sha256File } from './hash.mjs';
import {
  commitNameStatus,
  commitSubject,
  currentBranch,
  git,
  headSha,
  trackedFileCount,
} from './git.mjs';

const HANDOFF_PROTOCOL_VERSION = 6;
const HANDOFF_SCHEMA = `iot-platform-portable-handoff-v${HANDOFF_PROTOCOL_VERSION}`;
const EXACT_FIRST_RESPONSE_ENDING = 'No repository changes made.';

const CORE_CONTEXT_PATHS = [
  'project-config.json',
  'package.json',
  'AI-Development-Kit/bootstrap/PROJECT-BOOTSTRAP-v1.0.md',
  'AI-Development-Kit/architecture/SYSTEM.md',
  'AI-Development-Kit/agent/REPOSITORY-MEMORY.md',
  'docs/module-lifecycle.md',
  'docs/project-state.md',
  'docs/roadmap.md',
  'test/contract-surface-policy.json',
  'tools/module-runner/profiles/validation-profiles.json',
];

const OPTIONAL_CONTEXT_PATHS = ['docs/ios-final-release-proof-policy.md'];

const SAFE_DEFAULT_RELEASE_POLICY = Object.freeze({
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

const REQUIRED_PRE_PACKAGE_GATES = [
  'Run dependency-free fail-fast checks before npm install or any long-running validation: exact inventory, SHA-256, safe paths, UTF-8, line endings, no trailing whitespace, and exactly one final newline.',
  'Run Git-native diff --check before dependency bootstrap, repeat it after formatting, and repeat it immediately before commit.',
  'Cross-slice impact audit over every contract and document that names the active module or changed concept.',
  'Register every new *.contract.spec.ts file in test/contract-surface-policy.json in the same candidate.',
  'Historical contracts must prove historical closure from immutable evidence; they must not freeze the current repository against approved later slices.',
  'Order validation for time efficiency without reducing safety: dependency-free checks, lifecycle/static checks, formatter/lint/focused tests, schema/build, Full Jest, then historical transition safety.',
  'Validation-profile contracts must assert required gates and safety partial order; they must not freeze an obsolete full label sequence that blocks approved efficiency improvements.',
  'Every new closure document must expose globally namespaced machine-readable CLOSURE_INVARIANT_* markers, and its stable contract must bind those exact markers instead of safety-critical narrative prose.',
  'Remove redundant validation steps only when a later mandatory gate proves the same invariant, and document the equivalence.',
  'Declare safety-critical command environments explicitly in validation profiles; database integration commands must set NODE_ENV=test on the exact step.',
  'Keep validation-profile contract fixture types aligned with every accessed step field; dependency-free source checks must reject undeclared command or env fields before npm install.',
  'Run Full Jest once for the exact candidate, not only focused tests.',
  'Run historical transition safety after current-state tests.',
  'Review exact git diff, tracked-file count, allowed paths, expected SHA-256 hashes, and final Git whitespace proof before packaging.',
  'Keep iOS native build, Apple signing, TestFlight, App Store, and physical-device proof deferred until the final release gate after Module 30; shared mobile compatibility remains mandatory in every current module.',
];

const FORBIDDEN_CONTINUITY_SHORTCUTS = [
  'Claiming a package is verified when any mandatory gate could not run.',
  'Using the owner computer as the first place to discover a predictable static, policy, or cross-slice failure.',
  'Editing main directly, force pushing, reset --hard, git clean, broad formatting, or bypassing the Module Execution Kit.',
  'Replaying a historical lifecycle transition that is already represented by the exact checkpoint.',
  'Changing or deleting a historical contract only to silence a test without preserving its original invariant.',
  'Starting the next slice before exact-SHA remote-green evidence for the current checkpoint.',
];

export async function createPortableHandoff({
  repositoryRoot,
  outputDirectory,
  status = 'local-unpushed',
  reportPath = null,
  validationLogPath = null,
  ciLogPath = null,
  ciRunId = null,
  localProofVerified = false,
  notes = [],
}) {
  await mkdir(outputDirectory, { recursive: true });

  if (status === 'remote-green' && (!ciLogPath || !ciRunId)) {
    throw new Error(
      'remote-green handoff requires both ciLogPath and ciRunId.',
    );
  }

  const head = await headSha(repositoryRoot);
  const parent = await headSha(repositoryRoot, 'HEAD^');
  const branch = await currentBranch(repositoryRoot);
  const subject = await commitSubject(repositoryRoot);
  const trackedFiles = await trackedFileCount(repositoryRoot);
  const changes = await commitNameStatus(repositoryRoot);
  const config = await readJson(repositoryRoot, 'project-config.json');
  const releasePolicy = resolveReleasePolicy(config.releasePolicy);
  const packageJson = await readJson(repositoryRoot, 'package.json');
  const registry = await readJson(
    repositoryRoot,
    config.development.moduleRegistry,
  );
  const activeModule = registry.modules.find(
    (entry) => entry.module === config.development.currentModule,
  );
  if (!activeModule) {
    throw new Error(
      `Active module ${config.development.currentModule} is not present in ${config.development.moduleRegistry}.`,
    );
  }

  const optionalContextPaths = await selectExistingContextPaths(
    repositoryRoot,
    OPTIONAL_CONTEXT_PATHS,
  );
  const contextPaths = [
    ...new Set([
      ...CORE_CONTEXT_PATHS,
      ...optionalContextPaths,
      activeModule.prompt,
    ]),
  ];
  const contextEntries = await loadContextEntries(repositoryRoot, contextPaths);
  const shortSha = head.slice(0, 7);
  const statusLabel =
    status === 'remote-green' ? 'REMOTE-GREEN' : 'LOCAL-CHECKPOINT';
  const snapshotPath = resolve(
    outputDirectory,
    `iot-platform-${shortSha}-full-tracked.zip`,
  );

  await git(repositoryRoot, [
    'archive',
    '--format=zip',
    `--output=${snapshotPath}`,
    'HEAD',
  ]);

  const snapshotSha = await sha256File(snapshotPath);
  const ciLogSha = ciLogPath ? await sha256File(ciLogPath) : null;
  const validationPolicy = createValidationPolicy({
    packageJson,
    activeModule,
    status,
    releasePolicy,
  });
  const contextMap = {
    schema: 'iot-platform-handoff-context-map-v1',
    exactCommit: head,
    activeModule: {
      number: activeModule.module,
      title: activeModule.title,
      prompt: activeModule.prompt,
      scope: activeModule.scope,
    },
    entries: contextEntries.map(({ sourcePath, handoffPath, sha256 }) => ({
      sourcePath,
      handoffPath,
      sha256,
    })),
  };
  const state = {
    schema: HANDOFF_SCHEMA,
    handoffProtocolVersion: HANDOFF_PROTOCOL_VERSION,
    status,
    packageTrust: {
      classification:
        status === 'remote-green'
          ? 'REMOTE_GREEN_VERIFIED_CHECKPOINT'
          : localProofVerified
            ? 'LOCAL_VERIFIED_CHECKPOINT_AWAITING_REMOTE_PROOF'
            : 'LOCAL_CHECKPOINT_UNVERIFIED_CONTINUITY_ONLY',
      verifiedPackageRule:
        'A package may be called VERIFIED only after every mandatory local gate in its official validation profile passes for the exact candidate.',
      draftPackageRule:
        'If a mandatory gate cannot run, label the artifact DRAFT CANDIDATE and do not ask the owner to execute it as a verified package.',
    },
    git: {
      branch,
      head,
      parent,
      subject,
      trackedFiles,
      changes,
    },
    releasePolicy,
    lifecycle: {
      activeModule: config.development.activeWorkstream,
      activeModuleNumber: config.development.currentModule,
      activeModulePrompt: activeModule.prompt,
      activeSlice: config.development.activeSlice,
      evidence: config.development.moduleLifecycleEvidence,
      moduleLifecycleState: config.development.moduleLifecycleState,
      nextModule: config.development.nextModule,
      nextModuleStatus: config.development.nextModuleStatus,
      productionDeploymentApproved: !/not approved/i.test(
        config.development.productionDeploymentStatus,
      ),
    },
    ci: {
      runId: ciRunId,
      logIncluded: Boolean(ciLogPath),
      logSha256: ciLogSha,
    },
    snapshot: {
      filename: basename(snapshotPath),
      sha256: snapshotSha,
    },
    continuity: {
      firstResponseMode: 'AUDIT_ONLY',
      firstResponseExactEnding: EXACT_FIRST_RESPONSE_ENDING,
      requiredReadOrder: [
        '00-START-HERE.txt',
        '01-FIRST-MESSAGE-NEW-CHAT.txt',
        '02-FIXED-WORKFLOW.md',
        '03-CURRENT-STATE.md',
        '04-NEXT-GATE.md',
        '05-STATE.json',
        '06-SESSION-PROTOCOL.md',
        '07-VALIDATION-POLICY.json',
        '08-CONTEXT-MAP.json',
        '09-FAILURE-PREVENTION.md',
        '10-CONTINUITY-CHECKLIST.md',
      ],
      sourceOfTruth: contextEntries.map((entry) => entry.sourcePath),
      crossSliceImpactAuditRequired: true,
      failFastValidationRequired: true,
      exactlyOneFinalNewlineRequired: true,
      gitWhitespaceProofBeforeLongRunningValidationRequired: true,
      validationOrderOptimizedForTime: true,
      automaticPushForbidden: true,
      productionApprovalSeparate: true,
      iosNativeProofMode: releasePolicy.iosNativeProofMode,
      iosProofBlocksModuleLifecycle:
        releasePolicy.iosProofBlocksModuleLifecycle,
      iosFinalReleaseGateAfterModule:
        releasePolicy.iosFinalReleaseGateAfterModule,
    },
    validationPolicy,
    context: contextMap,
    notes,
  };

  const startHere = `IoT PLATFORM — ${statusLabel}\n${'='.repeat(42)}\n\nHandoff protocol: v${HANDOFF_PROTOCOL_VERSION}\nBranch: ${branch}\nHEAD: ${head}\nParent: ${parent}\nCommit: ${subject}\nTracked files: ${trackedFiles}\nActive module: ${config.development.activeWorkstream}\nActive slice: ${config.development.activeSlice}\nStatus: ${status}\nPackage trust: ${state.packageTrust.classification}\nProduction deployment approved: ${state.lifecycle.productionDeploymentApproved ? 'yes' : 'no'}\niOS native proof mode: ${releasePolicy.iosNativeProofMode}\n\nThis package is the exact continuity source for a new chat session or account.\nVerify the external SHA-256 file, then verify MANIFEST-SHA256.txt before trusting any contained context.\nDo not infer a newer repository state, a remote-green status, a completed gate, or an approved deployment.\nThe first response in a new session is AUDIT ONLY and must end with: ${EXACT_FIRST_RESPONSE_ENDING}\n`;

  const firstMessage = `Saya melanjutkan pengembangan IoT Platform production-grade dari sesi atau akun lain.\n\nSaya mengunggah portable handoff protocol v${HANDOFF_PROTOCOL_VERSION} untuk exact commit:\n${head}\n\nRespons pertama wajib AUDIT ONLY. Jangan langsung membuat patch, script, ZIP, commit, push, mengaktifkan module, memulai slice, menutup slice, atau menyetujui deployment.\n\nVerifikasi SHA-256 eksternal dan MANIFEST-SHA256.txt, lalu baca berurutan:\n1. 00-START-HERE.txt\n2. 02-FIXED-WORKFLOW.md\n3. 03-CURRENT-STATE.md\n4. 04-NEXT-GATE.md\n5. 05-STATE.json\n6. 06-SESSION-PROTOCOL.md\n7. 07-VALIDATION-POLICY.json\n8. 08-CONTEXT-MAP.json\n9. 09-FAILURE-PREVENTION.md\n10. 10-CONTINUITY-CHECKLIST.md\n11. seluruh file context/ sesuai 08-CONTEXT-MAP.json\n12. evidence/${basename(snapshotPath)}\n\nSebelum perubahan, audit seluruh contract dan dokumen yang menyebut module aktif atau konsep yang akan berubah. Setiap contract baru wajib didaftarkan dalam test/contract-surface-policy.json. Historical contract harus memeriksa bukti historis, bukan membekukan current repository terhadap slice berikutnya.\n\nJangan sebut paket VERIFIED jika Full Jest, historical transition matrix, atau gate wajib lain tidak dijalankan. Jika environment memblokir gate wajib, tahan paket sebagai DRAFT CANDIDATE. Jangan gunakan komputer owner sebagai tempat pertama menemukan kegagalan statis yang dapat diprediksi.\n\nPertahankan architecture vendor-neutral, protocol-neutral, capability-driven, tenant-isolated, secure, observable, testable, dan extensible. Jangan melompat module. Jangan push otomatis. Production deployment tetap memerlukan persetujuan terpisah.\n\nAkhiri respons pertama dengan tepat:\n${EXACT_FIRST_RESPONSE_ENDING}\n`;

  const fixedWorkflow = `# Fixed Workflow\n\n1. Verify the external handoff SHA-256 and internal \`MANIFEST-SHA256.txt\`.\n2. Read every required handoff document and embedded context file before reasoning about the next gate.\n3. Confirm exact branch, HEAD, lifecycle state, active module, active slice, CI status, and deployment lock.\n4. Read repository source-of-truth and the active module prompt from \`context/\`.\n5. Run a cross-slice impact audit before mutation: search every contract, policy, document, schema assertion, and forbidden-current-state assertion related to the changed concept.\n6. Run \`npm run module:doctor\` before mutation.\n7. Use a versioned slice manifest and content-addressed exact-file payload.\n8. Register every new contract test in \`test/contract-surface-policy.json\` in the same candidate.\n9. Before dependency bootstrap, prove payload inventory/hash/text hygiene and Git-native whitespace; reject any missing newline, extra blank line at EOF, mixed line endings, or trailing whitespace.\n10. Prove changes in one disposable Git worktree with time-efficient gate ordering: fail-fast checks first, then focused checks, then mandatory full proof.\n11. Repeat Git-native whitespace proof after formatting and immediately before commit.\n12. Focused tests are necessary but never sufficient; Full Jest and historical transition safety remain mandatory.\n13. Historical contracts must preserve historical invariants without prohibiting approved later slices.\n14. Keep iOS native build/signing/TestFlight/device proof deferred until the final release gate while running shared mobile compatibility checks in current modules.\n15. Call a package VERIFIED only when every mandatory local gate passed for the exact candidate. Otherwise keep it DRAFT and do not hand it to the owner as executable.\n16. Fast-forward only the exact proven commit into the main worktree.\n17. Create artifacts and a protocol-v${HANDOFF_PROTOCOL_VERSION} portable handoff.\n18. Stop without push.\n19. Push only after explicit approval.\n20. Confirm GitHub Actions at the exact pushed SHA.\n21. After CI is green, create a remote-green handoff with exact CI log and run ID when continuity across sessions is expected.\n\nForbidden shortcuts:\n${FORBIDDEN_CONTINUITY_SHORTCUTS.map((item) => `- ${item}`).join('\n')}\n`;

  const currentState = `# Current State\n\n- Handoff protocol: v${HANDOFF_PROTOCOL_VERSION}\n- Branch: \`${branch}\`\n- HEAD: \`${head}\`\n- Parent: \`${parent}\`\n- Commit subject: \`${subject}\`\n- Tracked files: ${trackedFiles}\n- Active module: ${config.development.activeWorkstream}\n- Active module prompt: \`${activeModule.prompt}\`\n- Active slice: ${config.development.activeSlice}\n- Lifecycle state: ${config.development.moduleLifecycleState}\n- Lifecycle evidence: ${config.development.moduleLifecycleEvidence}\n- Next module: ${config.development.nextModule}\n- Next-module lock: ${config.development.nextModuleStatus}\n- Production deployment approved: ${state.lifecycle.productionDeploymentApproved ? 'yes' : 'no'}\n- iOS native proof mode: ${releasePolicy.iosNativeProofMode}\n- iOS proof blocks module lifecycle: ${releasePolicy.iosProofBlocksModuleLifecycle ? 'yes' : 'no'}\n- iOS final release gate after module: ${releasePolicy.iosFinalReleaseGateAfterModule}\n- Handoff status: ${status}\n- Package trust: ${state.packageTrust.classification}\n${ciRunId ? `- GitHub Actions run: ${ciRunId}\n` : ''}\n## Exact commit paths\n\n${changes.map((change) => `- ${change.status} \`${change.path}\``).join('\n')}\n`;

  const nextGate = createNextGate({
    status,
    head,
    activeModule,
    activeSlice: config.development.activeSlice,
    ciRunId,
  });

  const sessionProtocol = `# Session Continuity Protocol v${HANDOFF_PROTOCOL_VERSION}\n\n## First-response contract\n\n- Mode: **AUDIT ONLY**.\n- No repository mutation, package creation, lifecycle transition, push, or deployment approval.\n- Verify handoff integrity and reconcile exact state from the included evidence.\n- End the first response exactly with: \`${EXACT_FIRST_RESPONSE_ENDING}\`\n\n## Trust hierarchy\n\n1. External handoff SHA-256 file.\n2. Internal \`MANIFEST-SHA256.txt\`.\n3. \`05-STATE.json\` and \`08-CONTEXT-MAP.json\`.\n4. Embedded files under \`context/\`.\n5. Exact tracked snapshot under \`evidence/\`.\n6. Included report, validation log, and CI log when present.\n7. Chat recollection is never a stronger source than the exact files above.\n\n## Package classifications\n\n- **DRAFT CANDIDATE:** one or more mandatory gates did not run or did not pass. Do not ask the owner to execute it as verified.\n- **LOCAL VERIFIED CHECKPOINT:** exact candidate passed every mandatory local gate and main was fast-forwarded, but push/remote CI is not proven.\n- **REMOTE-GREEN VERIFIED CHECKPOINT:** exact pushed SHA has attached CI evidence and every required remote job is green.\n\n## Cross-slice continuity rule\n\nBefore changing a concept, search all repository contracts and documents that mention it. A closed-slice contract must preserve what was true at closure using immutable evidence; it must not assert that the current repository can never evolve through a later approved slice.\n\n## Failure protocol\n\n1. Stop at the first proven failure.\n2. Preserve the safe checkpoint; do not modify main.\n3. Classify the failure as implementation, policy registration, historical-contract transition, lifecycle, environment, or tooling.\n4. Fix the root cause and add a fail-fast regression guard that catches predictable defects before dependency bootstrap or long-running gates.\n5. Preserve exactly one final newline in every changed text file and repeat Git-native whitespace proof after formatting.\n6. Re-run the complete official profile for the exact replacement candidate.\n`;

  const failurePrevention = `# Failure Prevention Rules\n\nThe following rules are mandatory for every future slice package:\n\n${REQUIRED_PRE_PACKAGE_GATES.map((item, index) => `${index + 1}. ${item}`).join('\n')}\n\n## Known recurring failure classes now guarded\n\n- **Unclassified contract:** every new \`*.contract.spec.ts\` must be added to \`test/contract-surface-policy.json\` in the same payload, and its focused test must verify that registration.\n- **Historical contract blocking a later slice:** historical tests must read closure evidence or stable historical documents instead of asserting that current Prisma schema, current \`AppModule\`, or current runtime can never evolve.\n- **Focused-only false confidence:** a candidate is not VERIFIED until Full Jest and historical transition safety pass for the exact bytes.\n- **Environment-limited validation:** an unavailable registry, mirror, or dependency does not convert an unrun gate into a pass; the package remains DRAFT.\n- **Lifecycle replay:** transition matrices must detect the exact checkpoint and run only the legal remaining suffix.\n- **Late EOF/whitespace discovery:** every changed text file must have exactly one final newline and no trailing whitespace; dependency-free and Git-native checks must run before npm install, after formatting, and before commit.\n- **Time-inefficient duplicate proof:** retain all safety invariants, but remove a redundant step when a later mandatory gate proves the same result and that equivalence is explicit.\n- **Closure prose/contract drift:** new closure records must use namespaced machine-readable \`CLOSURE_INVARIANT_\` markers; source checks must prove bidirectional document-to-contract binding before dependency bootstrap.\n- **Premature iOS native gate:** current module profiles must not require Xcode, CocoaPods, Apple signing, IPA creation, TestFlight, simulator, or physical iPhone proof; those belong only to the final release gate after Module 30, while shared mobile compatibility remains mandatory.\n- **Validation-step fixture drift:** contract-local \`ValidationStep\` types must declare every accessed profile field, including \`command\` and optional \`env\`; source checks reject mismatches before dependency bootstrap.\n\n## Forbidden responses in a new session\n\n- Do not say “ready” or “verified” based only on static inspection.\n- Do not regenerate code from memory when the snapshot is available.\n- Do not ask the owner to repeat facts already present in this handoff.\n- Do not activate the next module or approve production implicitly.\n`;

  const continuityChecklist = `# Continuity Checklist\n\n## Audit-only first response\n\n- [ ] Verify external handoff SHA-256.\n- [ ] Verify every line in \`MANIFEST-SHA256.txt\`.\n- [ ] Confirm branch and HEAD equal \`${branch}\` / \`${head}\`.\n- [ ] Confirm status is \`${status}\`; do not infer remote-green.\n- [ ] Read \`05-STATE.json\`, \`07-VALIDATION-POLICY.json\`, and \`08-CONTEXT-MAP.json\`.\n- [ ] Read every embedded \`context/\` file.\n- [ ] Inspect the exact tracked snapshot.\n- [ ] State the active module, active slice, next legal gate, and deployment lock.\n- [ ] End exactly with \`${EXACT_FIRST_RESPONSE_ENDING}\`.\n\n## Before creating any candidate\n\n- [ ] Search all related contract tests and policy registrations.\n- [ ] Search for historical assertions against current schema/module/runtime.\n- [ ] Confirm iOS native proof remains deferred until the final release gate and shared mobile compatibility remains required.\n- [ ] For a new closure record, define namespaced \`CLOSURE_INVARIANT_\` markers and bind every marker in the stable contract; do not assert safety state through prose.\n- [ ] Define exact added/modified/deleted paths and tracked-file counts.\n- [ ] Run dependency-free inventory/hash/text checks and require exactly one final newline.\n- [ ] Run Git-native whitespace proof before dependency bootstrap and after formatting.\n- [ ] Use one disposable worktree and official validation profile ordered for time efficiency.\n- [ ] Run focused tests, Full Jest, and historical transitions.\n- [ ] Label the package DRAFT if any mandatory gate is unrun.\n- [ ] Create a new protocol-v${HANDOFF_PROTOCOL_VERSION} handoff after a verified commit.\n\n## After push and green CI\n\nCreate a remote-green handoff with:\n\n\`npm run module:handoff -- --status remote-green --ci-log <exact-ci-log.zip-or-log> --ci-run-id <run-id> --report <module-runner-report> --validation-log <validation-log>\`\n`;

  const entries = [
    { name: '00-START-HERE.txt', data: Buffer.from(startHere, 'utf8') },
    {
      name: '01-FIRST-MESSAGE-NEW-CHAT.txt',
      data: Buffer.from(firstMessage, 'utf8'),
    },
    {
      name: '02-FIXED-WORKFLOW.md',
      data: Buffer.from(fixedWorkflow, 'utf8'),
    },
    {
      name: '03-CURRENT-STATE.md',
      data: Buffer.from(currentState, 'utf8'),
    },
    { name: '04-NEXT-GATE.md', data: Buffer.from(nextGate, 'utf8') },
    {
      name: '05-STATE.json',
      data: Buffer.from(`${JSON.stringify(state, null, 2)}\n`, 'utf8'),
    },
    {
      name: '06-SESSION-PROTOCOL.md',
      data: Buffer.from(sessionProtocol, 'utf8'),
    },
    {
      name: '07-VALIDATION-POLICY.json',
      data: Buffer.from(
        `${JSON.stringify(validationPolicy, null, 2)}\n`,
        'utf8',
      ),
    },
    {
      name: '08-CONTEXT-MAP.json',
      data: Buffer.from(`${JSON.stringify(contextMap, null, 2)}\n`, 'utf8'),
    },
    {
      name: '09-FAILURE-PREVENTION.md',
      data: Buffer.from(failurePrevention, 'utf8'),
    },
    {
      name: '10-CONTINUITY-CHECKLIST.md',
      data: Buffer.from(continuityChecklist, 'utf8'),
    },
    ...contextEntries.map((entry) => ({
      name: entry.handoffPath,
      data: entry.data,
    })),
    { name: `evidence/${basename(snapshotPath)}`, path: snapshotPath },
  ];

  for (const optionalPath of [reportPath, validationLogPath, ciLogPath]) {
    if (optionalPath) {
      entries.push({
        name: `evidence/${basename(optionalPath)}`,
        path: optionalPath,
      });
    }
  }

  const manifestLines = [];
  for (const entry of entries) {
    const data = entry.data ?? (await readFile(entry.path));
    const sha256 = sha256Buffer(data);
    manifestLines.push(`${sha256}  ${entry.name}`);
  }
  entries.push({
    name: 'MANIFEST-SHA256.txt',
    data: Buffer.from(`${manifestLines.join('\n')}\n`, 'utf8'),
  });

  const handoffPath = resolve(
    outputDirectory,
    `IoT-Platform-PORTABLE-HANDOFF-${shortSha}-${statusLabel}.zip`,
  );
  await createStoredZip(handoffPath, entries);
  const handoffSha = await sha256File(handoffPath);
  const shaPath = `${handoffPath.slice(0, -4)}-SHA256.txt`;
  await writeFile(shaPath, `${handoffSha}  ${basename(handoffPath)}\n`, 'utf8');

  return {
    handoffPath,
    shaPath,
    handoffSha,
    snapshotPath,
    snapshotSha,
    state,
  };
}

function resolveReleasePolicy(policy) {
  if (!policy || typeof policy !== 'object' || Array.isArray(policy)) {
    return { ...SAFE_DEFAULT_RELEASE_POLICY };
  }
  return { ...SAFE_DEFAULT_RELEASE_POLICY, ...policy };
}

function createValidationPolicy({
  packageJson,
  activeModule,
  status,
  releasePolicy,
}) {
  return {
    schema: 'iot-platform-handoff-validation-policy-v1',
    handoffProtocolVersion: HANDOFF_PROTOCOL_VERSION,
    checkpointStatus: status,
    releasePolicy,
    activeModule: {
      number: activeModule.module,
      title: activeModule.title,
      prompt: activeModule.prompt,
    },
    packageClassification: {
      draft:
        'Mandatory gate missing, blocked, skipped, or failed. Artifact must not be presented as verified.',
      localVerified:
        'Every mandatory local gate passed for the exact candidate and main matches the proven commit; push is not proven.',
      remoteGreen:
        'Exact pushed SHA has attached CI evidence and every required remote job is green.',
    },
    requiredPrePackageGates: REQUIRED_PRE_PACKAGE_GATES,
    requiredRepositoryCommands: {
      moduleDoctor: packageJson.scripts['module:doctor'],
      moduleExecute: packageJson.scripts['module:execute'],
      sourceCheck: packageJson.scripts['module:runner:check'],
      selfTest: packageJson.scripts['module:runner:self-test'],
      lifecycleValidate: packageJson.scripts['module:validate'],
      lifecycleSimulate: packageJson.scripts['module:simulate'],
      contracts: packageJson.scripts['test:contracts'],
      historicalState: packageJson.scripts['test:historical-contract-state'],
      historicalTransitions:
        packageJson.scripts['test:historical-contract-transitions'],
      fullJest: `${packageJson.scripts.test} --runInBand`,
      build: packageJson.scripts.build,
      lint: packageJson.scripts['lint:check'],
    },
    mandatoryRules: {
      fullJestRequired: true,
      historicalTransitionSafetyRequired: true,
      contractPolicyRegistrationRequired: true,
      crossSliceImpactAuditRequired: true,
      exactFileHashesRequired: true,
      failFastTextHygieneRequired: true,
      exactlyOneFinalNewlineRequired: true,
      gitWhitespaceBeforeDependencyBootstrapRequired: true,
      gitWhitespaceAfterFormattingRequired: true,
      finalGitWhitespaceBeforeCommitRequired: true,
      timeEfficientValidationOrderingRequired: true,
      redundantGateRemovalRequiresEquivalentMandatoryProof: true,
      disposableWorktreeRequired: true,
      automaticPushForbidden: true,
      separateProductionApprovalRequired: true,
      iosNativeProofDeferredUntilFinalReleaseRequired: true,
      sharedIosCompatibilityRequiredDuringModules: true,
      environmentBlockMeansPass: false,
    },
    forbiddenShortcuts: FORBIDDEN_CONTINUITY_SHORTCUTS,
  };
}

function createNextGate({ status, head, activeModule, activeSlice, ciRunId }) {
  const statusRule =
    status === 'remote-green'
      ? `This handoff includes remote-green evidence${ciRunId ? ` from GitHub Actions run ${ciRunId}` : ''}. The next bounded gate may be audited, but no mutation may begin before the audit-only first response is complete.`
      : `This handoff is local-unpushed. Do not start another implementation or lifecycle transition until exact-SHA remote-green evidence for ${head} is supplied and audited.`;

  return `# Next Gate\n\n- Current module: Module ${activeModule.module} - ${activeModule.title}\n- Current slice: ${activeSlice}\n- Checkpoint: \`${head}\`\n- Status: \`${status}\`\n\n${statusRule}\n\nDetermine the next bounded gate only from the embedded source-of-truth, active-module prompt, exact snapshot, and CI evidence. Do not infer it from chat memory.\n\nBefore any candidate, perform the cross-slice impact audit in \`09-FAILURE-PREVENTION.md\`.\n\nRequired execution path:\n\n\`npm run module:doctor -- --manifest <manifest>\`\n\`npm run module:execute -- --manifest <manifest> --payload <payload-directory>\`\n\nPush and production deployment remain separate explicitly approved operations.\n`;
}

async function readJson(repositoryRoot, relativePath) {
  return JSON.parse(
    await readFile(resolve(repositoryRoot, relativePath), 'utf8'),
  );
}

async function selectExistingContextPaths(repositoryRoot, paths) {
  const existing = [];
  for (const sourcePath of paths) {
    try {
      await access(resolve(repositoryRoot, sourcePath));
      existing.push(sourcePath);
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }
  return existing;
}

async function loadContextEntries(repositoryRoot, paths) {
  const entries = [];
  for (const sourcePath of paths) {
    const data = await readFile(resolve(repositoryRoot, sourcePath));
    entries.push({
      sourcePath,
      handoffPath: `context/${sourcePath}`,
      sha256: sha256Buffer(data),
      data,
    });
  }
  return entries;
}

# Module Execution Framework

## Status

Module Execution Kit v1.3.0 is the repository-standard execution path for bounded
slices from Module 10 through Module 30. It retains the exact-file and
disposable-worktree safety model while removing duplicated broad validation and
persistent Windows workspace fallbacks.

It is development tooling. It does not change the product domain, runtime
architecture, tenant model, database schema, MQTT transport, Redis behavior, or
production deployment approval.

## Why this exists

One-off PowerShell helpers repeatedly mixed concerns that should be isolated:

- exact-file payload materialization;
- Windows native-process stream handling;
- line-ending conversion;
- validation;
- commit creation;
- artifact packaging;
- push preparation.

Those helpers could pass a parser preflight and still fail later because the main
repository became the first real Windows test environment. The permanent runner
moves proof into a disposable Git worktree and keeps the main worktree untouched
until the full validation profile passes.

## Required workflow

1. Create one versioned slice manifest.
2. Create one content-addressed exact-file payload directory.
3. Review exact scope, hashes, and owner approval without running a duplicate
   standalone Doctor.
4. Run `module:package`; it performs the single authoritative environment Doctor
   immediately before proof.
5. Create one owned disposable workspace and detached worktree at the exact base
   SHA.
6. Materialize and verify only the allowlisted exact payload paths.
7. Validate the exact staged tree through one validation profile.
8. Commit inside the disposable worktree.
9. Verify parent, subject, changed paths, tracked-file count, and clean state.
10. Verify exact target-file SHA-256 values after validation.
11. Fast-forward the main branch to the exact proven commit.
12. Run bounded post-apply verification.
13. Remove the worktree, dependency tree, generated temporary files, workspace,
    and repository lock.
14. Create snapshot, report, validation log, and portable handoff only after
    cleanup proof.
15. Stop without push.

The exact commit proved in the disposable worktree is the commit moved into the
main branch. The framework does not rematerialize the payload in the main worktree
and does not cherry-pick a newly generated equivalent commit.

## Commands

```powershell
# Diagnostic only when no package execution follows. Normal commit flow does
# not run this separately because module:package performs the authoritative Doctor.
npm.cmd run module:doctor -- --manifest C:\path\to\slice-manifest.json

npm.cmd run module:execute -- `
  --manifest C:\path\to\slice-manifest.json `
  --payload C:\path\to\slice-payload

npm.cmd run module:package -- `
  --archive C:\path\to\slice-package.zip `
  --output C:\path\to\artifacts

npm.cmd run module:push -- `
  --manifest C:\path\to\slice-manifest.json `
  --sha <exact-local-commit-sha>

npm.cmd run module:handoff -- `
  --status remote-green `
  --ci-run-id <run-id> `
  --ci-log C:\path\to\github-actions-logs.zip

npm.cmd run module:cleanup
```

`module:execute` performs local proof and local commit only. It never pushes.
`module:push` is a separate guarded operation that verifies the manifest, exact
commit, parent, path boundary, remote baseline, and ahead/behind state before a
plain non-force push.

## Manifest contract

Each manifest locks:

- full base SHA;
- branch and optional remote branch;
- commit subject;
- tracked-file count before and after;
- payload format and directory;
- exact added, modified, and deleted paths;
- SHA-256 for every exact added or modified payload file;
- forbidden path prefixes;
- validation profile;
- optional post-apply validation profile.

The schema is stored at
`tools/module-runner/schema/slice-manifest.schema.json`. New slice manifests
start from `tools/module-runner/manifests/TEMPLATE.json`.

## Line-ending policy

Repository blobs remain Git text. Every payload file is content-addressed and must
already use the approved line-ending style: modified files preserve the base blob
style, new source and documentation files use UTF-8 without BOM and LF, and new
PowerShell, CMD, and BAT files use CRLF.

Prettier uses `endOfLine: auto` so a developer checkout does not produce false
format failures solely because Windows materialized CRLF. The framework verifies exact bytes and line-ending policy without silently rewriting
the payload before validation.

ESLint and Prettier remain separate gates. `.eslintrc.js` delegates to the
non-mutating `.eslintrc.cjs` policy so an ad hoc ESLint command cannot silently
activate a different Prettier line-ending contract.

## Windows portability contract

The runner must be safe on native Windows without requiring the operator to set
`TEMP`, rename a manifest, edit a package path, or extend a timeout manually.

Version 1.3.0 therefore requires:

- automatic selection from an explicit `--work-root`, otherwise `%TEMP%\iw`;
  `IOT_MODULE_WORK_ROOT` and `C:\.iotw` are not implicit fallbacks;
- one repository-scoped atomic workspace lock so a second candidate cannot begin
  while an active or stale workspace exists;
- a minimum free-disk guard before extraction or dependency bootstrap;
- one owned package workspace containing both archive extraction and the disposable
  Git worktree, instead of separate nested workspaces;
- an ownership marker on every temporary workspace and bounded official cleanup
  that skips unmarked, live, or foreign workspaces;
- a short randomized workspace name and a one-character worktree directory;
- projected generated-path validation before the disposable worktree is created;
- exact payload hash and line-ending validation before dependency installation;
- concise successful output with a thirty-second heartbeat while full stdout,
  stderr, exit code, and duration remain in the validation artifact;
- bounded output capture so a verbose command cannot exhaust runner memory;
- Windows process-tree termination through `taskkill.exe` when a command exceeds
  its declared timeout;
- exactly one dependency-free runner self-test before `npm ci`, so tooling regressions fail in seconds instead of after dependency installation and are not repeated inside Full Jest;
- explicit regression coverage for both a selected safe requested root and rejection of an over-budget requested root without unsafe fallback;
- command-specific timeout policy, including thirty minutes for `npm ci`;
- a webpack local Admin Web proof to avoid Turbopack source-map path inflation on
  Windows, while exact-SHA GitHub Actions keeps the repository-default build as
  the final platform gate;
- safe ZIP extraction with traversal, symlink, encryption, compression-method,
  size, and CRC checks;
- `module:package` as the normal one-command path for future versioned slice ZIPs.

The workspace root, projected path length, free-disk state, and exact checkpoint
are reported by the single Doctor inside `module:package` and written to the
execution log. Standalone `module:doctor` is diagnostic and must not be added as
a duplicate normal pre-package gate.

## Dependency proof

Disposable worktrees do not reuse root workspace symlinks from the main
worktree. Broad validation profiles remain loadable by the exact base runner:
one Module Execution Kit self-test runs first, followed by the explicit runner
source check and one clean
`npm ci --prefer-offline --no-audit --fund=false --progress=false` bootstrap.
The self-test begins with source, lifecycle-validation, and lifecycle-simulation
checks before its longer probes. Changed-file formatting, repository lint, and
the explicit lifecycle gates then run in the base-compatible external order.
Focused tests precede Prisma validation and generation, build, database
integration, the single broad Full Jest pass, and historical transition proof.
Projected lifecycle states run only lifecycle validation, state-sensitive
contracts, and exact transition assertions unless source or runtime behavior
changes.

Validation profiles use one stable bootstrap placeholder: `{changed}`. Any
subset filtering is performed by repository scripts, and unknown placeholders
are rejected before dependency installation. This keeps a runner upgrade
executable by the exact base runner that is proving the candidate.

## Failure behavior

A proof failure removes the owned disposable worktree and workspace before its
versioned failure report and validation log are finalized. The report records
cleanup verification, remaining owned workspace count, and cleanup errors while
leaving the main repository at the exact original SHA. Cleanup failure cannot
replace the first proven validation error. There is no `git reset --hard`, `git clean`, force push, automatic push, or
broad repository formatter.

After the main branch fast-forwards to a proven commit, later artifact-generation
failures are reported transparently; the proven local commit is not silently
rewritten.

## Validation profiles

Profiles live in
`tools/module-runner/profiles/validation-profiles.json`. The initial profiles
cover:

- execution framework bootstrap;
- bounded post-apply verification;
- Module 10 Admin Web implementation;
- the integrated Module 10 Admin Web one-package acceptance profile;
- repository historical-contract transition proof;
- Workflow Efficiency Remediation with one Full Jest pass and state-sensitive projections.

Later modules may add risk-specific profiles without changing the execution
engine.

## Portable handoff

`module:handoff` creates a purpose-built package for transfer to a new chat or
another account. It includes:

- exact Git state;
- current lifecycle state;
- first-message instructions;
- fixed workflow;
- next-gate rules;
- machine-readable state JSON;
- exact tracked repository snapshot;
- optional validation and CI evidence;
- an internal SHA-256 manifest covering every packaged entry.

A `remote-green` handoff requires both the exact GitHub Actions run identifier
and its downloaded log archive.

A receiving session must begin with audit-only and must not infer a newer state
than the uploaded package.

## Security and architecture boundary

The execution framework must remain:

- repository-local and dependency-neutral;
- non-interactive for deterministic validation;
- explicit about every changed path;
- free from embedded secrets;
- free from product runtime behavior;
- unable to activate Module 11 or approve production deployment implicitly.

### Host-provided validation secrets

Validation steps may declare `requiredEnv` names. The runner fails before command execution when a required host variable is absent, and it inherits the value without storing credentials in profile JSON or package payload.

## Deferred iOS native proof

Current module profiles must preserve shared Expo and React Native compatibility
through `npm run mobile:validate`, but they must not require Xcode, CocoaPods,
Apple signing, IPA creation, TestFlight, an iOS simulator, or a physical iPhone.
Those native proofs are a separate final-release gate after Module 30.

The portable handoff records the machine-readable release policy from
`project-config.json` and embeds
`docs/ios-final-release-proof-policy.md`. Dependency-free source checks reject
any candidate that makes iOS native proof block the current module lifecycle,
removes shared mobile compatibility validation, or moves the native release
gate before Module 30.

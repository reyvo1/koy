# Module Execution Kit Efficiency Remediation

## Status

Approved bounded remediation under Module 10 Slice 10.14 after the exact
`5337ab8aba3891333f0a904a8bcd05f0afe51d5f` Completion Review closure became
remote-green. This remediation does not complete Module 10, activate Module 11,
push, or approve deployment.

## Problem proven by the previous validation

The previous Completion Review package performed one dependency bootstrap, then
ran repository contracts separately before a Full Jest pass that already
included those contracts. Its five projected lifecycle states repeated both the
contract suite and Full Jest. The execution was safe, but the same candidate
source was exercised repeatedly without a source or runtime change.

The Windows fallback workspace also preferred `C:\.iotw`, so interrupted or
explicitly retained worktrees could consume persistent disk space outside the
repository.

## Efficient validation contract

The exact candidate now receives one clean dependency bootstrap and one Full
Jest pass. Full Jest remains the broad runtime, unit, integration-in-process, and
contract regression gate.

The projected lifecycle matrix still proves all five required states:

1. current exact checkpoint;
2. Module 10 Completion Review closure;
3. `module:complete 10`;
4. Module 11 activation;
5. Module 11 Slice 11.1.

Each projection runs lifecycle validation and only the two state-sensitive
contracts:

- `test/module-lifecycle.contract.spec.ts`;
- `test/historical-contract-transition-safety.contract.spec.ts`.

Immutable evidence files are hashed before projection and must remain
byte-identical afterward. Full Jest is repeated in a projection only when that
projection changes source or runtime behavior, or when a future authoritative
R3 profile explicitly requires it.

## Single Doctor policy

The normal commit path does not run a standalone Doctor and then repeat the same
checks inside packaging. `module:package` performs the one authoritative Doctor
against the exact active repository immediately before proof. Standalone
`module:doctor` is reserved for diagnostics when no package execution follows.

## Workspace contract

The default disposable root is `%TEMP%\iw`; `C:\.iotw` is no longer an implicit
fallback. One repository-scoped atomic lock permits only one active candidate.
Every temporary directory receives an ownership marker containing the repository
root, exact temporary root, process ID, and creation time. A run stops before
archive extraction when free space is below the default 2 GiB safety floor or an
owner-configured `IOT_MODULE_MIN_FREE_BYTES` value.

Normal package execution uses one owned workspace for archive extraction and the
disposable Git worktree, then removes both before success or failure evidence is
finalized. Cleanup errors cannot replace the first proven validation failure.
The report records cleanup verification and remaining workspace count. The
official command `npm.cmd run module:cleanup` removes only owned, inactive, stale
Module Runner workspaces. An explicit `--include-legacy-worktrees` mode may clean
old unmarked `m-*\w` worktrees only after their `.git` pointer proves ownership
by the active repository. Unrelated and live directories remain untouched.

## Cheap-gate ordering

Broad validation profiles keep the externally visible order required by the
exact base runner: self-test, source check, `npm ci`, changed-file formatting,
lint, lifecycle validation, and lifecycle simulation. The first self-test is
still a cheap fail-fast gate because its opening preamble immediately runs the
repository source check, lifecycle validation, and lifecycle simulation before
its longer hermetic probes. This compatibility bridge prevents a candidate from
changing the validator and the validated profile contract in one unbootstrappable
transaction. Database integration then runs immediately so host credentials and
database permissions fail before focused tests, Prisma validation and generation,
build, one Full Jest pass, and the projected historical transition matrix. The
profile declares `requiredEnv: ["TEST_DATABASE_URL"]`; the runner inherits the
value without storing credentials in repository data.

Validation profile bootstrap compatibility is intentionally stable. The runner
interprets only the `{changed}` placeholder; filtering for TypeScript or other
subsets belongs inside dedicated repository scripts. Unknown placeholder tokens are
rejected by the dependency-free source check before `npm ci`, so a runner
candidate never depends on profile syntax unavailable in its exact base.

## Console and evidence

Long successful commands may run quietly while retaining a heartbeat. Their full
stdout, stderr, exit code, and duration remain in the validation artifact. The
console reports only the heartbeat and final duration summary. On failure, the
captured output remains available and the workflow stops at the first proven
error.

## Safety invariants retained

- payloads are never applied directly to the main worktree;
- exact manifest paths and SHA-256 hashes remain mandatory;
- the candidate is committed in an isolated detached worktree first;
- main advances only through an exact fast-forward;
- commit, push, completion, activation, and deployment remain separate owner
  approvals;
- exact-SHA GitHub Actions remains the remote-green authority;
- no force push, amend, `reset --hard`, `git clean`, or automatic rollback is
  introduced.

Protocol/schema continuity is also part of the dependency-free source gate. The
handoff schema must derive from one protocol-version constant, and stable tooling
contracts may not pin a literal handoff version. This makes a future protocol
upgrade fail in the fast source check rather than after dependency installation.

## Bootstrap-Compatible Fail-Fast Ordering

A candidate cannot use a validation-profile order that the exact base runner rejects before payload code is loaded. Broad profiles therefore keep the externally visible bootstrap-compatible order: self-test, source check, dependency bootstrap, formatting, lint, lifecycle, schema/build, Full Jest, and historical transitions.

Time efficiency is preserved inside the first self-test step. Its first operation runs the repository source check, lifecycle validation, and lifecycle simulation before any longer hermetic self-test probe. Therefore predictable source, protocol, profile, and lifecycle defects still stop in seconds, while the exact base runner remains capable of loading the candidate. This compatibility bridge must remain until a separately proven runner-bootstrap transition can change the external profile contract safely.

## Validation-profile contract evolution

Contract tests for validation profiles must prove required gates and their safety partial order. They assert machine-readable command invariants and the base-compatible safety partial order rather than freezing narrative labels. Cheap package audit and `module:runner:check` reject any source-first profile that the exact base runner cannot load, while a separately proven runner-bootstrap slice is required before changing this external contract.

## Closure invariant binding

New immutable closure records must not couple safety state to narrative wording. Each new `docs/*-closure.md` file must define globally namespaced machine-readable markers using the form `CLOSURE_INVARIANT_<SCOPE>_<KEY>=<VALUE>` and exactly one `<SCOPE>_SCHEMA=1` marker. The stable contract must assert every marker exactly, while narrative evidence such as run IDs and test totals may remain human-readable.

The dependency-free package audit and `npm run module:runner:check` must prove bidirectional binding: every marker in a new closure document is asserted by a stable contract, every asserted marker exists in that document set, markers are globally unique, and safety-sensitive prose assertions are rejected once the marker schema is adopted. This check runs before dependency bootstrap so document/contract drift cannot consume the full validation window.

## Environment-gated validation commands

Validation profiles must declare safety-critical environment requirements on the exact step that needs them. Database integration steps that invoke `npm run test:integration:db` must set `NODE_ENV=test` in the step `env` object. The Module Execution Kit rejects profiles that omit this declaration before dependency bootstrap, preventing a long validation run from reaching a command that is guaranteed to stop on environment policy.

Do not rely on an interactive shell, a developer machine, or a previous validation step to leave `NODE_ENV` set. Every environment-gated command must be self-contained and reproducible in a disposable worktree.
## Validation-step contract fixture typing

Contract tests that parse `validation-profiles.json` must keep their local `ValidationStep` type aligned with every field they access. At minimum, a contract that inspects command environments declares `label`, `command`, `args`, and optional `env: Record<string, string>`.

The dependency-free Module Runner source check compares property access against the local type declaration before `npm ci`. This catches TypeScript fixture drift such as reading `step.command` or `profile[index]?.env` while the local type still exposes only `label` and `args`. Exact focused Jest remains mandatory after dependency installation, but predictable local type-shape failures no longer consume the full validation window.

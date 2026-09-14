# Repository Historical Contract Architecture Remediation

## Status

**R3 REMEDIATION DEFINED — COMPLETION REVIEW REMAINS BLOCKED**

## Exact Base

This bounded remediation is based on exact remote-green commit
`850c3de5171dea4cd07a135de46078ff521d3ef9`, confirmed by GitHub Actions run
`30560593208`.

The failed Module 10 Completion Review closure artifacts `v1.0.0` and `v1.0.1`
remain invalid and must not be reused. Repository Historical Contract Architecture
Remediation artifacts `v1.0.0` and `v1.0.1` are also invalid and must not be
reused.

## Purpose

Historical contracts must survive later lifecycle transitions because they read
immutable evidence owned by their completed slice or module. Mutable current
state must be validated separately and may advance without forcing old contract
files to retain copied commits, CI runs, artifacts, checksums, test totals,
historical sentences, milestones, or links.

This stage repairs the repository contract architecture rather than patching the
two last failing assertions individually.

## Repository-wide Audit

The repository contains 46 `*.contract.spec.ts` files across `src` and `test`.
Every one is classified in `test/contract-surface-policy.json` as one of:

- `historical-evidence`;
- `stable-contract`;
- `current-state`;
- `policy-enforcement`.

The audit found two systemic dependency classes:

1. historical or shared contracts reading mutable current-state documents;
2. historical module contracts fanning out assertions into the shared
   transition-safety evidence document instead of keeping evidence ownership in
   the contract's own immutable record.

The two failures exposed by Completion Review closure were examples of the first
class:

- `test/mqtt-production-transport-proposal.contract.spec.ts` required a
  historical sentence in `docs/project-state.md`;
- `test/module-09-telemetry-storage-strategy.contract.spec.ts` required a
  historical link in `docs/roadmap.md`.

## Document Classification

### Immutable evidence owned by a slice or module

Examples include:

- `docs/module-09-completion-review.md`;
- `docs/telemetry-storage-strategy.md`;
- `docs/mqtt-production-transport.md`;
- `docs/module-10-*.md` slice records;
- committed runtime, schema, migration, and contract sources that implement the
  completed boundary.

Historical evidence assertions belong here.

### Mutable current-state summaries

The repository policy treats these documents as mutable:

- `project-config.json`;
- `docs/module-lifecycle.md`;
- `docs/project-state.md`;
- `docs/roadmap.md`;
- `AI-Development-Kit/bootstrap/PROJECT-BOOTSTRAP-v1.0.md`;
- `AI-Development-Kit/architecture/SYSTEM.md`;
- `AI-Development-Kit/agent/REPOSITORY-MEMORY.md`;
- `AI-Development-Kit/prompts/MODULE-10.md`.

Only `test/module-lifecycle.contract.spec.ts` may read these surfaces. It checks
the current lifecycle state, generic managed-block synchronization, and the
still-binding production deployment boundary without pinning an old checkpoint.

After remediation, the executable reader map is:

| Current-state surface | Permitted executable contract reader |
| --- | --- |
| `project-config.json` | `test/module-lifecycle.contract.spec.ts` |
| `docs/project-state.md` | `test/module-lifecycle.contract.spec.ts` |
| `docs/roadmap.md` | `test/module-lifecycle.contract.spec.ts` |
| `AI-Development-Kit/bootstrap/PROJECT-BOOTSTRAP-v1.0.md` | `test/module-lifecycle.contract.spec.ts` |
| `AI-Development-Kit/architecture/SYSTEM.md` | `test/module-lifecycle.contract.spec.ts` |
| `AI-Development-Kit/agent/REPOSITORY-MEMORY.md` | `test/module-lifecycle.contract.spec.ts` |
| `docs/module-lifecycle.md` | none; lifecycle behavior is validated through `project-config.json` and managed blocks |
| `AI-Development-Kit/prompts/MODULE-10.md` | none after historical contract remediation |

The enforcement contract contains these path names as policy data, but it does
not read their current content.

### Stable architecture and policy contracts

These documents may be checked by stable/current-state contracts for stable
architecture boundaries but must not be used to fan out old checkpoint
identifiers or totals:

- `docs/architecture.md`;
- `docs/module-10-multiplatform-architecture.md`.

A historical contract may read one of these shared surfaces only when the policy
explicitly records that document as its own binding architecture evidence. The
Module 10 activation contract owns the original multiplatform architecture
record; later slice contracts must use their own immutable decision records.

Repository enforcement policy evidence is owned only by
`test/historical-contract-transition-safety.contract.spec.ts`.

## Reusable AST Enforcement

`test/support/historical-contract-policy.ts` implements one repository-wide
TypeScript AST and data-flow policy. It discovers every contract recursively,
requires every contract to be classified, and resolves current-state content
through:

- direct file reads;
- variable aliases;
- arrays;
- `map` and `flatMap` reads;
- `join` and string transformations;
- `for...of` loop aliases;
- local helper wrappers;
- imported read utilities and namespace imports;
- template strings and string concatenation;
- JSON parsing and indirect property assertions;
- regex and string matcher assertions;
- aliased and namespace `node:fs` read imports.

A new contract file cannot silently escape enforcement because the discovered
contract set must exactly match `test/contract-surface-policy.json`.

## Negative Fixtures

The policy contract proves rejection of:

- a historical SHA asserted against `docs/project-state.md`;
- a historical run ID asserted against `docs/roadmap.md`;
- a historical sentence asserted against a current summary;
- historical link fan-out through an array, `map`, and `join`;
- alias, helper, and `for...of` based assertions;
- an imported repository read utility;
- namespace-import and template-string indirection;
- historical fan-out into a stable shared architecture document not owned by the contract;
- format-sensitive exact-prose assertions against repository policy documents.

The fixtures are under `test/fixtures/historical-contract-policy/` and are not
Jest test files themselves.

## Contract Remediation

Historical and shared contracts no longer read mutable current-state summaries.
The last two failing contracts now verify their immutable MQTT and telemetry
strategy records directly.

Repeated module-level assertions against
`docs/historical-contract-transition-safety.md` are removed. The repository
policy contract alone owns and verifies that systemic evidence.

Current lifecycle synchronization remains centralized in
`test/module-lifecycle.contract.spec.ts`.

The bounded remediation covers the repository-wide families that previously
read mutable or shared lifecycle evidence: CI bootstrap, production readiness,
production configuration, security, deployment and recovery, MQTT production
transport, Integration/E2E completion, Module 09 historical contracts, Module
10 activation, and Module 10 slice contracts. The exact per-file classification, ownership map, prohibited owner gates,
and transition matrix are machine-readable in `test/contract-surface-policy.json`.
The executable contract validates that structured policy rather than matching
format-sensitive prose in this document.

## Projected Transition Matrix

The transition runner reuses the repository's shell-free
`tools/module-runner/lib/process.mjs` command resolver. On Windows, npm is
executed through `process.execPath` and `npm-cli.js`; the runner must not spawn
`npm.cmd`, enable a shell, or duplicate platform-specific command resolution.
The enforcement contract locks this invocation boundary.

The official script
`npm run test:historical-contract-transitions` creates isolated projections from
the validated worktree, links the already installed dependencies, applies only
official module lifecycle commands, deliberately churns mutable current
summaries, and runs lifecycle validation, the historical/shared contract audit,
and Full Jest for every state.

The required matrix is defined once in `test/contract-surface-policy.json` and
consumed by both the enforcement contract and the transition runner:

1. current exact checkpoint;
2. Module 10 Completion Review closure;
3. module:complete 10;
4. Module 11 activation;
5. Module 11 Slice 11.1.

For projected states after the exact checkpoint, mutable summaries are replaced
with a minimal current-state summary that contains no copied historical commit,
CI run, artifact, checksum, test total, milestone, historical sentence, or link
fan-out. Immutable evidence documents must remain readable.

The authoritative validation profile is
`repository-historical-contract-remediation`. One red gate makes the whole stage
red.

## Change Boundary

This remediation changes contract architecture, repository test policy,
historical/shared tests, transition fixtures, one official transition-matrix
runner, package script registration, validation-profile registration, and this
decision record.

It does not change application runtime architecture, Prisma schema or
migrations, dependencies, lockfile, MQTT runtime, Redis runtime, CI workflow,
deployment configuration, or Module 11 implementation.

This stage does not complete Module 10, activate Module 11, push a commit, or
approve deployment. Those remain separate owner-approved gates.

## Recovery Evidence

Three pre-proof candidates remain invalid and must not be reused:

- remediation `v1.0.0` used `Object.hasOwn`, which is outside the repository's
  ES2021 TypeScript library contract;
- remediation `v1.0.1` retained an exact-prose assertion against this policy
  document;
- remediation `v1.0.2` spawned `npm.cmd` directly from Node and failed with
  `spawnSync npm.cmd EINVAL` on Windows.

The bounded recovery replaces each repeated root cause with an executable
systemic guard: ES2021 compatibility, prohibition of exact policy prose
assertions, and mandatory reuse of the official shell-free process resolver.

## Exit Gate

The remediation is eligible for a local proven commit only after:

1. Module Doctor passes from a clean exact-base worktree;
2. the disposable worktree applies only the manifest allowlist;
3. the repository historical/shared contract audit passes;
4. all five projected states pass lifecycle validation and Full Jest;
5. immutable evidence remains readable while mutable summaries churn;
6. the exact changed paths, hashes, tracked-file count, EOL, and diff checks
   pass.

Module 10 Completion Review must not resume until this remediation is committed,
pushed separately after owner approval, and confirmed remote-green at the exact
pushed SHA.

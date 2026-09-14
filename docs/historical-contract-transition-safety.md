# Historical Contract Transition Safety

## Status

**SYSTEMIC GUARD EXPANDED — NO COMPLETION OR LIFECYCLE TRANSITION PERFORMED**

## Purpose

Historical module and slice contracts must remain green after the repository advances to a later slice or module. They therefore verify immutable evidence owned by the completed boundary rather than the repository's current lifecycle state or current-state summary documents.

The original systemic guard closed repeated failures caused by historical contracts reading `project-config.json` and freezing mutable `development` fields. This expansion closes the second form of the same root cause: historical commit, CI run, release artifact, hash, test-total, or manifest-total assertions fanned out across documents whose current summaries are expected to advance.

## Immutable Base Evidence

The original correction was based on the exact remote-green Module 10 Slice 10.13 closure checkpoint:

- commit: `c775ca01151fbc6811a4994f46e096e004285ce9`;
- GitHub Actions run: `30545421357`;
- Full Jest: `108/108` suites and `762/762` tests;
- production release artifact ID: `8760574266`;
- release artifact SHA-256: `c4a88fc990892a454360402829d72d90ca0a27c3fb47ed575109d8233283f3bb`.

The current-state evidence used to expand the permanent guard is the exact remote-green Slice 10.14 selection checkpoint:

- commit: `efa6cc22a8ed5b125ee34a8098b7dd5d09d9c83c`;
- GitHub Actions run: `30554927639`;
- Full Jest: `109/109` suites and `778/778` tests;
- production release artifact ID: `8764467770`;
- release artifact SHA-256: `c71b6104e9a651845b4658c7428656441bb9a4d85b92e664c0a22624762b8d99`.

These values are immutable evidence owned by this policy record. They do not assert which slice or module is active now.

## Permanent Lifecycle Rule

A historical contract matching `test/module-NN-*.contract.spec.ts` must not execute assertions against `project-config.development.*`, read the mutable `docs/module-lifecycle.md` checkpoint, or positively assert managed lifecycle-block text.

Forbidden mutable dependencies include, but are not limited to:

- `currentModule` and `lastCompletedModule`;
- `nextModule` and `nextModuleStatus`;
- `activeWorkstream`, `activeSlice`, `focus`, and active milestone values;
- `moduleLifecycleState` and `moduleLifecycleEvidence`;
- `productionDeploymentStatus` or another current approval state.

## Permanent Current-State Document Rule

Historical contracts must not require immutable checkpoint evidence to remain copied into mutable current-state documents. The permanent guard treats the following files as current-state sources:

- `project-config.json`;
- `docs/module-lifecycle.md`;
- `docs/project-state.md`;
- `docs/roadmap.md`;
- `docs/architecture.md`;
- `AI-Development-Kit/bootstrap/PROJECT-BOOTSTRAP-v1.0.md`;
- `AI-Development-Kit/architecture/SYSTEM.md`;
- `AI-Development-Kit/agent/REPOSITORY-MEMORY.md`;
- `AI-Development-Kit/prompts/MODULE-10.md`;
- `docs/module-10-multiplatform-architecture.md`.

A positive assertion against one of those sources is forbidden when it pins historical evidence such as:

- a Git commit or revision identifier;
- a GitHub Actions run identifier;
- a release artifact identifier or SHA-256;
- historical suite/test totals;
- historical release-manifest entry totals.

Historical evidence belongs in the completed slice's immutable decision or closure record. Current-state documents may link to that record, summarize the current checkpoint, retain historical narrative, or remove obsolete detail without breaking the historical contract.

Negative assertions that reject stale present-tense phrases remain allowed. Stable architecture and source-boundary assertions that do not pin old checkpoint evidence also remain allowed.

## Enforcement

The contract `test/historical-contract-transition-safety.contract.spec.ts` enforces both rules with TypeScript AST inspection. It:

1. rejects mutable `development` property access;
2. rejects reads of the canonical mutable lifecycle document;
3. rejects positive assertions for managed lifecycle markers;
4. resolves direct reads, arrays, joined reads, and `for...of` aliases of current-state documents;
5. rejects positive historical-evidence assertions against those resolved current-state sources.

The scan is repository-wide across historical Module 09 and Module 10 contracts and is not tied to one named failing assertion.

## Audited Historical Contracts

The following historical contracts are covered by the permanent guard:

- `test/module-09-completion-review.contract.spec.ts`
- `test/module-09-latest-telemetry-query.contract.spec.ts`
- `test/module-09-source-of-truth-reconciliation.contract.spec.ts`
- `test/module-09-telemetry-aggregation-query.contract.spec.ts`
- `test/module-09-telemetry-history-query.contract.spec.ts`
- `test/module-09-telemetry-storage-strategy.contract.spec.ts`
- `test/module-10-activation.contract.spec.ts`
- `test/module-10-admin-web-operational-dashboard-ui-foundation.contract.spec.ts`
- `test/module-10-admin-web-operational-dashboard-ui-proposal.contract.spec.ts`
- `test/module-10-admin-web-operational-dashboard.contract.spec.ts`
- `test/module-10-android-native-proof-preparation.contract.spec.ts`
- `test/module-10-barcode-cctv-ui-compatibility.contract.spec.ts`
- `test/module-10-dashboard-api.contract.spec.ts`
- `test/module-10-dashboard-domain-schema-proposal.contract.spec.ts`
- `test/module-10-dashboard-persistence-foundation.contract.spec.ts`
- `test/module-10-mobile-foundation-dynamic-dashboard.contract.spec.ts`
- `test/module-10-mobile-login-ui-foundation.contract.spec.ts`
- `test/module-10-mobile-read-only-dashboard-integration.contract.spec.ts`
- `test/module-10-mobile-secure-session-foundation.contract.spec.ts`
- `test/module-10-mobile-workspace-foundation.contract.spec.ts`
- `test/module-10-security-observability-accessibility-e2e-review.contract.spec.ts`
- `test/module-10-telemetry-widget-query-integration.contract.spec.ts`
- `test/module-10-user-web-dynamic-dashboard.contract.spec.ts`
- `test/module-10-web-workspace-design-system-foundation.contract.spec.ts`
- `test/module-10-widget-resolution.contract.spec.ts`

The expanded AST scan found two existing historical contracts with forbidden current-state evidence assertions. `test/module-09-completion-review.contract.spec.ts` now verifies its immutable completion record directly. `test/module-10-admin-web-operational-dashboard.contract.spec.ts` now keeps historical checkpoint evidence in its immutable decision record and uses mutable current-state documents only for negative stale-status checks.

## Transition Proof Boundary

The guard is transition-independent by construction. Updating current summaries for a completion review or later lifecycle transition cannot invalidate a historical contract merely because an old commit, run, artifact, hash, or test total is no longer copied into every current-state source.

The next Completion Review closure and the lifecycle completion transition remain separate repository stages after this correction is committed, pushed, and confirmed remote-green. This document does not record the Module 10 Completion Review closure, complete Module 10, activate Module 11, or approve deployment.

## Change Boundary

This correction changes one policy document and three contract tests only. It does not modify runtime code, `project-config.json`, managed lifecycle documents, current-state documents, dependencies, lockfiles, Prisma schema or migrations, CI workflows, validation profiles, security or tenant boundaries, protocols, or deployment configuration.

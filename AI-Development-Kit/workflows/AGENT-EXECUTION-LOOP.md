# Agent Execution Loop

`RESUME CHECKPOINT → FIRST FAILING GATE → ROOT-CAUSE CLASS → COMPLETE BATCH → CHEAP/TARGETED CHECKS → FULL LOCAL PRE-PUSH → REVIEW DIFF → ONE COMMIT/PUSH → GITHUB HEAVY UAT → HANDOFF`

## Resume Checkpoint

Read `docs/SESSION-HANDOFF-PROTOCOL.md` and the current blocks of the handoff/state files. Verify real `HEAD`, branch/upstream, `git status --short`, and the newest CI evidence. A dirty tree may be an intentional candidate; preserve it when the handoff says so. Do not restart a repository-wide audit on identical input.

## First Failing Gate

Use the newest local/CI evidence to identify the first real failure. Later failures that are only cascades are not separate bugs. If the first failure moves after a fix, continue to the next gate within the same coherent batch.

## Root-Cause Class

Investigate the complete source/script/config/document contract responsible for the failure. Fix the class permanently. Do not suppress scanners, weaken assertions, invent PASS evidence, or patch only the last error line.

## Complete Batch

Synchronize implementation, tests, CI, contracts, PRD/Development Kit and handoff documentation that belong to the same root-cause class. Missing physical ESP32/camera hardware is non-blocking: use source-bound `SIMULATED_HARDWARE_LIVE_SERVICE` for software UAT and keep physical/site/HIL separately labelled field evidence.

## Validation

Run cheap/targeted checks first, then the official local pre-push gate. GitHub remains authoritative for heavy Docker/PostgreSQL/API/EMQX, ESP-IDF/QEMU, live UAT, load/security and release gates.

## Review, Commit and Push

After the complete local gate is green, review the complete diff once. Make one commit and one push for the coherent batch. Do not create micro-push loops merely to discover the next assertion that could have been caught locally.

## GitHub Heavy UAT

Read the first failing GitHub step. If red, stay on the same batch/root-cause class and repair it. If green, advance to the next current Wave 13 certification objective.

## Handoff

Before a session ends or moves to a new chat, prepend `chat-session.md` and update the current continuation blocks required by `docs/SESSION-HANDOFF-PROTOCOL.md`. Record QA, first remaining blocker, latest known baseline/evidence, and exact next action. Reseal `repository-tree.txt` and `BASELINE-MANIFEST.sha256`.

## Terminal all-green state

When `docs/ENTERPRISE-WAVE-ROADMAP.md` records Waves 1–13 software scope CLOSED/GREEN with `active=none`, do not invent Wave 14 or reopen a closed wave. Resume from the named post-green audit/hardening objective. Any source mutation must still run targeted checks, full local pre-push, one commit/push, and GitHub heavy acceptance before the new candidate becomes authoritative. External/provider and PHYSICAL/HIL evidence remain separate.

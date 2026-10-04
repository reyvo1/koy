# Session Handoff Protocol — IoT Platform

Status: mandatory workflow contract for every coding / CI-repair batch.

## Purpose

A chat/session change must never reset project direction, reopen already closed root causes, or discard a known candidate. The repository itself carries the current working context.

This project-level protocol is the current Wave 13 continuation authority. Historical/module-runner portable handoff packages may still carry an `audit-only` first-response rule for their own immutable protocol version; that package-specific rule must not overwrite the current project checkpoint when `docs/SESSION-HANDOFF-PROTOCOL.md` and the current blocks are present.

## Resume order for a new session

1. Read the **current block at the top** of `PASTE-KE-CHAT-BERIKUTNYA.txt`.
2. Read the current blocks at the top of `PROJECT-HANDOFF.md`, `CURRENT-STATE.md`, `docs/SESSION-CHECKPOINT.md`, and `chat-session.md`.
3. Read `docs/ENTERPRISE-WAVE-ROADMAP.md` and `docs/ENTERPRISE-ACCEPTANCE-EVIDENCE.md` for the authoritative wave/evidence boundary.
4. In the real operator checkout, verify `git rev-parse HEAD`, `git status --short`, branch/upstream and the latest GitHub run/evidence. A dirty tree is **not** automatically an error: if the handoff says a known candidate is mid-validation, preserve it and continue from that candidate.
5. Continue from the **first failing gate recorded by the handoff or newest CI log**. Do not audit the whole repository from zero unless the handoff/current marker is missing, contradictory, or the checkout no longer matches the recorded candidate.

## Root-cause workflow

`RESUME CHECKPOINT → FIRST FAILING GATE → ROOT-CAUSE CLASS → COMPLETE BATCH → TARGETED/CHEAP QA → FULL LOCAL PRE-PUSH → REVIEW DIFF → ONE COMMIT/PUSH → GITHUB HEAVY UAT → HANDOFF`

Rules:

- Fix the root-cause class, not the assertion symptom. Never weaken a test just to make it green.
- One complete coherent batch precedes one commit/push. Avoid micro-push repair loops.
- Local checks prove cheap/static/targeted contracts; GitHub is authoritative for heavy Docker/PostgreSQL/API/EMQX/ESP-IDF/QEMU/live UAT.
- Missing physical ESP32/camera hardware does **not** block software progress. The mandatory automated evidence is source-bound `SIMULATED_HARDWARE_LIVE_SERVICE`; physical/site/HIL remains separately labelled field validation and simulation must never be renamed PHYSICAL.
- Provider-owned behavior that cannot be truthfully simulated remains explicit external evidence; do not fabricate PASS.
- Live probes must consume credentials from the source-controlled seed/credential contract for that run. Do not rely on ambient shell variables crossing GitHub steps; fresh-step isolation is part of the CI contract.

## Mandatory handoff update before ending a batch/session

Update these repository files before the final reseal/handoff:

- `chat-session.md`: prepend the latest objective, root cause, files/behavior changed, QA results, first remaining blocker, and exact next action.
- `PASTE-KE-CHAT-BERIKUTNYA.txt`: keep a compact current continuation block that a new chat can paste/read first.
- `PROJECT-HANDOFF.md`: keep current engineering priority and evidence boundary at the top.
- `docs/SESSION-CHECKPOINT.md`: keep the current wave, current candidate/gate state and next action at the top.
- `CURRENT-STATE.md`: update only when product/wave state or evidence policy changes.
- `repository-tree.txt` and `BASELINE-MANIFEST.sha256`: regenerate/reseal after all source/document changes.

The handoff must name the latest known committed baseline if known, but a new session must still verify real `HEAD` instead of trusting a historical SHA.

## Current invariant

Wave 13 is the active enterprise wave. Waves 1–12 are software-scope closed/green. Automated software completion must continue through GitHub simulation/live-service gates without waiting for physical lab equipment.

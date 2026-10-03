# RESCUE-02B Runtime Acceptance Evidence

Before a full runtime run, dependency bootstrap can be diagnosed without loading project dependencies:

```bash
npm run rescue:bootstrap:doctor -- --json=reports/rescue-bootstrap-diagnostic.json
```

`READY` means the installed dependency boundary is present. If dependencies are absent, the doctor classifies toolchain/lock failures, partial installs, or npm-registry DNS/HTTPS blocking. Registry reachability is intentionally skipped once dependencies are installed, so internet access is not turned into a runtime acceptance requirement. This diagnostic is not a RESCUE-02B PASS artifact by itself.

Acceptance reports also embed the runtime prerequisite probe as structured `runtimePreflight` JSON (`blockerCount`, `blockers`, and all rows). The standalone runtime checker keeps its human table by default and supports `--json` for machine consumption.

The runtime preflight is topology-neutral. Docker/Podman is informational unless the operator explicitly requests `--require-container-runtime` for the local-compose path. With `--probe`, acceptance requires protocol/readiness evidence rather than open ports: PostgreSQL negotiation, Redis `PING/PONG`, authenticated MQTT CONNECT, authenticated EMQX Dashboard login, and API `/health/ready` reporting `status=ready`.

The source-controlled `npm run rescue:runtime:self-test` command can regression-test those probe semantics with temporary local fixtures; its PASS is not live service evidence and must never be attached as a RESCUE-02B runtime artifact.

For the local compose topology, `npm run rescue:local:up` is an operator convenience that enforces the documented infra/build/migration/API/EMQX-auth/webhook ordering and rolls back failed bring-up by default. Its terminal state is `CORE_RUNTIME_READY_LIVE_BROKER_EVIDENCE_PENDING`; neither `rescue:local:up`, `rescue:local:self-test`, nor `rescue:emqx:webhooks:self-test` is acceptance evidence. The source-controlled webhook helper only proves that configuration was accepted by the live broker contract; telemetry delivery, ACK correlation, idempotency, wrong-secret rejection, ACL isolation, and the remaining live negative checks below are still mandatory.

RR28 additionally isolates the rescue broker from unrelated host brokers: Compose exposes EMQX container port `1883` through dedicated host `RESCUE_MQTT_HOST_PORT` (default `18884`), persists the exact host URL in source-bound local runtime state, and local Gate 1/acceptance re-probe that endpoint. A foreign Mosquitto on host port `1883` is therefore neither stopped nor accepted as rescue evidence.

This directory defines the **source-controlled evidence contract** for closing
RESCUE-02B. Actual operator evidence is generated under `reports/` and is
ignored by Git/source packaging by default because it can contain environment
metadata. Never place passwords, tokens, webhook secrets, private keys, or
credential values in an evidence file.


Release artifact integrity is separate from production approval: `release:verify` only proves the package/manifest, while `release:approve` requires the live RESCUE evidence plus either the source-bound simulated-hardware UAT summary or genuine legacy physical OTA evidence.

## Gate order

1. Run the normal preflight and full automated suite:

   ```bash
   npm run rescue:acceptance -- --env=.env --full
   ```

   A usable automated report must have `mode=full` and
   `status=AUTOMATED_TEST_SUITE_PASS`, including the canonical Baseline manifest verifier step. The report is bound to the current
   baseline through SHA-256 fingerprints of `package-lock.json`,
   `BASELINE-MANIFEST.sha256`, and `repository-tree.txt`.

2. Initialize the manual/live evidence record from that exact report:

   ```bash
   npm run rescue:evidence:init -- \
     --automated-report=reports/rescue-runtime-acceptance-....json
   ```

3. Execute the runtime checklist and EMQX negative/ACL/webhook checks. GitHub also
   runs the combined `SIMULATED_HARDWARE_UAT` path. The `physicalEsp32` rows may remain
   unfilled when validation is invoked with the source-bound simulated-hardware summary;
   fill them only for an optional real field/HIL run. Every asserted `PASS` row must reference a real evidence
   artifact with its SHA-256; free-text evidence is rejected. The recommended
   way to attach a log/transcript/screenshot/serial capture is:

   ```bash
   npm run rescue:evidence:attach -- \
     --file=reports/rescue-02b-evidence-....json \
     --section=runtimeFlow \
     --check=login \
     --artifact=reports/evidence/login-http.txt \
     --note="Authenticated login request/response transcript with secrets redacted"
   ```

   The helper marks only that row PASS, records the artifact path/hash, and
   timestamps the section. Keep secrets redacted from the artifact itself.

4. Validate the completed evidence file:

   ```bash
   npm run rescue:evidence:validate -- --file=reports/rescue-02b-evidence-....json
   ```

The validator fails closed if the automated report belongs to another source
fingerprint, any required automated step is absent/not green, a required live
check is missing/not PASS, an evidence artifact is absent or its SHA-256 does
not match, timestamps are invalid/out of gate order, the selected hardware evidence path is incomplete/source-mismatched, or secret-bearing keys appear in the evidence object.

## RESCUE-02B vs simulated-hardware / physical field evidence

The normal software-certification path uses the exact ESP-IDF artifact in QEMU/live-service
simulation and seals `reports/simulated-hardware-uat/summary.json` only after device
reconnect/cold boot/QoS-1 dedupe/command ACK/OTA rollback, real EMQX negative flows,
synthetic camera onboarding and RTSP-to-WebRTC all pass. Validate RESCUE-02B with:

```bash
npm run rescue:evidence:validate -- \
  --file=reports/rescue-02b-evidence-....json \
  --simulated-hardware=reports/simulated-hardware-uat/summary.json
```

That receipt is explicitly `SIMULATED_HARDWARE_LIVE_SERVICE`, source-fingerprinted and
firmware-SHA-bound. It can close automated software/UAT without physical lab equipment.
It is not a PHYSICAL/HIL claim.

The legacy physical path remains optional field validation. If used, omit
`--simulated-hardware`, complete the `physicalEsp32` checklist and set OTA to `PASS` only
with a real device identity, exact artifact bytes, matching artifact/device-observed
SHA-256 values, timestamp and concrete evidence. Bare text or `DEFERRED` can never be
misrepresented as physical PASS.
## Gate 1 PASS receipt before Gate 2

Before starting the live protocol/service acceptance work referred to as **Gate 2**, produce a source-bound Gate 1 PASS receipt:

```bash
npm run rescue:gate1 -- --env=.env --topology=local --attempt-install
```

If `rescue:local:up` was run immediately beforehand, Gate 1 may reuse that live local runtime only when its tracked state is source-bound to the exact current sealed baseline and the same environment file; it still reruns the full protocol preflight. A pre-RR16/unbound state or source/env mismatch is deliberately rejected rather than silently adopted.

Then revalidate it against the still-running environment:

```bash
npm run rescue:gate1:validate -- --file=reports/gate1/gate1-....json
```

**Gate 2 entry is forbidden unless this validation passes.** A blocked dependency, blocked environment, or blocked runtime Gate 1 report is diagnostic evidence only and is not a Gate 1 PASS receipt. The receipt is source-bound and the validator reruns dependency/runtime checks, so copying or editing a stale report cannot legitimately open Gate 2.

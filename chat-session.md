# Chat Session — RR30 GitHub CI Restoration

## Progress
- Restored the project’s original GitHub-hosted heavy-test strategy instead of repeating Docker/Podman builds on the Windows/WSL host.
- Preserved the existing `.github/workflows/ci.yml` core job.
- Added `rescue-live-emqx` GitHub job using Ubuntu + Docker Compose.
- Added source-controlled `scripts/run-rescue-live-broker-smoke.mjs`, derived from the previously proven Phase-A live runner, with CI mode that does not mutate evidence files.
- Real broker smoke covers valid/wrong device auth, publisher ACL, device telemetry/ACK/command subscription, cross-device denial, telemetry idempotency, ACK binding/replay, wrong webhook secret, and revoked-device denial.
- Added `rescue:github-ci:self-test` and CI guardrails.

## Test status
- Node syntax check for new broker smoke: PASS.
- GitHub CI static self-test: pending final seal run.
- Rescue validator / manifest: pending final seal run.
- Real GitHub-hosted Docker execution cannot be performed inside this artifact workspace; authoritative live proof is the first GitHub Actions run after pushing RR30.

## Ready state
- Source changes are CI/tooling/docs only; no application business logic, Prisma schema, MQTT auth backend, Web/Mobile code, or physical-device contract is intentionally changed.

## Next steps
1. Push/overlay RR30 into the GitHub repository.
2. Run CI manually with `workflow_dispatch` or by push/PR.
3. Inspect the existing core `test` job first; this reproduces DB integration on fresh GitHub PostgreSQL.
4. If core CI passes, `rescue-live-emqx` runs automatically with real EMQX.
5. Do not run local full acceptance unless GitHub-specific failure requires local reproduction.
6. After GitHub full acceptance passes, initialize a new source-bound evidence file; physical ESP32 remains separate.

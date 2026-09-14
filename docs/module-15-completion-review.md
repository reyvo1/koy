# Module 15 — OTA Firmware Completion Review

## Status

Module 15 foundation-complete and locally green at commit `980fb19`.
Firmware artifact metadata, checksum/compatibility contracts, and a guarded
forward-only rollout engine delivered. Device delivery rides the existing
capability-driven CommandService path; no binary storage in the database.

## Slice inventory

- 15.1 Persistence & domain: `FirmwareArtifact` (version unique per tenant,
  https URL, lowercase sha256 digest, size, compatible-models) +
  `OtaRollout` with forward-only states
  DRAFT → PUBLISHED → IN_PROGRESS → COMPLETED | ROLLED_BACK; validator bounds
  versions/urls/digests/sizes and caps targets at 500.
- 15.2 Rollout repository: optimistic status-guarded transitions (concurrent
  transitions fail loudly), progress ledger merging succeeded/failed device
  sets, COMPLETED only when every target reported.

## Validation evidence

- Full Jest: 140 suites / 986 tests green.
- DB integration: 11 suites / 45 tests green on real PostgreSQL 16.
- Lint clean; build green.

## Deferred

Device-targeted firmware command emission wiring (rides CommandService in a
follow-up slice), rollout REST API, progress ingestion endpoint, production
deployment approval.

# ADR-007 — Device Technical Evidence + End-User Analytics Alert Read Models

Status: **ACCEPTED**  
Date: 2026-09-13

## Context

The frozen Enterprise UI Blueprint requires Device Detail to expose firmware,
protocol, update history, command history, and alert history, while Mobile keeps
an Alerts tab. FOUNDATION-ALIGNMENT-02 already restored owner/share-safe User
Web Device Detail but deliberately left firmware/protocol/update/alerts bounded
until a real source contract was proven.

The current schema proves these facts:

- Device has type/status/heartbeat/capabilities, but **no current firmware
  version/assignment** and **no protocol/adapter identity** field.
- Module 15 stores FirmwareArtifact metadata and OtaRollout target/completed/
  failed device-id sets. These records are rollout bookkeeping, not physical
  installation proof.
- Module 16 stores tenant/device-scoped analytics findings with severity.
- Module 14 notification rows are transport/delivery bookkeeping and are not an
  end-user alert inbox contract.
- Owner/share VIEW/CONTROL remains the authorization source of truth.

## Decision

Add two backward-compatible, read-only contracts:

1. `GET /devices/:deviceId/technical-history`
   - requires canonical device `VIEW` authorization;
   - exposes bounded Module 15 rollout evidence targeting that device;
   - exposes bounded Module 16 findings for that device;
   - reports current firmware and protocol as `UNAVAILABLE_BY_CONTRACT` rather
     than inferring them;
   - reports SHA-256 as stored metadata and marks artifact-byte verification and
     physical installation proof as false.

2. `GET /analytics/alerts/accessible`
   - resolves accessible devices using the existing owner/share policy first;
   - returns only bounded Module 16 `WARNING`/`CRITICAL` findings for those
     devices;
   - explicitly declares that the surface is analytics findings, **not
     notification-delivery history**.

No Prisma migration is introduced. No vendor/protocol assumption is added. No
new write/update path is added. These contracts are additive and preserve the
Architecture Freeze.

## Consequences

- Device Detail can show real update evidence without inventing current
  firmware/protocol values or claiming hardware OTA success.
- Mobile Alerts can become backend-backed using Module 16 while remaining
  truthful about its source.
- Device settings that lack an existing backend mutation contract remain
  fail-closed/read-only.
- Future current-firmware/protocol fields or notification-delivery inboxes need
  their own additive contract/schema decision before UI promotion.

# ADR-008 — Platform Observability Read Models

Status: **ACCEPTED**  
Date: 2026-09-13

## Context

The Enterprise UI Blueprint requires deeper Super Admin visibility for Device Groups, Credentials, Capability Registry/versioning, Telemetry Explorer/Export, Command Queue/ACK/History, and Reports. The existing data model already persists tenant-scoped `DeviceGroup`, non-reversible `DeviceCredential` hashes, per-device `Capability.schemaVersion`, `Telemetry`, `DeviceCommand`, and platform/tenant operational evidence.

The platform must not invent a global capability-template lifecycle, expose credential secret material, or enable cross-tenant command dispatch merely to make the UI look complete.

## Decision

Add platform-admin-only, bounded, read-oriented observability contracts under `/admin` guarded by `JwtAuthGuard + TenantContextGuard + AdminRoleGuard + PlatformRoleGuard`:

- `GET /admin/platform-device-groups` — cross-tenant device-group directory. Groups remain tenant-owned; this contract does not add platform mutation semantics.
- `GET /admin/platform-device-credentials` — credential presence/lifecycle metadata only. `passwordHash`, pairing tokens, and secrets are never selected or returned.
- `GET /admin/platform-commands` — queue/ACK/terminal command history only. It explicitly reports `sendCommandEnabled=false`; no cross-tenant dispatch endpoint is added.
- `GET /admin/platform-telemetry/explorer` — bounded raw telemetry evidence for one real device, with optional capability validated against that device's registry.
- `GET /admin/platform-reports/tenant-summary` — bounded server-generated tenant operational rows for current inventory plus activity in a bounded lookback window.

The existing platform capability endpoint is enriched with `schemaVersion`, `unit`, `constraints`, and timestamps. This remains an observed per-device capability registry. It is not renamed or promoted into a global template/version registry because no such authoritative entity exists in the current schema.

The Super Admin web UI may export CSV only from rows returned by these real read contracts. Client-side CSV generation does not change the source of truth.

## Safety Boundaries

- No credential hash or secret material may cross the API boundary.
- Device Groups remain tenant-scoped; platform view is read-only.
- Platform Command Monitor cannot publish or mutate command records.
- Telemetry explorer requires a selected real device and rejects unknown capability keys.
- Reports are bounded and must not be represented as billing/audit compliance reports.
- MQTT broker sessions/connections/topic runtime state remain unavailable until a verified broker management read contract exists. Backend readiness and static MQTT topic/ACL contracts are not equivalent to live broker session evidence.
- No Prisma migration is introduced by this ADR.

## Consequences

`/super/commands` and `/super/reports` can leave quarantine as read-only evidence surfaces. `/super/device-groups` and `/super/credentials` become truthful Device Management views. Telemetry gains an explorer/export surface. Remaining broker-operations depth and a true global capability-template/version lifecycle stay fail-closed pending authoritative contracts.

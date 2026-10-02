# ADR-011 — The Device Twin as Reconciliation

Status: **ACCEPTED**
Date: 2026-10-02

## Context

Wave 12 asks for a digital-twin foundation. Before writing anything, a census of `Device` showed what this
platform already caches:

    status             DeviceStatus  @default(PROVISIONING)
    lastHeartbeatAt    DateTime?
    healthScore        Int?  healthStatus DeviceHealth?  healthEvaluatedAt DateTime?
    riskBand           DeviceRisk?  riskEvaluatedAt DateTime?
    lastHeartbeatAt / regionId (ADR-009)

Every one of those is a **belief about the device**, cached on the device row, and every one of them goes
stale silently. A page that reads a cached `ACTIVE` from four days ago renders a confident falsehood with
no indication that the evidence expired. Nothing in the platform compares what it believes against what the
device last actually reported, and nothing anywhere admits when the belief is older than its evidence.

The tempting implementation is a twin table that stores the device's state and updates it on a schedule.
That would look like a twin on a dashboard and would be the same cached belief one layer down, now harder to
audit because it has its own name.

## Decision

The twin is a **dated reconciliation**, not a replica and not a simulation. It records what the platform
believes, what the device last reported, and a verdict — and it is allowed to say it does not know.

- `DeviceTwinSnapshot` stores `desiredStatus`, `observedStatus`, `observedPayload`, `observedAt`, `verdict`
  and `divergenceReason`, per tenant, per device.
- `observedAt` is when the **device reported**, read from the telemetry row's own timestamp, not from the
  clock at reconciliation time. This is the load-bearing column. Without it a fresh reading and a week-old
  one are indistinguishable, which is exactly the confusion this table exists to remove.
- `observedStatus` is read from the payload's `status` field. It is **never** copied from `desiredStatus`.
  A first implementation did copy it, which made every device ALIGNED by construction and made divergence
  unreachable — the single thing a twin exists to detect.
- The verdict is one of four, and two of them exist specifically to refuse reassurance:
  - `UNKNOWN` — the device never reported, or reported data with no status field. There is no default
    reading to fall back on, because a fallback is a fabricated observation.
  - `STALE` — the observation is older than the horizon (default 15 minutes, caller-supplied). Checked
    **before** agreement, so a matching-but-expired reading reports STALE. "It agrees, as of eight days ago"
    is a different claim from "it agrees", and only the second one is useful.
  - `DIVERGENT` — the device reported something other than what is expected, and the reason says both values.
  - `ALIGNED` — a fresh observation that matches.
- `observedPayload` is returned on every snapshot, not just stored, so an operator can check the judgement
  against the raw evidence rather than trust it.
- `twinVersion` is monotonic per device and unique on `(deviceId, twinVersion)`, so a retried write updates
  rather than forking history into two rows claiming the same version.
- `ON DELETE CASCADE` from device, unlike telemetry. A snapshot is a derived reconciliation record: keeping
  it after the device is gone would leave an orphan asserting a verdict about a device that no longer exists.
  Telemetry's `SET NULL` behaviour from ADR-010 is the opposite choice, and for a good reason — the reading
  outlives the relay that carried it.

## Safety Boundaries

- **No simulation.** Nothing here predicts, forecasts or extrapolates the asset. There is no physics model,
  no future behaviour, no synthetic reading. A twin that invents what a device will do is the same fabricated
  evidence ADR-010 refused for the bridge, and it is more dangerous because it looks like insight.
- **No default observation.** `observedStatus` and `observedPayload` stay null when the device did not
  report them. There is no fallback reading, ever.
- **No stale-as-current.** A snapshot past the horizon reports STALE, never ALIGNED, even when the values
  match.
- **No cross-tenant twin.** Device lookups and history reads are tenant-scoped, so a twin cannot be built
  or read for a device the caller does not own.
- **Not in this slice.** No twin for spaces, floors or gateways as composite entities, and no cross-region
  twin graph. Those each need their own decision about what "current" means at that level of abstraction.
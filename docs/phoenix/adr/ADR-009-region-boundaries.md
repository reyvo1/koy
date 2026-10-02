# ADR-009 — Region Boundaries

Status: **ACCEPTED**
Date: 2026-10-02

## Context

Wave 12 requires multi-region boundaries, an edge gateway, and a digital-twin foundation under explicit ADRs. This platform currently has none of them: there is no `Region`, no gateway entity and no twin anywhere in `prisma/schema.prisma` or `src/`.

The obvious move is a `regionId` string column on `Device`. That would make the Wave 12 exit criteria look satisfied on a dashboard while every downstream feature is built on a value with no owner, no referential integrity, and no answer to the question "which region is this, and is it real?"

Two failure modes follow from that, and both are worse than having no region support at all:

- A single-region platform reporting per-region breakdowns across several regions it does not operate. The numbers are produced from a picker, not from deployments.
- A device's region changing with no record of why, so a historical reading cannot be attributed to the region it was actually taken in.

The second is not hypothetical for this platform. Wave 11 added anomaly findings, health scores, maintenance risk and energy intelligence, all of which are computed over time. A region that can change silently would make every one of those time series unattributable.

## Decision

Add `Region` as a real, seeded, addressable entity, and make assignment a scoped, reasoned operation.

- `Region` carries `regionCode` (unique, the platform's stable handle), `displayName`, `timezone`, and
  `isActive`. `isActive` is what makes the list authoritative: a decommissioned region stops being
  assignable rather than lingering as an option.
- The migration seeds exactly one region, `ap-southeast-1`, which is the region this platform is actually
  deployed in. A platform with one region that seeds several would be reporting geography it does not have.
- `devices.regionId` is nullable with **no default**, behind a real foreign key. A device that has never been
  placed in a region reports that. Defaulting every existing device to the seeded region would be a claim
  about the entire installed base, made by a migration, and never reviewed.
- Assignment requires a tenant, a device, an active region, and a stated reason. It refuses rather than
  defaulting: assigning to an inactive or unknown region throws instead of silently succeeding.
- `ON DELETE SET NULL`, so removing a region leaves the device unplaced and visible as such, rather than
  deleting the device or leaving a dangling pointer.

The assignment clock is a caller-supplied parameter, not a reading of the system clock, so a reassignment can
be reproduced and so a test can actually state "moved at midnight" rather than "moved at some point".

## Safety Boundaries

- **No invented geography.** Regions are seeded from real deployments only. There is no code path that
  creates a region on demand because a caller asked for one.
- **No default placement.** No migration and no code path places a device in a region without an explicit,
  reasoned assignment.
- **No silent reassignment.** Assignment requires a reason. A region change that cannot be explained is
  refused.
- **No cross-tenant region operations.** Regions are platform-scoped, but every device lookup inside the
  assignment path is tenant-scoped, so a tenant cannot place or move a device it does not own.
- **Not in this slice.** The edge gateway entity, the digital-twin foundation, and AI-assisted operations
  across regions are each a separate decision. This ADR does not pre-authorise them, and the Wave 12 exit
  criteria are not met by this slice alone.
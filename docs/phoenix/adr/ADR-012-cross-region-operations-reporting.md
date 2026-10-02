# ADR-012 — Cross-Region Operations Reporting

Status: **ACCEPTED**
Date: 2026-10-02

## Context

Wave 12's exit criteria include AI-assisted cross-region operations. The pieces below it all exist now:

- Wave 11's detectors write `analytics_findings` — anomaly, health, maintenance risk, energy — each scoped to
  a single `deviceId`.
- ADR-009 gave every device a nullable `regionId`.
- ADR-011 made each device's belief-vs-observation auditable.

What does not exist is the join. Every detector output is per-device; regions were added afterwards and never
connected to them. So an operator whose fleet spans regions cannot ask the only question the region concept
exists to answer — which region is in trouble — and would have to write the SQL by hand.

The obvious implementation is `groupBy(regionId)`. It is wrong in a specific, quiet way.

## Decision

Report regional rollups over findings that already exist, and be explicit when the totals do not cover the
whole fleet.

- The rollup returns one row per **active** region, each carrying its own `regionCode`, `displayName` and
  `timezone`, so a row is self-describing rather than requiring a join to interpret.
- Severity is kept as counts (`INFO` / `WARNING` / `CRITICAL`), never collapsed into a score. There is no
  meaningful average of CRITICAL and INFO, and a single number shaped like a health percentage invites being
  read as one.
- A device with a null `regionId` is **counted as unplaced**, never folded into a region total and never
  assigned to a default region. Since ADR-009 every device can be unplaced, and dropping those devices would
  make the fleet look smaller than it is.
- A device pointing at a **region that is not active** is also counted as unplaced. It is not in any region
  this platform operates, and reporting it under that region's code would claim coverage that does not exist.
- The result carries `complete: boolean` and an explanatory `note`. When `complete` is false, the region rows
  explicitly do not cover the whole fleet, and the reader is told so rather than left to infer it.
- `regionsWithoutFindings` is returned separately, so "no problems in this region" is distinguishable from
  "not covered by this report".
- `unplacedDevices()` lists the **actionable** subset: devices that actually have a finding in the window but
  sit in no active region. Listing every unplaced device instead would be an unactionable dump. Each entry
  says whether it was *never* assigned or points at a *deactivated* region, because the fix differs, and
  carries `unobserved: true` when `lastHeartbeatAt` is null — a device that has never spoken has a cached
  status, not an observed one.

Note on implementation: `analytics_findings` carries only a scalar `device_id`, no `device` relation, so the
region lookup is a second, tenant-scoped query rather than a join. A finding whose device id cannot be
resolved inside the tenant counts as unplaced, which is the safe direction — it cannot inflate a region total.

## Safety Boundaries

- **No failover, no routing, no traffic movement.** This reports. Anything that *acts* on a regional problem
  — failing over, shedding load, re-routing a fleet — is a separate decision with its own ADR and its own
  failure modes. This ADR does not pre-authorise any of it, and Wave 12's exit criteria are not met by
  reporting alone.
- **No region is invented.** No code path assigns a device to a region because a report needed a bucket.
- **No silent completion.** An incomplete rollup says so. Presenting partial region totals as a whole fleet is
  the specific dishonesty this slice exists to prevent.
- **No cross-tenant aggregation.** Findings, devices and the resulting rows are all tenant-scoped, so a
  regional view can never mix two tenants' fleets.
- **Not in this slice.** Time-series comparison between regions, and any alerting driven by a regional
  aggregate. Alerting on a partial total would page someone about a fleet smaller than the real one.
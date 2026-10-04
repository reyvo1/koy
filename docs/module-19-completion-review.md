# Module 19 — Organization & Branch Completion Review

## Status

Module 19 foundation-complete and locally green at commit `33ccc26`.
Enterprise organization/branch grouping layered on top of the existing tenant
model — a branch maps 1:1 onto a tenant, so all tenant-isolated boundaries
(automation, scene, scheduler, notification, analytics, sharing) apply
unchanged. No smart-space duplication.

## Slice inventory

- 19.1 Persistence & service: `organizations` (one per owner membership) +
  `organization_branches` (tenantId unique — one branch per tenant; first
  branch is primary). `OrganizationService`: atomic creation with primary
  branch, owner-only branch additions.

## Validation evidence

- Full Jest: 144 suites / 1007 tests green.
- DB integration: 11 suites / 45 tests green on real PostgreSQL 16.
- Lint clean; build green.

## Deferred

Org-scoped cross-branch dashboards, billing/quota grouping (Module 27),
REST API surface, production deployment approval.

## Production product-surface closure — 2026-10-04

The historical Module 19 foundation above remains valid, but the former generic
"REST API surface" deferral is no longer current. The production-readiness
candidate now exposes the organization lifecycle through the existing
`OrganizationController` and the Admin Web platform surface:

- platform operators can list organizations and create an organization with its
  primary branch;
- the organization owner can add another tenant as a branch;
- branch uniqueness and owner uniqueness are enforced both by service checks and
  database constraints, with concurrent `P2002` races translated to stable
  conflict responses rather than leaking an internal error;
- the tenant organization screen continues to read only the organization that
  contains the active tenant.

Cross-branch dashboards and billing/quota grouping remain separate product work.
Environment-specific production deployment approval also remains separate from
this source-level closure.

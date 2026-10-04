# Module 20 — Advanced RBAC, Policy & Audit Completion Review

## Status

Module 20 foundation-complete and locally green at commit `0dfeb26`.
Custom tenant-scoped roles, permission/policy evaluation, and an audit trail
delivered on top of the existing MEMBER/ADMIN membership roles.

## Slice inventory

- 20.1 Persistence & policy engine: `custom_roles` (JSONB permission lists,
  name unique per tenant), `membership_role_overrides` (member↔role binding),
  `rbac_audit_log` (action/resource/actor/allowed).
  `RbacPolicyService`: effective permissions = base role union custom roles;
  ADMIN is wildcard; custom-role wildcard `*` supported; denials always
  audited, allows audited only when requested (bounded log volume).

## Validation evidence

- Full Jest: 145 suites / 1011 tests green.
- DB integration: 11 suites / 45 tests green on real PostgreSQL 16.
- Lint clean; build green.

## Deferred

Role CRUD REST API, resource-scope conditions (per-room/per-device policies),
audit query surface, production deployment approval.

## Production product-surface closure — 2026-10-04

The historical Module 20 foundation above remains valid, but the former
"Role CRUD REST API" deferral is no longer current. The production-readiness
candidate now exposes the exact runtime permission catalog plus tenant-scoped
custom-role create/list/delete, assign and revoke operations through both the
backend and Tenant Web.

The lifecycle is deliberately MEMBER-only: ADMIN keeps the wildcard base role,
so assigning a custom role to ADMIN is rejected rather than storing an
ineffective/misleading override. Runtime UAT proves that the same MEMBER token
moves `403 -> 200 -> 403` as an exact permission is assigned and revoked.

Resource-scope conditions (for example per-room/per-device policy conditions)
and a dedicated audit-query operator surface remain separate product work.
Environment-specific production deployment approval remains separate.

## Production tenant-isolation hardening — 2026-10-05

The product-surface closure exposed one persistence invariant that the original Module 20 foundation did not anchor in PostgreSQL: `membership_role_overrides` scoped the membership FK by `(membershipId, tenantId)` but the Custom Role FK used only `roleId`. The runtime writer already checked tenant ownership, but production authorization integrity must survive a future writer bug or direct SQL.

The current candidate therefore makes Custom Role identity addressable by `(id, tenantId)` and uses a composite role FK from `membership_role_overrides`. The migration fails closed on any pre-existing cross-tenant binding, and real PostgreSQL integration requires such a write to fail with `P2003`. This strengthens, rather than replaces, the existing MEMBER-only controller policy and runtime RBAC UAT.

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

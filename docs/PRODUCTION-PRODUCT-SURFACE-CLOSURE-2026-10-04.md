# Production Product-Surface Closure — 2026-10-04

## Authority

- Repository: `reyvo1/iot-platform`
- Branch: `main`
- Pre-batch all-green baseline: `2cecb7aa4020ffb6a566949f2e5a44794432d0a7`
- GitHub Actions run: `37212540616`
- Evidence: `logs_100795117631.zip`
- Enterprise Waves 1-13: closed; this batch does not reopen them.

## Purpose

Close product lifecycles that existed in backend/domain code but were not fully
operable from the Admin Web, while preserving tenant isolation, runtime RBAC and
one-time credential semantics. No existing UAT is skipped or relaxed.

## Organization / Branch

Platform Admin receives a complete Organization surface from `/super/tenants`:
list organizations, create an organization with a primary tenant branch, add and
detach non-primary tenant branches, and delete the organization grouping when
the active platform membership owns it. Primary-branch detach is rejected; the
operator must delete the organization grouping instead. Deleting a grouping
cascades only its `OrganizationBranch` rows and never deletes tenant records.
The service uses interactive transactions, tenant-scoped mutations, and stable
domain conflicts for uniqueness/race conditions. Tenant Organization reads
remain tenant-bound and read-only.

## Tenant Custom Roles

Tenant Admin receives custom-role create/list/delete and MEMBER assignment/
revocation in `/tenant/pengguna`. The permission checkboxes are sourced from the
same `RBAC_PERMISSION_CATALOG` used by runtime policy evaluation. Assignment to
ADMIN is rejected because ADMIN already has wildcard base permissions; storing a
custom override there would be misleading state. Live runtime UAT proves the
same MEMBER credential changes from denied to allowed and back to denied when a
permission is assigned/revoked.

## Webhook Signing-Secret Rotation

Tenant Webhook management receives an explicit two-step rotate action. The new
secret is returned once, is not present in list responses, and replaces the old
secret immediately. The live webhook probe verifies a post-rotation delivery
with the new HMAC secret and asserts that the previous secret cannot validate the
same delivery.

## Acceptance expansion

Focused Organization, Custom Role and Webhook regression suites are part of the
targeted pre-push gate. The live rescue runtime extension proves Organization
create/directory/current lookup, rejects primary-branch detach with HTTP 409,
detaches a secondary branch through the API, deletes the detached tenant, then
deletes the organization grouping and verifies tenant membership is cleared.
The UAT is forbidden from cleaning this lifecycle with direct Prisma branch
mutation. Custom Role lifecycle is live-probed, and the webhook probe carries
the cryptographic rotation proof. The existing full Jest, ESP32/QEMU and
enterprise acceptance gates remain mandatory.

## Remaining production boundary

This closure is a repository/product-surface candidate, not a production deploy
approval. Real production still requires environment-owned secrets and broker
ACL/CA material, DNS/TLS evidence, off-host backup/restore proof, monitoring and
alert routing, a rehearsed rollback owner/path, and a valid production approval
receipt. Physical HIL remains optional/non-blocking for software certification;
automated hardware simulation evidence must remain labelled
`SIMULATED_HARDWARE_LIVE_SERVICE`.

## V2 tenant-isolation hardening — 2026-10-05

Continued production-readiness audit found that the Custom Role controller/service correctly scoped role and membership lookups by tenant, while the original `membership_role_overrides.roleId` foreign key referenced only `custom_roles(id)`. That left a database-level hole for a future buggy writer or manual SQL to combine a tenant-A membership with a tenant-B role.

V2 adds `CustomRole @@unique([id, tenantId])` and changes the override relation to the composite `(roleId, tenantId) -> (id, tenantId)`. Migration `20261005011500_tenant_role_override_tenant_integrity` checks for existing cross-tenant rows first and aborts if any exist; it never repairs authorization data automatically. Database integration now performs a real cross-tenant override create and requires PostgreSQL/Prisma to reject it with `P2003`. Existing controller/service tenant checks and all previous UAT remain mandatory.

The first V1 local run stopped before commit/push. Only its backup patch was supplied to this session, not the named failure log, so this document does not invent which V1 gate failed. The V2 runner therefore accepts only the hash-exact V1 dirty state (or the clean green base), reports its active gate, reruns the full unchanged gate chain, and refuses commit/push on any failure.

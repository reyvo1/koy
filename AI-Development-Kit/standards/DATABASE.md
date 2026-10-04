# Database Contract

PostgreSQL source of truth transactional. Prisma ORM utama. UUID untuk
entity utama. UTC timestamp. `deletedAt` hanya jika lifecycle memerlukan
soft delete. Tenant ownership path harus eksplisit. Unique invariant
ditegakkan dengan database constraint bila memungkinkan. Index
berdasarkan query pattern. Migration shared tidak diedit. Transaction
digunakan untuk atomic state change dan tidak menahan network call.
Telemetry high-volume memerlukan partition/retention strategy.

## Tenant-composite authorization references — current contract (2026-10-05)

- A tenant-scoped authorization row may not reference another tenant's role/resource through an ID-only foreign key. When both sides carry `tenantId`, use a composite unique identity and composite FK so PostgreSQL proves tenant equality.
- Authorization migrations are fail-closed: detect legacy cross-tenant rows and abort with an explicit repair requirement; never auto-delete or silently rewrite permission assignments.
- Application tenant checks remain mandatory even when the database has the composite FK; database constraints are the final race/manual-SQL defense, not a replacement for service authorization.

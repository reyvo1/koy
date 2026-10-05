# MODULE 20 --- Advanced RBAC, Policy & Audit

Baca System Instructions, Repository Memory, standards, architecture,
dan source code aktual.

Kerjakan melalui exact bounded candidate dan official repository workflow: **Modul 20 --- Advanced RBAC, Policy
& Audit**.

## Scope

Implement custom roles, permission/policy evaluation, resource scope,
audit query dan cross-tenant negative tests.

## Agent Rules

-   Jangan hanya menampilkan kode di chat.
-   Susun perubahan sebagai exact-file payload; jangan edit branch main secara langsung.
-   Gunakan struktur dan package manager aktual.
-   Pertahankan modul yang sudah selesai.
-   Lakukan minimum coherent change set.
-   Tambahkan migration, tests, Swagger/contracts, env example, dan docs
    bila relevan.
-   Jalankan hanya official validation profile sesuai urutan gate murah ke mahal.
-   Review git diff dan git status.
-   Perbarui `AI-Development-Kit/agent/REPOSITORY-MEMORY.md` hanya
    dengan fakta baru.
-   Jangan commit atau push kecuali saya memerintahkan.
-   Jangan mengerjakan Modul 21 atau modul lain.

Gunakan output contract System Instructions. Jika blocker nyata tidak
dapat diselesaikan setelah failure protocol, jangan berpura-pura
selesai.

## Current operator-surface contract

The tenant ADMIN console exposes the tenant-scoped immutable mutation trail at
`/tenant/audit-log`, backed by `GET /audit-logs`. Pagination is keyset-based and the response
`nextCursor` is an opaque base64url value that the same controller accepts on the next request;
do not expose a raw `{createdAt,id}` object while requiring an encoded request cursor. Filters are
server-side and invalid action/cursor/limit inputs fail closed with 400.

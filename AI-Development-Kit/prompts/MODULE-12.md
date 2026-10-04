# MODULE 12 --- Scene

Baca System Instructions, Repository Memory, standards, architecture,
dan source code aktual.

Kerjakan melalui exact bounded candidate dan official repository workflow: **Modul 12 --- Scene**.

## Scope

Implement scene actions, ordered/parallel execution, history, permission
dan partial failure handling.

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
-   Jangan mengerjakan Modul 13 atau modul lain.

Gunakan output contract System Instructions. Jika blocker nyata tidak
dapat diselesaikan setelah failure protocol, jangan berpura-pura
selesai.

## Post-green integrity note — 2026-10-04

Scene deletion is not valid while any Schedule targets that Scene. Enforce this both at the domain
surface (409 conflict with actionable message) and at the database boundary using a tenant-scoped
composite FK. Record deletion audit only after persistence succeeds.

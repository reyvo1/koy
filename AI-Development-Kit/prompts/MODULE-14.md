# MODULE 14 --- Notification

Baca System Instructions, Repository Memory, standards, architecture,
dan source code aktual.

Kerjakan melalui exact bounded candidate dan official repository workflow: **Modul 14 --- Notification**.

## Scope

Implement notification domain, preference, template, email adapter,
webhook-ready abstraction, retry dan delivery status.

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
-   Jangan mengerjakan Modul 15 atau modul lain.

Gunakan output contract System Instructions. Jika blocker nyata tidak
dapat diselesaikan setelah failure protocol, jangan berpura-pura
selesai.

## Current operator-surface contract

The production-candidate tenant console exposes the durable notification delivery log through
`GET /notifications`, `/notifications/summary`, and an operator-safe `GET /notifications/:id`.
The detail endpoint must never return the persisted notification `body`, idempotency key, or
worker lease id: authentication notification bodies contain verification/reset tokens. UI status
labels must track the Prisma `NotificationStatus` enum (`PENDING`, `DELIVERING`, `SENT`, `FAILED`,
`EXHAUSTED`) and must not invent a `RETRY_SCHEDULED` state.

# API Contract

Base `/api/v1`. Resource plural. Gunakan HTTP semantics dan status code
yang benar.

Success: `{"success":true,"data":{},"meta":{}}`

Error:
`{"success":false,"error":{"code":"CODE","message":"Message","details":[]},"requestId":"uuid"}`

Semua boundary divalidasi. Public endpoint terdokumentasi di Swagger.
Critical create/command mengevaluasi idempotency. Secret tidak boleh muncul pada list/read response atau log. Pengecualian hanya untuk credential yang secara kontrak harus diserahkan satu kali pada create/rotate; response one-time itu tidak boleh dapat dibaca ulang, dan rotasi harus membuat secret lama tidak valid.


### Organization lifecycle production invariant
- Platform Organization mutations are platform-owned. Non-primary branches may be detached explicitly; primary-branch detach is rejected. Deleting an Organization removes only Organization/Branch grouping rows and must never delete Tenant records. Live UAT must exercise these operations through HTTP product APIs, not direct Prisma cleanup.

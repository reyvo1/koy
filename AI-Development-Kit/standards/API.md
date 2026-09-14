# API Contract

Base `/api/v1`. Resource plural. Gunakan HTTP semantics dan status code
yang benar.

Success: `{"success":true,"data":{},"meta":{}}`

Error:
`{"success":false,"error":{"code":"CODE","message":"Message","details":[]},"requestId":"uuid"}`

Semua boundary divalidasi. Public endpoint terdokumentasi di Swagger.
Critical create/command mengevaluasi idempotency. Secret tidak pernah
muncul pada response.

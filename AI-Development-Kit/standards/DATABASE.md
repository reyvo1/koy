# Database Contract

PostgreSQL source of truth transactional. Prisma ORM utama. UUID untuk
entity utama. UTC timestamp. `deletedAt` hanya jika lifecycle memerlukan
soft delete. Tenant ownership path harus eksplisit. Unique invariant
ditegakkan dengan database constraint bila memungkinkan. Index
berdasarkan query pattern. Migration shared tidak diedit. Transaction
digunakan untuk atomic state change dan tidak menahan network call.
Telemetry high-volume memerlukan partition/retention strategy.

# Testing Contract

Test behavior dan contract. Unit test untuk business rules, authorization,
automation, dan transformation kompleks. Integration test untuk
database/repository, Redis, MQTT boundary, dan queue. E2E untuk auth, tenant
isolation, pairing, telemetry, latest state, command acknowledgement,
automation, dan OTA lifecycle. Negative cross-tenant test wajib pada resource
tenant-scoped.

Untuk satu exact candidate, broad Full Jest dijalankan maksimal satu kali bila
sudah mencakup unit, integration-in-process, dan repository contracts. Projected
lifecycle states hanya menjalankan lifecycle dan state-sensitive contracts
kecuali source/runtime berubah atau profile authoritative mewajibkan broad test.
Gate formatting, lint/static, dan focused checks harus mendahului Full Jest.

Agent tidak boleh mengklaim test lulus tanpa exact command evidence.

## Database tenant-isolation proof — current contract (2026-10-05)

For tenant-composite authorization foreign keys, static schema checks are not sufficient. The PostgreSQL integration profile must attempt a real cross-tenant write and require the database to reject it (Prisma `P2003` or the exact equivalent FK violation). This test adds coverage; it may not replace or relax service/controller RBAC tests.
## Production-deployment status contract

Until an environment-specific production approval has actually been completed, `docs/production-readiness.md` must retain the canonical machine-checked marker `Status: NOT READY FOR PRODUCTION DEPLOYMENT`. Repository software may be green and remote CI may be authoritative, but those facts must be recorded separately and must never replace the deployment-approval boundary. Existing contract tests asserting this marker are safety gates and must not be weakened to accommodate documentation drift.

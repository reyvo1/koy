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

# GELOMBANG 1 — LAPORAN SELESAI (25 Agustus 2026)

## Layar blueprint vs implementasi

### §2 Tenant Admin Dashboard (G1.1–G1.6) — 16 layar, semua ada
| Layar | Route | Status |
|---|---|---|
| Dashboard | /tenant/dashboard | ada (room-centric) |
| Devices | /tenant/perangkat | **LIVE** (/devices proxy) |
| Device Groups | /tenant/grup-perangkat | fail-closed (backend belum punya entitas group) |
| Rooms | /tenant/ruangan | **LIVE** (Modul 17 spaces) |
| Buildings | /tenant/gedung | **LIVE** (spaces) |
| Locations | /tenant/lokasi | **LIVE** (spaces) |
| Realtime Monitoring | /tenant/realtime | **LIVE** (SSE + chart) |
| Telemetry Charts | /tenant/grafik | **LIVE** (aggregate explorer) |
| Historical Data | /tenant/historis | **LIVE** (range + tabel agregat) |
| Commands | /tenant/perintah | **LIVE** (send + ACK + history) |
| Automation | /tenant/otomatisasi | **LIVE** (runtime status) |
| Schedules | /tenant/schedules | **LIVE** (Modul 13) |
| Scenes | /tenant/scenes | **LIVE** (list + run, Modul 12) |
| Notifications | /tenant/notifikasi | **LIVE** (Module 16 findings) |
| Reports/Export | /tenant/laporan | **LIVE** (CSV dari agregat) |
| User Management | /tenant/pengguna | ada |

### §1 Super Admin (G1.7–G1.12) — semua layar ada
- Tenants: **LIVE** (/admin/tenants)
- Subscriptions/Quotas/Billing: **LIVE** (endpoint baru /admin/billing/subscriptions)
- Users: **LIVE** (/admin/users); Roles: ada; API Keys: **LIVE** (/admin/api-keys)
- Devices: **LIVE**; Provisioning: alur + slot sesi; Firmware & OTA: **LIVE** (/admin/firmware)
- Telemetry Center, Command Center: ada
- MQTT Center: kontrak webhook/topik/ACL + status backend live
- Monitoring: **LIVE** readiness probe tiap 30 detik
- Security & Audit: **LIVE** (rbac+share audit merged, endpoint baru)

### §4 NOC (G1.13): LIVE tiles + SSE stream + probe.
### §5 Mobile (G1.14): 5-tab nav final; realtime tab live dari telemetry/latest.

## Backend additions (kebutuhan nyata layar, arsitektur dijaga)
- GET/POST /spaces (JWT+Tenant+ADMIN) → SpaceController
- GET /admin/billing/subscriptions, /admin/api-keys, /admin/audit-logs, /admin/firmware

## Kualitas
Setiap layar = 1 commit + spec hijau + lint bersih + typecheck + push.
Semua data live via backend; yang belum ada kontraknya tampil fail-closed,
TIDAK ada data demo/palsu tersisa.

## TODO (mengikuti aturan #13)
1. Billing page (/super/billing) masih placeholder ringan — menunggu invoice
   entity; subscriptions/quotas sudah live.
2. Provisioning sessions list butuh endpoint sesi aktif (backend).
3. Roles page masih statis — menunggu endpoint role matrix.

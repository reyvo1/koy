# UI BLUEPRINT — IoT Platform Enterprise (SUMBER: C:\Users\IVO\Documents\iot.txt)

Status: MENGIKAT. Semua layar wajib mengikuti domain & arsitektur inti.
Target kelas: ThingsBoard Enterprise / EMQX / Azure IoT Central.
ATURAN REY: kerjakan SEMUA dulu, simulasi belakangan, revisi belakangan.

## 1. Super Admin Platform
- Dashboard
- Tenant Management: Tenants, Subscriptions, Quotas, Billing
- User Management: Users, Roles, Permissions, API Keys
- Device Management: Devices, Device Groups, Provisioning, Credentials, Firmware, OTA Updates
- Capability Registry: Templates, Definitions, Versioning
- Telemetry Center: Live Data, Historical Data, Explorer, Export
- Command Center: Send Command, Queue, ACK Monitor, History
- MQTT Center: Brokers, Sessions, Topics, ACL
- Monitoring: PostgreSQL, Redis, MQTT, Workers, API Health
- Security Center, Audit Logs, Alerts, Reports, Profile & Session (no fake platform-settings controls)

### 1a. Statusimplementasi §1 terhadap fondasi nyata

Blueprint ini MENGIKAT daftar layar, tetapi setiap butir hanya boleh hadir dengan data yang
benar-benar ada. Berikut status yang terverifikasi terhadap skema, service, dan guard aktual.

| Butir blueprint | Status | Backing nyata |
|---|---|---|
| User Management — Users | BUILT | `GET /admin/platform-users` |
| User Management — Roles | BUILT | `CustomRole` + `MembershipRoleOverride` + `RbacAuditLog`, dibaca live oleh `RbacPolicyService.evaluate()` |
| User Management — Permissions | BUILT | `GET /admin/platform-rbac/permission-catalog` — himpunan permission yang benar-benar ditegakkan, di-pin dua arah ke dekorator `@RequirePermission` oleh `rbac-permission-catalog.spec.ts` |
| User Management — API Keys | BUILT | API key metadata/lifecycle |
| Capability Registry — Definitions | BUILT | Capability per perangkat |
| Capability Registry — Versioning | BUILT | `Capability.schemaVersion`; drift dihitung nyata per key |
| Capability Registry — **Templates** | **BUILT** | `CapabilityTemplate` + `CapabilityTemplateVersion`: create draft, publish/supersede/rollback, deprecate, preview/apply lewat Admin Web dan API nyata |
| Command Center — Queue/ACK/History | BUILT | `DeviceCommand` + ACK/terminal state nyata |
| Command Center — Send Command | BUILT (cross-tenant, fail-closed) | `POST /admin/platform-commands/dispatch`: tenant eksplisit, device harus milik tenant itu, reason wajib, audit di kedua jalur, actor dari session |
| Monitoring — PostgreSQL/Redis/MQTT/API Health | BUILT | `/health/ready` |
| Monitoring — **Workers** | **SEBAGIAN — contract-limited** | Worker adalah on-demand tick tanpa sinyal liveness. Surface menampilkan metric family yang benar-benar terekam dan menyatakan `UNAVAILABLE_BY_CONTRACT`; tidak ada tile "worker sehat" |
| Tenant Management — Subscriptions / Quotas | BUILT (dipisah) | Satu read model, dua tampilan. Dulu kedua route menampilkan halaman identik |

Pelajaran yang berlaku: `Roles` pernah menampilkan matriks permission hard-coded
(`dashboard:*, device:*, scene:*, automation:*, schedule:*`) yang tidak ada satu pun di API,
dan guardrail lama justru *menempelkan* string itu — sehingga fabrikasi itu terkunci di tempat
sekaligus terlindungi dari penghapusan. Katalog permission sekarang adalah sumber kebenaran
tunggal di backend, dan assertion-nya load-bearing di gate prepush.

## 2. Tenant Admin Dashboard
Dashboard | Devices | Device Groups | Rooms | Buildings | Locations
Realtime Monitoring | Telemetry Charts | Historical Data
Commands | Automation | Schedules | Scenes
Notifications | Alerts
Reports | Export Data
User Management

## 3. Device Detail Screen
Info (ID/Firmware/Protocol/Last Seen) + Capabilities (Temperature/Humidity/
Voltage/Current/Power/Relay/Camera/GPS) + Realtime Charts + Commands
(Turn On/Off/Restart/Update Firmware) + Command History + Alert History

## 4. NOC / Control Room
Global dashboard (online/offline/telemetry per sec/MQTT conn/Redis/PG/Workers/
alerts) + World Map + Live Telemetry Stream + Command Queue + System Logs

## 5. Mobile App
Bottom nav: Home, Devices, Realtime, Alerts, Profile
Home = devices online/offline, recent alerts, quick commands, recent telemetry,
system health. Device detail = status, realtime data, charts, commands,
history, settings.

## 6. Future AI Dashboard
AI Center: Anomaly Detection, Failure Prediction, Device Health Score,
Predictive Maintenance, Energy Optimization, AI Assistant

## Mapping ke fondasi backend yang SUDAH ADA
- Tenant/Billing -> Modul 19 (org) + Modul 27 (billing tables)
- Users/Roles/API Keys -> Modul 20 RBAC + Modul 21 API keys
- Devices/Capabilities/Provisioning -> core device module
- Firmware/OTA -> Modul 15
- Telemetry Center -> Module 09 (latest/history/aggregate)
- Commands -> command service + Modul 11 dispatcher
- MQTT Center -> mqtt module + metrics
- Monitoring -> health/metrics modules
- Security/Audit -> Modul 20 rbac_audit_log + share_audit_log
- Rooms -> Modul 17 space hierarchy
- Scenes/Schedules -> Modul 12/13
- Notifications/Alerts -> Modul 14/16
- AI Center -> Modul 16 analytics findings

## Per-domain access model

Read off the repositories and the policy engine, not assumed. The four business domains are not
uniform, and treating them as one is what produced the original gap.

| Domain | Owner column | Role gate | Notes |
|---|---|---|---|
| `automation` | `ownerMembershipId` | yes | Every query filters by owner, so it is owner-only and an admin gets no automatic access to another member's automation. |
| `dashboard` | `ownerMembershipId` + `audience` | yes | `PERSONAL` is owner-only; `TENANT_SHARED` additionally needs an admin role and a `canManageShared` request flag. |
| `scene` | none | device-derived access | Reads require VIEW on every referenced action device; create/run/enable/disable/delete require CONTROL. Mutations are audited. |
| `schedule` | none | target-scene-derived access | Reads/mutations inherit VIEW/CONTROL from the target Scene; targetless schedules are admin-only. Mutations are audited. |

`scene` and `schedule` deliberately do not use owner-aware `@RequirePermission(..., allowOwner)`
because neither model has an owner column. They are nevertheless gated: `SceneAccessService`
derives authorization from the devices referenced by Scene actions, and Schedule delegates to the
target Scene boundary. This preserves member functionality without opening every tenant member to
every Scene/Schedule. Audit rows name the concrete device-derived authorization that permitted the
mutation.

Automation and Dashboard continue to use the RBAC permission/ownership path. Scene and Schedule
use a separate device-access path. `src/rbac/domain-access-model.spec.ts` and
`scripts/validate-rescue-baseline.mjs` pin both models so a future refactor cannot silently collapse
them into a single, weaker rule.

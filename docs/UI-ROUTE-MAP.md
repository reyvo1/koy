# UI Route Map — Rescue Baseline

Status meanings:

- **KEEP** — canonical product route.
- **MERGE** — compatibility route; forward to canonical route where practical.
- **QUARANTINE** — source retained, but not exposed as normal product navigation until its real contract is complete.
- **REMOVE-LATER** — candidate for deletion only after references/tests are updated.

## Platform / Super Admin

| Route | Status | Purpose |
|---|---|---|
| `/super/dashboard` | KEEP | Platform-scoped tenant/device overview + real readiness evidence |
| `/super/tenants` | KEEP | Tenant management |
| `/super/subscriptions` | KEEP | Subscription state |
| `/super/quotas` | KEEP | Quota state |
| `/super/billing` | KEEP | Billing foundation |
| `/super/users` | KEEP | Platform users |
| `/super/roles` | KEEP | Roles/RBAC |
| `/super/api-keys` | KEEP | API key metadata/lifecycle |
| `/super/devices` | KEEP | Platform-scoped device directory; no tenant fallback |
| `/super/device-groups` | KEEP | Read-only cross-tenant directory of real tenant-owned device groups |
| `/super/provisioning` | KEEP | Backend-issued provisioning |
| `/super/credentials` | KEEP | Non-secret device credential lifecycle metadata; hashes/secrets never exposed |
| `/super/firmware` | KEEP | Firmware/OTA |
| `/super/capabilities` | KEEP | Observed per-device capability registry with schemaVersion/unit/constraints; no fake global template entity |
| `/super/telemetry` | KEEP | Platform-scoped aggregate + bounded raw telemetry explorer/CSV by real device/capability |
| `/super/mqtt` | KEEP | MQTT operational view |
| `/super/monitoring` | KEEP | Real readiness dependencies + platform workload context |
| `/super/alerts` | KEEP | Analytics-backed alerts |
| `/super/security` | KEEP | Security/audit |
| `/super/ai` | KEEP | Persisted analytics findings; roadmap cards are informational only |
| `/super/settings` | KEEP | Platform settings |
| `/super/commands` | KEEP | Read-only platform command queue/ACK/terminal history monitor; no cross-tenant dispatch |
| `/super/reports` | KEEP | Bounded server-generated tenant operational report rows + CSV from the same real rows |
| `/noc` | QUARANTINE | Partial live data; global location/map contract incomplete |

## Tenant Admin

| Route | Status | Purpose |
|---|---|---|
| `/tenant/dashboard` | KEEP | API-backed tenant overview |
| `/tenant/perangkat` | KEEP | Device lifecycle |
| `/tenant/perangkat/[deviceId]` | KEEP | Canonical tenant device detail |
| `/tenant/ruangan` | KEEP | Space hierarchy: rooms |
| `/tenant/gedung` | KEEP | Space hierarchy: buildings |
| `/tenant/lokasi` | KEEP | Space hierarchy: sites |
| `/tenant/realtime` | KEEP | Realtime telemetry |
| `/tenant/grafik` | KEEP | Telemetry charts |
| `/tenant/historis` | KEEP | Historical telemetry |
| `/tenant/perintah` | KEEP | Real command send/history |
| `/tenant/otomatisasi` | KEEP | Automation persistence/runtime status |
| `/tenant/scenes` | KEEP | Scenes |
| `/tenant/schedules` | KEEP | Schedules |
| `/tenant/workspace` | KEEP | Dashboards/workspaces |
| `/tenant/temuan` | KEEP | Canonical Module 16 analytics findings surface; not notification delivery |
| `/tenant/notifikasi` | MERGE | Compatibility redirect to `/tenant/temuan` until a real notification-delivery read surface exists |
| `/tenant/laporan` | KEEP | Real aggregate export |
| `/tenant/pengguna` | KEEP | Tenant user management |
| `/tenant/grup-perangkat` | KEEP | Real tenant-scoped device groups; create/list/member/remove backed by `/device-groups` |

## Legacy / Compatibility

| Route | Status | Destination / rule |
|---|---|---|
| `/` | MERGE | Historical read-only contract, auto-forwards to `/tenant/dashboard` |
| `/dashboard` | MERGE | Redirects to `/tenant/dashboard` |
| `/devices` | MERGE | Redirects to `/tenant/perangkat` |
| `/perangkat` | MERGE | Redirects to `/tenant/perangkat` |
| `/automation` | MERGE | Redirects to `/tenant/otomatisasi` |
| `/perangkat/[deviceId]` | MERGE | Redirects to `/tenant/perangkat/[deviceId]` |
| `/technician` | QUARANTINE | Diagnostics only; no synthetic claim/log data |
| `/mobile-preview` | QUARANTINE | Visual preview; operational values must not be simulated |
| `/cctv` | QUARANTINE | Streaming contract incomplete |

## End User

User Web is now room-centric per Product Vision. `apps/user-web/app/page.tsx` redirects to `/beranda`; the dynamic dashboard remains available at `/dashboard` as an additional authorized view.

| Route | Status | Purpose |
|---|---|---|
| `/beranda` | KEEP | Canonical room-centric summary from `/spaces/accessible` |
| `/ruangan` | KEEP | Authorized ROOM → Devices view; placement never grants access by itself |
| `/perangkat-saya` | KEEP | Flat owner/share VIEW/CONTROL device directory |
| `/perangkat-saya/[deviceId]` | KEEP | Authorized Device Detail: capability, latest telemetry, bounded boolean controls, command history, OTA rollout evidence, Module 16 findings; current firmware/protocol remain unavailable unless a real per-device source exists |
| `/dashboard` | KEEP | Existing dynamic dashboard/workspace surface |
| `/` | MERGE | Redirect to `/beranda` |

The backend read model first applies the existing device owner/share authorization policy and only then groups authorized devices by ROOM placement. VIEW-only shares cannot issue commands; CONTROL is separately resolved by `DeviceAccessService`. User Web never infers physical actuator state from HTTP submission and reconciles terminal ACK/FAILED/TIMED_OUT before reloading telemetry. Non-boolean User Web controls stay fail-closed until the typed control surface is shared safely.

`apps/user-mobile/App.tsx` remains the only canonical Expo runtime entry. The duplicate `src/app/mobile-app.tsx` generation has been removed. The secure authenticated shell preserves the UI Blueprint five-tab structure: Home / Devices / Realtime / Alerts / Profile. Devices and Device Detail are backend-backed through the authorized room/device contracts. Mobile Alerts reads only authorized WARNING/CRITICAL Module 16 findings from `/analytics/alerts/accessible`; this is analytics evidence, **not** notification-delivery history. End-user settings mutations remain fail-closed until a real write contract exists.

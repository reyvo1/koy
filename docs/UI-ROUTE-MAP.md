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
| `/super/subscriptions` | KEEP | Per-tenant subscription rows only. Renders the `subscriptions` view of the billing read model; the plan/quota section lives on `/super/quotas` |
| `/super/quotas` | KEEP | Plan quota definitions plus usage-against-quota from the persisted `BillingUsage` rows the billing endpoint already returns (latest period per tenant, with an over-quota marker). Previously rendered the whole billing page, making it byte-identical to `/super/subscriptions` |
| `/super/billing` | KEEP | Billing foundation |
| `/super/users` | KEEP | Platform users |
| `/super/roles` | KEEP | Roles & Permissions, read from the enforcement layer. The permission list is served by `GET /admin/platform-rbac/permission-catalog` and is pinned bidirectionally to the `@RequirePermission` decorators by `rbac-permission-catalog.spec.ts` |
| `/super/api-keys` | KEEP | API key metadata/lifecycle |
| `/super/devices` | KEEP | Platform-scoped device directory; no tenant fallback |
| `/super/device-groups` | KEEP | Read-only cross-tenant directory of real tenant-owned device groups |
| `/super/provisioning` | KEEP | Backend-issued provisioning |
| `/super/credentials` | KEEP | Non-secret device credential lifecycle metadata; hashes/secrets never exposed |
| `/super/firmware` | KEEP | Firmware/OTA |
| `/super/capabilities` | KEEP | Observed per-device capability registry plus a Versioning section reading `GET /admin/platform-capabilities/versions`: the schemaVersion actually installed per key and which keys disagree across devices. `templateEntity: ABSENT` — no global template lifecycle exists in the schema, so none is presented |
| `/super/telemetry` | KEEP | Platform-scoped aggregate + bounded raw telemetry explorer/CSV by real device/capability |
| `/super/mqtt` | KEEP | MQTT operational view |
| `/super/monitoring` | KEEP | Real readiness dependencies + platform workload context + a Workers section reading `GET /admin/platform-runtime-signals`. Workers are on-demand tick workers with no liveness signal, so the surface reports recorded metric families and states `UNAVAILABLE_BY_CONTRACT` rather than a health tile |
| `/super/alerts` | KEEP | Analytics-backed alerts |
| `/super/security` | KEEP | Security/audit |
| `/super/ai` | KEEP | Persisted analytics findings; roadmap cards are informational only |
| `/super/settings` | KEEP | Platform settings |
| `/super/commands` | KEEP | Read-only platform command queue/ACK/terminal history monitor, plus a platform dispatch section. Dispatch is deliberately tenant-crossing and therefore fail-closed: the operator must name the target tenant explicitly, the device must provably belong to it, a non-empty reason is required, and both the success and failure paths are written to the RBAC audit log with the actor taken from the session |
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
| `/tenant/notifikasi` | KEEP | Real notification delivery log (queue, worker attempts, failure codes) from `GET /notifications` + `/notifications/summary`. Distinct from `/tenant/temuan`, which is analytics findings, not delivery history. |
| `/tenant/laporan` | KEEP | Real aggregate export |
| `/tenant/pengguna` | KEEP | Tenant user management |
| `/tenant/grup-perangkat` | KEEP | Real tenant-scoped device groups; create/list/member/remove backed by `/device-groups` |

## Menu ownership rule (enforced)

`scripts/validate-rescue-baseline.mjs` derives the real page inventory from the filesystem
and fails when either side of the menu contract breaks:

- every non-legacy page is reachable from a shell menu (a built page reachable only by a
  typed URL is a defect, not a bookmark);
- every menu entry resolves to a real page (no dead links);
- a QUARANTINE route may be linked, but only from a group whose own label says it is not
  production, and never from an unlabelled product group.

QUARANTINE pages therefore live in exactly two labelled groups: `Laboratorium · belum
produksi` (`AdminShellV3`) and `Beta · belum produksi` (`SuperAdminShell`).

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

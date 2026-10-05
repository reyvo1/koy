# Backend ↔ Frontend Surface Census

## Authority

This census is tied to the post-production-readiness software baseline and must be updated whenever a backend controller or governed product page is added/removed. It is not a replacement for authorization tests: backend guards and database constraints remain authoritative.

Current source inventory: **45 controller files / 187 HTTP-or-SSE endpoints**.

## Classification

- **PRODUCT_UI** — operator/end-user product capability with a governed web/mobile surface.
- **AUTH_UI** — authentication/session surface; intentionally not a signed-in menu entry.
- **MACHINE_ONLY** — infrastructure, webhook, device protocol, public API, health, or metrics surface that must not be invented as an operator menu.
- **QUARANTINE** — a partial product surface whose missing runtime capability is explicitly labelled and excluded from production navigation.
- **LEGACY** — compatibility route retained for existing callers; no new UI should depend on it.

## Backend controller census

| Controller | Endpoints | Class | Product decision |
| --- | ---: | --- | --- |
| `admin-api-keys.controller.ts` | 6 | PRODUCT_UI | Super + tenant API-key lifecycle is surfaced. |
| `admin-billing-directory.controller.ts` | 3 | PRODUCT_UI | Super subscriptions/audit/firmware directory surfaces. |
| `admin-device-provisioning.controller.ts` | 8 | PRODUCT_UI | Super device/capability/findings and tenant device provisioning surfaces. |
| `admin-directory.controller.ts` | 5 | PRODUCT_UI + LEGACY | Tenant directory is surfaced; `GET /admin/users` is legacy and must not gain a new UI dependency. |
| `admin-governance.controller.ts` | 11 | PRODUCT_UI | Platform RBAC/capability/runtime/command governance surfaces. |
| `admin-operations.controller.ts` | 2 | PRODUCT_UI | Tenant operational summary + findings. |
| `admin-platform-observability.controller.ts` | 12 | PRODUCT_UI | Super observability, reports, MQTT, NOC, command history, credentials/groups. |
| `admin-user-provisioning.controller.ts` | 10 | PRODUCT_UI | Super and tenant user lifecycle. |
| `accessible-analytics.controller.ts` | 1 | PRODUCT_UI | User/mobile accessible alerts. |
| `app.controller.ts` | 1 | MACHINE_ONLY | Root service response; not a menu. |
| `auth.controller.ts` | 7 | AUTH_UI | Register/login/refresh/logout/verify/reset flows; auth shell, not signed-in menu. |
| `automation.controller.ts` | 7 | PRODUCT_UI | Tenant automation CRUD/activation. |
| `billing-cycle.controller.ts` | 4 | MACHINE_ONLY | Billing runtime/internal integration surface. |
| `billing-webhook.controller.ts` | 1 | MACHINE_ONLY | Payment provider webhook. |
| `camera.controller.ts` | 2 | QUARANTINE | Network discovery/media status support CCTV quarantine; no production streaming claim. |
| `dashboard.controller.ts` | 7 | PRODUCT_UI | Workspace/dashboard lifecycle. |
| `device-maintenance.controller.ts` | 3 | QUARANTINE | Technician maintenance support; technician surface remains quarantined. |
| `camera-onboarding.controller.ts` | 4 | QUARANTINE | Camera inventory/pairing support CCTV quarantine. |
| `capability.controller.ts` | 2 | PRODUCT_UI | Device capability detail/management. |
| `command.controller.ts` | 3 | PRODUCT_UI | Tenant command dispatch/history. |
| `device-group.controller.ts` | 5 | PRODUCT_UI | Tenant device-group lifecycle. |
| `device-public.controller.ts` | 3 | MACHINE_ONLY | Pair/heartbeat/credential rotation are device protocol/lifecycle endpoints, not menu items. |
| `device-technical-history.controller.ts` | 1 | PRODUCT_UI | Device technical history. |
| `device.controller.ts` | 10 | PRODUCT_UI | Device list/detail/provision/location/health lifecycle. |
| `health.controller.ts` | 3 | MACHINE_ONLY | Liveness/readiness probes. |
| `integration-registry.controller.ts` | 3 | PRODUCT_UI | Tenant registry is now surfaced at `/tenant/integrasi`; registry state is not provider-connect proof. |
| `metrics.controller.ts` | 1 | MACHINE_ONLY | Prometheus scrape surface. |
| `mqtt.webhook.controller.ts` | 3 | MACHINE_ONLY | Broker auth/ACL/ACK callbacks. |
| `notification.controller.ts` | 3 | PRODUCT_UI | Tenant delivery log + safe detail; message body is deliberately not exposed. |
| `organization.controller.ts` | 7 | PRODUCT_UI | Super organization lifecycle + tenant read view. |
| `ota.controller.ts` | 5 | PRODUCT_UI | Super firmware/rollout lifecycle. |
| `public-api.controller.ts` | 3 | MACHINE_ONLY | API-key `/v1/*` consumer surface, intentionally not an admin menu. |
| `rbac-audit.controller.ts` | 1 | PRODUCT_UI | Tenant audit log now surfaced at `/tenant/audit-log`. |
| `tenant-role.controller.ts` | 6 | PRODUCT_UI | Tenant custom-role lifecycle. |
| `scene.controller.ts` | 7 | PRODUCT_UI | Scene CRUD/run/execution history. |
| `schedule.controller.ts` | 6 | PRODUCT_UI | Schedule CRUD/enable/run history. |
| `device-share.controller.ts` | 3 | PRODUCT_UI | Device sharing lifecycle. |
| `accessible-space.controller.ts` | 1 | PRODUCT_UI | User-accessible spaces. |
| `space.controller.ts` | 3 | PRODUCT_UI | Tenant space hierarchy lifecycle. |
| `telemetry mqtt.webhook.controller.ts` | 1 | MACHINE_ONLY | MQTT ingest callback. |
| `telemetry-aggregation.controller.ts` | 1 | PRODUCT_UI | Chart aggregation. |
| `telemetry-stream.controller.ts` | 1 | PRODUCT_UI | Authorized SSE realtime stream. |
| `telemetry.controller.ts` | 2 | PRODUCT_UI | Latest/history telemetry. |
| `users.controller.ts` | 3 | PRODUCT_UI + AUTH_UI | Profile is surfaced; tenant-context is a session/helper contract, not a menu. |
| `webhook.controller.ts` | 6 | PRODUCT_UI | Tenant webhook lifecycle + secret rotation + delivery history. |

## Gaps closed in this batch

1. **Tenant audit log** — `GET /audit-logs` existed without a tenant product surface. `/tenant/audit-log` and its BFF now expose it. The pagination bug was fixed at the source: `nextCursor` is now the same opaque base64url value the controller accepts on the next request.
2. **Integration registry** — `GET/POST/DELETE /admin/integrations` existed without a tenant page. `/tenant/integrasi` now exposes registry lifecycle, while explicitly refusing to claim `REGISTERED` means a provider is connected.
3. **Integration input + database boundary** — registry code claimed `credentialRef` was not a secret but accepted any non-empty string, and the original Module 22 SQL created `integrations`/`integration_sync_state` without the foreign keys represented by Prisma and omitted the database default for `IntegrationSyncState.syncedAt`. The service/BFF require canonical `secret://...` references, the backend normalizes and rejects whitespace-only display names, and migration `20261005165000_integration_registry_tenant_integrity` fail-closes legacy orphan/cross-tenant rows, restores the `syncedAt` database default, then installs the tenant and composite integration provenance foreign keys.
4. **Notification detail** — `GET /notifications/:id` existed without UI. The detail surface is now reachable, but the backend no longer returns the full Prisma row: `body`, `idempotencyKey`, and lease id stay internal because auth notification bodies contain verification/reset tokens.
5. **Notification status drift** — the old UI rendered `RETRY_SCHEDULED`, which is not a `NotificationStatus`, and omitted `EXHAUSTED`. The UI now follows the Prisma enum and counts `FAILED + EXHAUSTED` as failed outcomes.

## Intentional backend-only surfaces

The following are **not missing menus** and must remain outside ordinary product navigation unless their product contract changes: `/health*`, `/metrics`, broker `/mqtt/*` callbacks, telemetry ingest callback, payment webhook/cycle endpoints, device heartbeat/credential rotation, `/v1/*` API-key public API, and `/users/tenant-context`.

## Intentional frontend quarantine

`/noc`, `/cctv`, `/technician`, and `/mobile-preview` remain quarantined. They may have partial backend support, but the missing capabilities named on those pages prevent a production `KEEP` classification. Do not promote them merely because an endpoint exists.

## Legacy cleanup candidate

`GET /admin/users` is a legacy duplicate beside the explicit platform/tenant user directories. No current UI should add a dependency on it. Removal requires a separate compatibility audit rather than silently deleting it.

## Production conclusion

After this closure, the governed `KEEP` menus have real pages and real backend contracts, and the known backend-without-menu routes are explicitly classified as machine/auth/quarantine/legacy rather than being mistaken for unfinished UI. Any new controller must update this census and its contract guard before the release can remain production-candidate green.

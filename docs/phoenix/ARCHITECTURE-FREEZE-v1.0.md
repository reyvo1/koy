# ARCHITECTURE FREEZE v1.0 — Phoenix IoT Platform

Status: **FROZEN** · Tanggal: 2026-08-23 · HEAD saat freeze: `084c9bf`
Output resmi Phase 2 (POST-MODULE-30 ENTERPRISE TRANSITION PROGRAM v1.0).

## 1. Baseline Komponen Inti (frozen)

| Komponen | Lokasi | Kontrak |
|---|---|---|
| Bootstrap & runtime | `src/bootstrap` | production-application, production-runtime |
| Config validation | `src/config` | config.validation |
| Auth (JWT HttpOnly) | `src/auth` | auth.service, login route |
| Users + tenant context guard | `src/users` | tenant isolation wajib |
| Device + capability | `src/device` | capability.validator, command service/scheduler |
| Telemetry (latest/history/aggregate) | `src/telemetry` | Modul 09 contracts |
| Dashboard widget (CARD/SWITCH/GAUGE/CHART/TABLE/STATUS) | `src/dashboard` | MAP fail-closed |
| Scene / Scheduler / Automation | `src/scene`, `src/scheduler`, `src/automation` | Modul 12/13/11 |
| Notification (retry bounded) | `src/notification` | webhook transport |
| OTA (SHA-256, state machine) | `src/ota` | Modul 15 |
| Analytics findings | `src/analytics` | Modul 16 |
| Space hierarchy (Site→Building→Floor→Room) | `src/space` | Modul 17 |
| Sharing (VIEW/CONTROL, audit) | `src/sharing` | Modul 18 |
| Organization / RBAC / Public API | `src/org`, `src/rbac`, `src/public-api` | Modul 19–21 |
| Observability (logging/metrics/health/correlation) | `src/common`, `src/metrics`, `src/health`, `src/redis` | reliability contracts |
| Billing tables | `src/billing` | Modul 27 (provider adapter belum) |

## 2. Dependency Inti (frozen)

- NestJS + Fastify · Prisma + PostgreSQL 16 · Redis · MQTT (mosquitto-compatible)
- Next.js App Router (admin-web, user-web) · Expo React Native (user-mobile)
- Test: Jest (151 suite / 1034 test) + DB integration (45/45)

## 3. Kontrak API Inti (frozen — backward compatible only)

- `/auth/*` register/login/session
- `/devices` CRUD, `/devices/:id/capabilities`, `/commands`,
  `/devices/:id/telemetry/latest|history|aggregate?capability&bucket&from&to`
- `/scenes` CRUD + `POST /scenes/:id/run`
- `/schedules` CRUD · `/admin/operational-summary`
- Aturan: perubahan kontrak butuh ADR baru; breaking change = versi API baru.

## 4. Skema Database Inti (frozen)

Migrasi applied sampai `20260823100000_module_27_billing_quota_foundation`.
Prisma = single source of truth. Migrasi baru harus ASCII-only dan additive.

## 5. Prinsip yang Dibekukan (dari audit 87%, 0 pelanggaran)

1. Vendor neutral, protocol neutral, capability driven
2. Tenant isolated (guard di setiap request path)
3. Secure by default (JWT HttpOnly, hashed credentials, rate limit, audit)
4. Observable (structured logging, metrics, health, correlation-id)
5. Fail-closed untuk fitur belum disetujui (MAP, CCTV streaming, runtime automation)
6. Documentation First + ADR required (Phoenix Governance Framework v1.0)

## 6. Yang TIDAK termasuk freeze (area kerja v2.0)

Realtime push (WS/SSE) · Payment provider adapter · GPS/location ·
CCTV streaming runtime · Technician & Executive App · HA/load testing ·
AI/ML expansion. Semua mengikuti urutan POST-MODULE-30.

## 7. Prosedur Perubahan (post-freeze)

Setiap perubahan arsitektur/kontrak/skema wajib:
ADR baru (`docs/phoenix/adr/ADR-XXX.md`) → review → quality gate → merge.
Breaking change tanpa ADR = pelanggaran freeze.

# Wave 2 supersession note — 2026-09-15

The foundation review remains historical evidence. Wave 2 adds the previously deferred delivery runtime: durable multi-instance leases, stale-lease recovery, transient-only retry policy, real auth verification/reset email enqueue, and a provider-neutral HTTPS email relay. Provider-specific email/payment/ecosystem integrations remain later waves. See `docs/wave-02-core-runtime-closure.md`.

---

# Module 14 — Notification Completion Review

## Status

Module 14 foundation-complete and locally green at commit `bd52dfe`.
Durable idempotent notification enqueue, PostgreSQL-authoritative bounded
retry, and a webhook-ready transport delivered. No external email provider is
wired; the transport abstraction is the only delivery path.

## Slice inventory

- 14.1 Persistence & retry state machine: `NotificationTemplate`,
  `Notification` (idempotent by `(tenantId, idempotencyKey)`),
  `NotificationPreference`; bounded retry max 3 attempts with deterministic
  backoff (60s / 5min), unknown errors never retried, EXHAUSTED terminal.
- 14.2 Webhook-ready transport: HTTPS-only POST with 10s hard timeout;
  non-2xx/timeout/unreachable mapped to bounded error codes recorded through
  `recordAttempt`.

## Validation evidence

- Full Jest: 138 suites / 976 tests green.
- DB integration: 11 suites / 45 tests green on real PostgreSQL 16.
- Lint clean; build green.

## Deferred

Email adapter (SMTP), preference REST surface, template CRUD API,
production deployment approval.

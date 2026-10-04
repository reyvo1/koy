# Module 21 — Public API, Webhook & SDK Foundation Completion Review

## Status

Module 21 foundation-complete and locally green at commit `2d63300`.
API key lifecycle with hashed storage, scope enforcement, and HMAC-SHA256
webhook signing delivered.

## Slice inventory

- 21.1 Persistence & services: `api_keys` (SHA-256 hashed secrets, prefix
  lookup, scoped JSONB, expiry, revocation), `webhook_endpoints` +
  `webhook_deliveries` (HMAC-SHA256 `X-Signature`, delivery log).
  `PublicApiService`: create-once plaintext disclosure, prefix+hash
  authentication with lastUsedAt touch, revocation, deterministic webhook
  signing.

## Validation evidence

- Full Jest: 146 suites / 1015 tests green.
- DB integration: 11 suites / 45 tests green on real PostgreSQL 16.
- Lint clean; build green.

## Deferred

Public REST routes consuming API keys, webhook delivery retry worker,
TypeScript SDK generation, production deployment approval.

## Production product-surface closure — 2026-10-04

The historical Module 21 foundation above remains valid. The former public-route
and webhook-credential lifecycle gaps have since been narrowed substantially:

- API keys authenticate the read-only `/v1/devices`, `/v1/telemetry` and
  `/v1/findings` surfaces through `ApiKeyGuard` and the documented scope model;
- Tenant Web exposes API-key creation/revocation without re-reading plaintext
  credentials;
- Tenant Web now exposes two-step webhook signing-secret rotation, with the new
  secret displayed once and never returned by endpoint list APIs;
- live webhook probing verifies HMAC-SHA256 with the rotated secret and proves
  that the previous secret no longer validates the post-rotation delivery.

A durable webhook retry worker and any future write-capable public API remain
separate product decisions. Environment-specific production deployment approval
remains separate from this source-level closure.

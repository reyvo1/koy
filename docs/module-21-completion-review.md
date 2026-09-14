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

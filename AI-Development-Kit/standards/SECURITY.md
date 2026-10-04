# Security Contract

Least privilege, deny by default, explicit tenant authorization.
Argon2id untuk password. Short-lived access token. Refresh token
rotation dan revocation. Rate limit endpoint sensitif. CORS allowlist.
Request size limit. Safe errors. Device identity unik, rotatable,
revocable. MQTT production TLS dan ACL per device. Jangan log
credential. Audit login, permission change, pairing, credential
rotation, OTA, API key, dan admin action penting.

## Admin Web BFF session finalization — current contract (2026-10-04)

- A backend `401` is authentication failure: after the single refresh attempt, a final 401 clears Admin Web session cookies.
- A backend `403` is authorization failure: preserve the valid session and relay the refusal; never rewrite it to 401/logout.
- When refresh-token rotation succeeds, every BFF response that continues the session must persist the rotated access + refresh pair before returning to the browser.
- BFF read failures must remain failures. Infrastructure/auth errors may not be converted into `200` plus empty arrays/graphs merely to keep the UI populated.
- Multi-resource fan-out may suppress only explicitly expected visibility races (for example resource 403/404 where the product contract intentionally hides inaccessible/disappeared rows); unexpected/network/5xx failures must propagate.

## Tenant-scoped RBAC persistence — current contract (2026-10-05)

- Custom-role membership bindings are tenant-bound at both application and database layers. A role from tenant B must be impossible to persist on a tenant-A membership even through a future buggy writer or direct SQL.
- Cross-tenant authorization corruption is a deployment blocker; migrations must fail closed and require explicit operator repair rather than guessing intended permissions.

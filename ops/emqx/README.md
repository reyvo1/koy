# EMQX 5.9.2 — RESCUE-02B Integration

This directory contains the broker-side contract for the canonical IoT device flow.
It is **not** production TLS configuration. The canonical local rescue flow runs the API, PostgreSQL, Redis, and EMQX on one Compose network so broker callbacks use the internal service address `http://api:3000` and never depend on Windows/Podman host routing.

## 1. Start local infrastructure

For local rescue, first run `npm run rescue:env:init` to create a gitignored `.env` with generated local-only secrets; alternatively copy `ops/env/rescue-local.env.example` and replace every placeholder manually. For a fresh EMQX data volume the compose file uses `EMQX_DASHBOARD_PASSWORD` as the initial Dashboard admin password, and the named EMQX data volume preserves runtime configuration across ordinary container recreation. Then, from the project root:

```bash
docker compose -f docker-compose.rescue.yml up -d
```

This starts the local rescue services. The canonical orchestrator builds and starts the API as the `api` Compose service after infrastructure protocol readiness. The API container applies committed Prisma migrations before starting `dist/main.js`.

For the complete local ordering (infra readiness -> API image build -> API container migration/start -> EMQX HTTP auth -> telemetry/ACK webhook configuration -> full readiness), prefer `npm run rescue:local:up` after dependencies are READY. The orchestrator uses `npm run rescue:emqx:webhooks:configure` and will only mutate webhook/rule configuration after the live broker OpenAPI exposes the required bridge/rule operations and `bridges_probe` accepts the source-controlled HTTP webhook contract. Unsupported broker APIs fail closed with no webhook mutation. Use `npm run rescue:local:down` to stop the complete compose runtime while preserving named volumes by default.

Webhook configuration is still **not** live broker evidence. Publish delivery, telemetry idempotency, ACK correlation, webhook-secret rejection, ACL isolation, and physical ESP32 behavior remain separate acceptance checks.

## 2. Configure HTTP authentication

The backend endpoint `POST /mqtt/auth` authenticates two distinct identities.

For a **device**, success returns an EMQX 5.9.2 ACL that permits only:

- publish `tenants/<tenantId>/devices/<deviceId>/telemetry`
- publish `tenants/<tenantId>/devices/<deviceId>/commands/ack`
- subscribe `tenants/<tenantId>/devices/<deviceId>/commands`
- deny everything else

For the **API publisher service account** configured by `MQTT_USERNAME` and
`MQTT_PASSWORD`, success permits only:

- publish `tenants/+/devices/+/commands`
- deny everything else

Use a dedicated publisher username; do not reuse a device ID.

Use either:

```bash
npm run rescue:emqx:configure
```

The helper reads `.env` directly by default; use `npm run rescue:emqx:configure -- --env=path/to/file` for another environment file. It consumes `EMQX_DASHBOARD_USERNAME`, `EMQX_DASHBOARD_PASSWORD`, `MQTT_WEBHOOK_SECRET`, and optional `EMQX_API_URL` / `IOT_API_FROM_EMQX`. Alternatively, configure the equivalent authenticator manually from the Dashboard. The HOCON
fragment `http-authenticator.rescue-02.example.hocon` documents the exact
request template.

The old `POST /mqtt/acl` endpoint remains available as a compatibility/audit
path, but the canonical EMQX 5.9.2 route uses ACL rules embedded in the successful
authentication response.

## 3. Configure telemetry webhook

Preferred source-controlled path after API liveness and HTTP authentication are ready:

```bash
npm run rescue:emqx:webhooks:configure -- --env=.env
```

The helper logs into the live EMQX Dashboard API, loads the broker OpenAPI contract, verifies `bridges`/`bridges_probe`/`rules` operations, probes webhook bridge compatibility without mutation, and then idempotently manages the telemetry and ACK bridge/rule pair below. If the live broker contract does not match, it stops without creating a partial integration. `npm run rescue:emqx:webhooks:self-test` validates that fail-closed behavior with synthetic fixtures only; it is not broker evidence.

For manual fallback/review, create an EMQX Webhook or HTTP Server Sink/Rule for:

`tenants/+/devices/+/telemetry`

Send `POST http://api:3000/mqtt/webhook/telemetry` with:

- header `Content-Type: application/json`
- header `X-Webhook-Secret: <same MQTT_WEBHOOK_SECRET as API>`
- JSON body shaped as:

```json
{
  "topic": "${topic}",
  "eventId": "${payload.eventId}",
  "payload": ${payload.payload}
}
```

The device MQTT payload itself must be:

```json
{
  "eventId": "unique-id",
  "payload": { "temperature": 27.2 }
}
```

## 4. Configure command ACK webhook

Create an EMQX Webhook or HTTP Server Sink/Rule for:

`tenants/+/devices/+/commands/ack`

Send `POST http://api:3000/mqtt/ack` with the same secret header
and JSON body:

```json
{
  "topic": "${topic}",
  "payload": ${payload}
}
```

Expected device ACK payload:

```json
{
  "commandId": "correlation-id",
  "status": "ACK",
  "reason": ""
}
```

`status` may be `ACK` or `FAILED` only.

## 5. Required negative checks

Do not accept the broker as wired until all of these are demonstrated:

1. correct device secret connects;
2. wrong secret is denied;
3. revoked device is denied;
4. API publisher credentials connect and publish a command topic;
5. API publisher cannot publish telemetry/ACK or subscribe to device command topics;
6. device can publish its telemetry topic;
7. device can publish its ACK topic;
8. device can subscribe to its command topic;
9. publish/subscribe to another device or tenant is denied;
10. telemetry reaches the API exactly once for one `eventId`;
11. ACK resolves only the matching device command;
12. missing/wrong webhook secret is rejected by the API.

## Production boundary

For production, replace Docker-host HTTP with a reviewed private HTTPS path,
proper broker TLS/mTLS, non-default Dashboard credentials, secret management,
and environment-specific persistence/backup. Do not deploy the local rescue
compose file as production infrastructure.

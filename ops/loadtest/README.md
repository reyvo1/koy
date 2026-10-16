# Function stress suite (k6)

Drives the platform's real functions with real identities at real volume, and holds them to budgets
that live in the repository. `scripts/run-load-gate.ts` measures two unauthenticated read endpoints;
this suite covers every operator, member, super-admin and public-API function the matrix declares,
plus a bounded write path.

## Why this is separate from the autocannon load gate

| | `load:gate` (autocannon) | `stress:suite` (k6) |
|---|---|---|
| auth | anonymous | tenant admin, member, super admin, API key |
| coverage | `/health`, `/docs` | every function declared in `config/stress-budget.json` |
| traffic mix | fixed connections | ramping arrival rate, weighted per function |
| write path | none | automation activation flip, idempotent profile update, device-group churn |
| judgement | p97.5 + req/s budget | global + per-class latency, error-rate and check budgets |
| evidence | console table | console table + optional Prometheus remote write → Grafana |

## Running it

```bash
# 1. a live API (locally or the rescue stack)
npm run rescue:local:recover          # or: docker compose -f docker-compose.rescue.yml up -d

# 2. the entities the suite refuses to run without
npm run stress:seed                   # writes .stress-credentials (git-ignored, mode 0600)

# 3. the suite
npm run stress:suite
```

k6 must be on `PATH` (or point `K6_BIN` at it) — install:
<https://grafana.com/docs/k6/latest/set-up/install-k6/>. The runner fails closed with an explicit
message when k6, the budget, the credentials or the target are missing; a missing load generator is
a missing test, never a pass.

Options:

```bash
node scripts/run-k6-stress-suite.mjs --budget=config/stress-budget.json --credentials=.stress-credentials
```

Credentials may also come from the environment, which is how CI supplies them:
`STRESS_ADMIN_EMAIL/PASSWORD/TENANT`, `STRESS_MEMBER_*`, `STRESS_SUPER_*`, `STRESS_API_KEY_SCOPES`,
and `STRESS_METRICS_TOKEN` to include the guarded `/metrics` scrape.

## What it exercises

- **read** — every operator, member and super-admin surface the census classifies as product UI:
  dashboards (list/detail/resolution/widget data), devices, capabilities, telemetry
  (latest/history/aggregate), commands (history/detail), shares, technical history, device groups,
  automations, scenes, schedules, notifications, maintenance plans, spaces, organizations,
  integrations and their runtime status, audit trail, RBAC catalog, webhooks, API keys, camera
  inventory, platform directory/reports/monitoring/NOC/telemetry explorer, and the `/v1` public API.
- **write** — bounded and safe: it flips one automation between active and inactive (restoring its
  original state in teardown), rewrites the authenticated operator's own profile with the value
  already stored, and creates a device group, adds and removes a member, then deletes the group — all
  inside one iteration. It never dispatches a command to a real actuator.
- **public API** — `GET /v1/devices`, `/v1/telemetry`, `/v1/findings` with an API key the suite
  creates in setup and deletes in teardown.

Surfaces that are deliberately not stressed are listed in `notStressed` in the budget, each with the
reason it cannot be: long-lived SSE streams, machine-only protocol surfaces, camera playback
signalling, OTA campaign writes, billing mutations, provider integration handshakes, and
auth flows that send email or create users.

## Budgets

`config/stress-budget.json` is the single source for both coverage and thresholds. Its class budgets
are declared claims, not measured baselines: the first run produces the measurement, then these
numbers are revised to reality or the platform is tightened. The suite emits one latency trend per
class, so a fast health endpoint cannot hide a slow write path behind an aggregate.

## Grafana

`ops/monitoring/grafana/dashboards/k6-stress-overview.json` is provisioned with the rest of the
stack and renders these metrics once k6 is pointed at Prometheus remote write:

```bash
K6_PROMETHEUS_RW_URL=http://127.0.0.1:9090/api/v1/write \
  k6 run --out experimental-prometheus-rw=$K6_PROMETHEUS_RW_URL ops/loadtest/k6/functions-stress.js
```

Remote write is not enabled by anything in this repository: it is a write credential for the
monitoring host and therefore an operator decision. Until it is configured the dashboard shows
"No data", which the dashboard itself explains on its first panel.

## CI

The rescue runtime job seeds the stress baseline, installs a pinned k6, and runs
`npm run stress:suite` after the Wave 13 load gate — against the same live API the acceptance probes
use. It is not optional and not `continue-on-error`: a suite step that quietly skipped would
manufacture evidence.

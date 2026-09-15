# Enterprise Acceptance Evidence Policy

Status date: 2026-09-15

This policy prevents a green pipeline from being interpreted as proof that every
real-world function has been exercised. Every wave claim must name the strongest
evidence tier actually executed.

## Evidence tiers

| Tier | Meaning | Examples |
|---|---|---|
| STATIC / CONTRACT | Source, schema, configuration, manifest, route or invariant inspection. | fail-closed config, API contract, baseline seal |
| UNIT | Function/class behavior with bounded collaborators or mocks. | retry policy, input validation, race/error mapping |
| INTEGRATION | Real process/database/cache/network boundary without the complete production stack. | PostgreSQL transactions, Redis state, local HTTPS receiver |
| LIVE-SERVICE | Real service/container using production protocol and auth path. | EMQX auth/ACL/publish/subscribe, PostgreSQL/Redis service probes |
| PHYSICAL / EXTERNAL | Real hardware or external provider/sandbox evidence. | ESP32 reconnect, OTA bytes on device, payment provider sandbox |
| PRODUCTION CERTIFICATION | Release-bound evidence across required lower tiers plus UAT/security/DR/performance gates. | Wave 13 approval receipt |

## Rules

1. A `PASS` may only claim the evidence tier that actually executed.
2. Static/source checks are guards, not substitutes for runtime evidence.
3. Timeout, connection close, missing callback or ambiguous error is never
   accepted as functional success unless the protocol contract explicitly proves
   the expected outcome.
4. A wave may close only when every exit criterion has the minimum evidence tier
   declared by that wave.
5. Functions that cannot be exercised honestly in GitHub remain `PENDING
   PHYSICAL/EXTERNAL EVIDENCE`; they are never promoted to PASS by simulation.
6. Mocks may prove local branching but cannot be cited as LIVE-SERVICE or
   PHYSICAL evidence.
7. GitHub heavy acceptance is authoritative for automated runtime evidence;
   local pre-push remains targeted/lightweight.

## Wave 2 minimum evidence matrix

| Wave 2 claim | Minimum evidence | Automated proof |
|---|---|---|
| Automation retry state/backoff/claim is durable | INTEGRATION | PostgreSQL integration suite |
| Failed automation command is re-armed under the same durable identity and republished | INTEGRATION + existing LIVE-SERVICE command/MQTT regression | PostgreSQL automation integration plus live EMQX acceptance |
| Retry claim race cannot half-commit execution state | UNIT + INTEGRATION transaction semantics | targeted Jest + PostgreSQL integration |
| Scheduler activation cannot outrun disabled runtime | UNIT / HTTP-contract | controller/policy targeted tests; broader API E2E remains part of full acceptance |
| Notification enqueue/lease/retry is durable and multi-instance safe | INTEGRATION | two Prisma clients against PostgreSQL |
| Webhook delivery only succeeds after a 2xx response | INTEGRATION | real local HTTPS receiver |
| HTTP 400 is terminal; 503 is retryable with persisted backoff | INTEGRATION | real local HTTPS receiver + PostgreSQL state |
| Email relay fail-closed configuration and request contract | UNIT / CONTRACT | targeted transport/config tests |
| Provider-specific email delivery | EXTERNAL | intentionally Wave 8; not claimed in Wave 2 |

Wave 2 is not closed by `rescue:validate` alone. The single GitHub Wave 2 push
must pass the core unit/E2E/build suite, PostgreSQL integration suite (including
the Wave 2 runtime cases above), Redis-dependent coverage already in CI, the
real EMQX rescue job, and full automated acceptance. Physical ESP32/OTA evidence
remains Wave 3 and is not implied by Wave 2 green status.


## Schema-tooling environment boundary

Prisma `validate` and `generate` are STATIC / CONTRACT evidence. They may use a deterministic non-production datasource URL only to satisfy `env("DATABASE_URL")` parsing when an operator shell has no database environment configured. That fallback must never be cited as PostgreSQL runtime evidence. INTEGRATION evidence still requires the GitHub PostgreSQL service, migrations, isolated test schema and database integration suite. If `DATABASE_URL` is already provided by CI/runtime, the wrapper must preserve it unchanged.

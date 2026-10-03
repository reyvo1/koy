# Enterprise Acceptance Evidence Policy

Status date: 2026-10-03

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
| SIMULATED-HARDWARE | Real firmware/toolchain or explicit device simulator exercising hardware behavior without a physical board. | ESP-IDF QEMU, Wokwi, ESP32 digital twin against live EMQX |
| PHYSICAL / EXTERNAL | Real hardware or external provider/sandbox evidence. | ESP32 HIL reconnect, OTA bytes on physical device, payment provider sandbox |
| PRODUCTION CERTIFICATION | Release-bound evidence across required lower tiers plus UAT/security/DR/performance gates. | Wave 13 approval receipt |

## Rules

1. A `PASS` may only claim the evidence tier that actually executed.
2. Static/source checks are guards, not substitutes for runtime evidence.
3. Timeout, connection close, missing callback or ambiguous error is never
   accepted as functional success unless the protocol contract explicitly proves
   the expected outcome.
4. A wave may close only when every exit criterion has the minimum evidence tier
   declared by that wave.
5. Simulation must be labeled `SIMULATED-HARDWARE`; it may close automated software/UAT gates when it exercises the production protocol/runtime path. It can never be promoted to PHYSICAL/HIL evidence. Missing physical equipment is tracked separately and does not block software-wave progression.
6. Mocks may prove local branching but cannot be cited as LIVE-SERVICE or
   PHYSICAL evidence.
7. GitHub heavy acceptance is authoritative for automated runtime evidence;
   local pre-push remains targeted/lightweight.
8. `SOFTWARE SCOPE CLOSED / GREEN` is a bounded implementation/regression statement, not a synonym for
   PHYSICAL / EXTERNAL evidence. Unavailable hardware must be replaced by the strongest possible
   `SIMULATED-HARDWARE + LIVE-SERVICE` path for automated UAT; site/HIL evidence remains separately labelled
   and non-blocking for software progress. Provider-owned external evidence may still remain PENDING when no
   sandbox/credential substitute exists.

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


### Outbound HTTPS evidence rule

Notification Webhook and Email Relay evidence MUST exercise the shared production HTTPS client. Test code may trust a fixture CA only through an isolated client instance. Process-global TLS verification bypasses such as `NODE_TLS_REJECT_UNAUTHORIZED=0` are forbidden evidence because they do not represent the production security boundary. TLS/configuration failures must remain distinguishable from timeout and network reachability failures.


## Wave 3 minimum evidence matrix

| Wave 3 claim | Minimum evidence | Automated proof |
|---|---|---|
| SDK is buildable firmware, not only a header/source contract | INTEGRATION / TOOLCHAIN | ESP-IDF 5.5.5 build for ESP32 + ESP32-C3 |
| Linked SDK boots on an ESP32 execution model | SIMULATED-HARDWARE | Espressif QEMU via repository-native boot runner (`idf.py merge-bin` + direct QEMU) |
| Provisioning/MQTT telemetry/command/ACK operate through the platform stack | SIMULATED-HARDWARE + LIVE-SERVICE | digital twin against real rescue API/PostgreSQL/EMQX |
| Network reconnect preserves device identity and resumes telemetry | SIMULATED-HARDWARE + LIVE-SERVICE | forced MQTT disconnect/reconnect and persisted post-reconnect event |
| Cold power-cycle rejoin preserves provisioned identity | SIMULATED-HARDWARE + LIVE-SERVICE | simulator process state is recreated, then the same provisioned credential re-heartbeats and publishes telemetry |
| Duplicate QoS-1 telemetry persists once | SIMULATED-HARDWARE + LIVE-SERVICE | same `eventId` is replayed after reconnect and the live PostgreSQL path retains one row |
| Duplicate QoS-1 command does not re-execute actuator behavior | SIMULATED-HARDWARE + LIVE-SERVICE | bounded command cache + ACK replay against real broker |
| OTA consumes the exact built firmware artifact | SIMULATED-HARDWARE | build artifact downloaded into rescue job and hashed before simulation |
| OTA rejects wrong SHA-256 and interrupted stream | SIMULATED-HARDWARE | trusted HTTPS artifact server with injected digest/stream failures |
| OTA rollback/confirmation state is deterministic | SIMULATED-HARDWARE | pending-verify slot model + live reconnect confirmation |
| Wokwi cloud simulation | SIMULATED-HARDWARE / EXTERNAL | optional when `WOKWI_CLI_TOKEN` is configured; absence is NOT_RUN, never PASS |
| Physical board flash/Wi-Fi RF/flash endurance/site-specific power-loss behavior | PHYSICAL / EXTERNAL | optional field-validation layer; never inferred from simulation and never used to halt software-wave progress |

Wave 3 may close on the mandatory automated evidence above. This does not waive
the combined simulated-hardware UAT receipt before automated software promotion. Any later physical/HIL run is additional field evidence, not a prerequisite for continuing software delivery.

# Module 11 Slice 11.13 — Automation Telemetry Ingestion Wiring Selection

## Status

Selected after the local-green Slice 11.12 closure commit `c7b4f97`.
This checkpoint selects the first, narrowly bounded connection between trusted
telemetry ingestion and the automation coordinator. It does not enable
automations by default, does not add a worker/queue/scheduler, and does not
approve production deployment.

SELECTION_INVARIANT_SLICE1113_SCHEMA=1
SELECTION_INVARIANT_SLICE1113_IMPLEMENTED=false
SELECTION_INVARIANT_SLICE1113_AUTOMATION_ENABLED=false
SELECTION_INVARIANT_SLICE1113_COORDINATOR_RUNTIME_REACHABLE=false
SELECTION_INVARIANT_SLICE1113_WORKER_ACTIVE=false
SELECTION_INVARIANT_SLICE1113_SCHEDULER_ACTIVE=false
SELECTION_INVARIANT_SLICE1113_QUEUE_ACTIVE=false
SELECTION_INVARIANT_SLICE1113_DIRECT_MQTT_SUBSCRIBER=false
SELECTION_INVARIANT_SLICE1113_INGESTION_FAILURE_ISOLATED=true
SELECTION_INVARIANT_SLICE1113_MODULE12_ACTIVATED=false
SELECTION_INVARIANT_SLICE1113_PRODUCTION_DEPLOYMENT_APPROVED=false

## Objective

A later implementation candidate may add only an internal, optional
post-ingestion automation hook inside `TelemetryService.ingest`. It must:

1. run strictly AFTER the telemetry row is durably persisted and accepted;
2. pass only a validated coordination envelope: tenant/device/capability IDs,
   telemetry id, event id, occurred-at, `EXTERNAL_ACCEPTED` origin, bounded
   ancestry, and primitive capability values already normalized by ingestion;
3. never alter ingestion outcomes: any coordinator failure is logged with a
   bounded structured event and fully isolated from the HTTP/MQTT ingest path;
4. keep duplicates safe — replayed duplicate events do not re-trigger
   coordination (the execution reservation identity already dedupes);
5. stay disabled unless an explicit environment-provided flag enables it
   (`AUTOMATION_RUNTIME_ENABLED`, default false), so existing deployments see
   zero behavior change until activation is separately approved;
6. add no new schema, migration, worker, queue, scheduler, polling loop, or
   direct MQTT publication.

## Activation boundary

Even after implementation, automations stay disabled at rest because every
persisted automation defaults to `enabled=false` and the runtime flag defaults
to false. Activation requires separate owner approval, audit, and rollback
plan.

## Explicit non-scope

No Module 12 activation, no public API changes, no frontend/mobile behavior,
no push approval, no production deployment approval.

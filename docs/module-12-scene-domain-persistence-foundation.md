# Module 12 Slice 12.1 — Scene Domain Contract & Persistence Foundation

## Status

Selected at Module 12 activation (owner pre-approved autonomous module
progression; roadmap gate satisfied after Module 11 completion review).
This slice introduces the bounded Scene domain contract and its persistence
foundation. It does not execute scenes, does not add workers/queues, and does
not approve production deployment.

SELECTION_INVARIANT_SLICE121_SCHEMA=1
SELECTION_INVARIANT_SLICE121_IMPLEMENTED=false
SELECTION_INVARIANT_SLICE121_SCENE_EXECUTION_ACTIVE=false
SELECTION_INVARIANT_SLICE121_TENANT_ISOLATED=true
SELECTION_INVARIANT_SLICE121_MAX_ACTIONS_PER_SCENE=16
SELECTION_INVARIANT_SLICE121_MODULE13_ACTIVATED=false
SELECTION_INVARIANT_SLICE121_PRODUCTION_DEPLOYMENT_APPROVED=false

## Objective

Implement only:

1. Prisma models `Scene`, `SceneAction`, and `SceneExecution` with
   tenant-bound relations mirroring the Automation pattern:
   - `Scene`: tenantId, name (≤120 chars, unique per tenant), enabled
     (default false), revision, actions list.
   - `SceneAction`: actionId (≤64 chars), position (unique per scene),
     deviceId/capabilityId/value primitive payload — identical shape to
     automation action intents.
   - `SceneExecution`: tenant-scene identity, status enum
     (`RESERVED → RUNNING → SUCCEEDED / FAILED / PARTIALLY_FAILED`),
     triggerSource ('USER_REQUEST' only in this slice), startedAt/completedAt.
2. Domain validator for scene creation input: name rules, 1..16 actions,
   unique actionIds, primitive values only, no scripts/topics/templates.
3. Repository with tenant-isolated CRUD for scenes and idempotent execution
   reservation keyed by `(tenantId, sceneId, requestId)`.
4. Migration + schema + focused unit tests. No controller/API yet.

## Explicit non-scope

Ordered/parallel execution engine, history queries, permission model beyond
tenant isolation, partial-failure handling runtime, public API, frontend,
Module 13+, production deployment.

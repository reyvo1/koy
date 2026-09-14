# Module 13 — Scheduler Completion Review

## Status

Module 13 foundation-complete and locally green at commit `4199d07`.
Timezone-aware scheduling, durable due-run ledger, and REST surface delivered.
No polling loop/worker is activated: an external tick (future worker or
operations drill) invokes the due-run service. Schedules default
`enabled=false`.

## Slice inventory

- 13.1 Persistence & domain: `Schedule` (CRON/COUNTDOWN, IANA timezone,
  INDEFINITE/LIMITED/ONCE repeat, maxRuns) + `schedule_runs` durable ledger
  unique per `(scheduleId, scheduledFor)`; validator parses cron via `cron`
  lib against timezone with Intl round-trip; bounded countdowns; UTC fallback.
- 13.2 Due-run service: materializeUpcomingRuns (bounded horizon/batch,
  idempotent createMany); executeDueRuns claims PENDING via DB clock, runs the
  target scene through SceneExecutionService (`sched:<runId>` requestId),
  applies SKIP_TO_NEXT / RUN_IMMEDIATELY missed policy with catch-up bounded
  at 10/schedule, updates runCount/lastRunAt.
- 13.3 REST API (JWT + tenant guards): create/list/get schedules, enable
  toggle, bounded runs history.

## Validation evidence

- Full Jest: 137 suites / 968 tests green.
- DB integration: 11 suites / 45 tests green on real PostgreSQL 16.
- Lint clean; build green.

## Deferred

Runtime tick loop/worker activation, notification fan-out on schedule fires
(Module 14), production deployment approval.

# SESSION TRANSFER — 2026-10-05

- **Authoritative all-green software baseline:** commit `8b2a76b69bb84e12324baee5ca031c7540d3b5d3` / GitHub Actions run `37307702951` / evidence `logs_101047777120.zip`.
- **Active WIP:** final backend↔frontend/menu/action integrity audit; not a certified checkpoint until official local gates + a new GitHub Heavy UAT pass.
- **Waves 1–13:** remain software-scope closed/green; do **not** restart them from zero without new failing evidence.
- **Production deployment:** remains **NOT APPROVED** until real environment evidence is captured and verified. Software/UAT green is not deployment approval.
- **Hardware evidence:** `SIMULATED_HARDWARE_LIVE_SERVICE` remains the automated label; PHYSICAL/HIL stays optional/non-blocking for software.
- **Current audit scope:** canonical tenant navigation, truthful user membership state/edit semantics, Technician maintenance action reachability, and permanent cross-surface regression guards.
- **Next session must:** resume from the exact checkpoint, verify `git rev-parse HEAD` + `git status --short`, use an isolated worktree, run official structural/Prisma/targeted/PostgreSQL/full pre-push gates, review the full diff, then one commit/push and GitHub Heavy UAT only if every local gate is green.

# Post-foundation enterprise execution — authoritative addendum

<!-- ENTERPRISE-WAVE-SYNC: authority=docs/ENTERPRISE-WAVE-ROADMAP.md; software-closed=1-13; active=none -->

The numbered Module 1–30 list below is the completed **foundation roadmap**. It is no longer the active execution queue. The active post-foundation queue is `docs/ENTERPRISE-WAVE-ROADMAP.md` with Wave 1–13. Acceptance evidence strength is governed by `docs/ENTERPRISE-ACCEPTANCE-EVIDENCE.md`; STATIC/CONTRACT checks cannot substitute for INTEGRATION or LIVE-SERVICE evidence. Waves 1–13 are **SOFTWARE SCOPE CLOSED / GREEN**; no software wave is active; the latest authoritative software checkpoint is GitHub run `37307702951` on commit `8b2a76b69bb84e12324baee5ca031c7540d3b5d3`. Automated production-readiness must use source-bound `SIMULATED_HARDWARE_LIVE_SERVICE` evidence for unavailable ESP32/camera hardware; later PHYSICAL/HIL observation is separate and non-blocking, while genuinely provider-owned evidence remains external. Future hardening remains one large batch before one GitHub push; no return to micro-RR progression.

---

# Development Roadmap

1.  Project Setup
2.  Database Foundation
3.  Authentication
4.  User & Tenant Management
5.  Device Management
6.  MQTT & Device Connectivity
7.  Universal Sensor & Capability Management
8.  Actuator & Device Command
9.  Telemetry & Time-Series Data
10. Dynamic Dashboard
11. Automation Engine
12. Scene
13. Scheduler
14. Notification
15. OTA Firmware
16. AI Analytics Foundation
17. Home/Site/Building/Room Management
18. Device Sharing & Guest Access
19. Organization & Branch
20. Advanced RBAC, Policy & Audit
21. Public API, Webhook & SDK Foundation
22. External Smart Ecosystem Integrations
23. System Health & Metrics
24. Logging, Audit, Tracing & Observability
25. Flutter Mobile Application
26. Admin Panel
27. Billing, Subscription, Usage & Quota
28. Production DevOps & Scaling
29. Security Hardening
30. ESP32 Device SDK & Provisioning

## Cross-module integrity hardening — 2026-10-04

Post-green product audits do not reopen completed modules; they test the seams between them.

- Module 12 Scene and Module 13 Schedule must use database-enforced tenant-scoped referential integrity. A Schedule target may not silently become orphaned.
- Module 27 Billing is part of tenant creation/deletion lifecycle. Mandatory system-owned subscription rows must be created and removed atomically with the tenant lifecycle.
- Capability template apply is a schema convergence operation, not a version-label update: published shape fields and version must move together.
- Cross-layer blind spots discovered after green certification must become additive targeted/live UAT. Existing acceptance criteria may not be weakened to obtain a PASS.
- Targeted Jest is an early-failure accelerator only. `wave3:prepush:check` must also run the complete Jest suite before push so local certification cannot be weaker than GitHub core CI.
- Every new `*.contract.spec.ts` must be deliberately classified in `test/contract-surface-policy.json`; an unclassified contract is a gate failure, not something to exclude from discovery.
- Packaging/diff hygiene is fail-closed: run `git diff --check` before expensive dependency-backed gates and again after them. Whitespace defects are fixed at source; the diff gate is never bypassed.
- Cross-feature live UAT fixtures must be isolated by semantic role. A fixture intentionally mutated to an invalid state for one lifecycle proof must not be silently reused as the happy-path input of another feature; retain an explicit negative assertion for the invalid state and provision a separate valid fixture for the positive path.
- Hardware simulation evidence remains `SIMULATED_HARDWARE_LIVE_SERVICE`; physical HIL stays a separate optional/non-blocking field-validation class.

## Gate

Agent tidak boleh melompat modul kecuali pengguna memerintahkan. Setiap
modul harus memiliki validation evidence dan repository diff yang dapat
direview.


## Production product-surface closure
- Preserve the all-green Wave 1-13 baseline while completing operator lifecycles that backend contracts already require. Organization management must support platform-owned create/list/add/detach-non-primary/delete-group semantics; primary detach is fail-closed and deleting a grouping must not delete tenants. Tenant Custom Roles and webhook secret rotation must remain end-to-end operable and regression-tested.
- The live acceptance path must exercise product APIs for lifecycle cleanup and must not use direct Prisma mutation to manufacture green evidence.

### Production RBAC database hardening — 2026-10-05
- Module 20 product closure additionally requires database-authoritative tenant equality for membership↔custom-role bindings. `membership_role_overrides` must reference Custom Role by `(roleId, tenantId)`, and real PostgreSQL integration must reject a cross-tenant role binding. This is additive production hardening and does not reopen the historical Module 20 foundation or weaken runtime RBAC gates.

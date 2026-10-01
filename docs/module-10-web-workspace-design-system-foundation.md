# Module 10 Slice 10.6 Web Workspace and Design-System Foundation

## Status

Implemented at `aa97f62`, completed by compatibility follow-up `5953677`, and confirmed green remotely.

This slice creates the approved npm workspace boundary for Admin Web, User Web, and a narrowly shared design-system package. The existing NestJS and Fastify backend remains authoritative at the repository root.

## Workspace Topology

- `apps/admin-web` — Next.js App Router and TypeScript shell for authorized operational experiences.
- `apps/user-web` — Next.js App Router and TypeScript shell for tenant-authorized user experiences.
- `packages/design-system` — shared semantic shell, surface, state primitives, and CSS design tokens.

The root `package.json` owns the npm workspace declaration and validation scripts. Application packages use security-approved pinned Next.js `16.3.8`, React `19.2.7`, and React DOM `19.2.7`. The repository Node.js 22 and npm 10 contract remains unchanged.

## Design-System Boundary

The shared package provides:

- semantic `ApplicationShell`, `SurfaceCard`, and `StateNotice` primitives;
- typed loading, empty, stale, unauthorized, offline, and error states;
- light and dark system-color tokens;
- visible focus treatment, skip navigation, semantic live regions, responsive layout, and reduced-motion behavior;
- no vendor, protocol, tenant, device, telemetry, command, camera, or authentication business logic.

The package exports source TypeScript for Next.js transpilation. It does not become a second backend domain layer.

## Security and Architecture Boundaries

The shells do not:

- call dashboard, telemetry, command, health, readiness, or metrics APIs;
- establish authentication or persist session material;
- connect directly to MQTT;
- expose device, broker, camera, RTSP, or vendor credentials;
- implement ONVIF, RTSP, barcode activation, realtime delivery, or command publication;
- invent roles or permissions absent from the backend;
- move the backend into `apps/api`;
- activate Module 11 or approve production deployment.

All future client selectors remain untrusted. Tenant isolation and authorization continue to be enforced server-side.

## Validation Contract

The repository validates this foundation through:

- npm lockfile reproducibility;
- design-system and application TypeScript checks;
- production Next.js builds for both web shells;
- Jest contract tests for topology, dependency pins, state/accessibility primitives, security exclusions, lifecycle evidence, and CI wiring;
- existing backend lint, build, unit, E2E, integration, recovery, security-audit, and release gates.

The backend production release artifact remains backend-only: web workspace directories are excluded and workspace metadata is removed from the packaged backend manifest. Web deployment topology and production approval are separate future decisions.

## CI Logger Typing Follow-up

GitHub Actions run `80362902300` passed dependency bootstrap, production dependency audit, non-mutating lint, Linux deployment-shell validation, Prisma validation and migration deployment, backend build, Admin/User Web type-check, and Admin/User Web production build before full Jest reported one TypeScript compile error in `src/config/logger.config.spec.ts`.

The follow-up explicitly types the public `createLoggerConfig` environment and configured-level inputs as `string | undefined`. This prevents the Next.js ambient `process.env.NODE_ENV` declaration from narrowing the backend logger factory API during Jest compilation. Runtime log-level resolution, request-ID propagation, sensitive-field redaction, dependencies, Prisma schema and migrations, MQTT, Redis, tenant isolation, Module 11 status, and production deployment approval remain unchanged.

## CI Test Environment Typing Follow-up

GitHub Actions run `80367259033` checked out commit `1e9b61b` and passed dependency bootstrap, production dependency audit, lint, Linux deployment-shell validation, Prisma validation and migration deployment, backend build, both web workspace type-check/build gates, and the complete backend Jest gate with 81 suites and 609 tests. The next first-failing gate was TypeScript compilation of `test/setup-e2e.ts` because the workspace-installed Next.js ambient declaration marks `process.env.NODE_ENV` as read-only.

The compatibility follow-up applies the same behavior-preserving environment mutation to the E2E, PostgreSQL integration, and MQTT integration setup files through `Object.assign(process.env, { NODE_ENV: 'test' })`. This prevents sequential CI failures in the three Jest setup surfaces without changing production runtime behavior, architecture, dependencies, Prisma schema or migrations, MQTT transport, Redis, tenant isolation, Module 11 status, or production deployment approval.

## Next Slice

Slice 10.7 User Web Dynamic Dashboard is now the active bounded slice after remote-green confirmation of `5953677`. Command controls, Admin Web operational features, mobile workspaces, CCTV, barcode runtime, Module 11, and production deployment remain outside the completed Slice 10.6 checkpoint.

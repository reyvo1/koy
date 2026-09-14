# Module 10 Slice 10.12 — Barcode and CCTV UI Compatibility Contract

## Status

**ACTIVE — DOCUMENTATION AND CONTRACT-TEST ONLY**

## Purpose

This slice defines a bounded, fail-closed UI compatibility boundary for two future experiences already present in the repository roadmap:

1. QR code or barcode as an optional onboarding entry point; and
2. normalized CCTV or security-camera presentation in platform clients.

It does not implement scanning, pairing, camera discovery, streaming, playback, camera control, vendor integration, or a new backend API. The NestJS/Fastify backend remains authoritative for tenant context, authorization, device identity, adapter selection, capability normalization, credential handling, and any future stream-availability decision.

## Source-of-Truth Continuity

This contract preserves the established architecture direction:

- QR code or barcode scanning is an onboarding mechanism, not a universal device or camera protocol;
- ONVIF, RTSP, and vendor camera APIs remain isolated behind future adapter boundaries;
- application clients consume normalized platform data and do not spread protocol- or vendor-specific models;
- clients never receive camera credentials, raw infrastructure secrets, MQTT credentials, or unrestricted vendor payloads;
- tenant isolation and resource authorization are derived server-side from trusted authenticated context.

No existing dashboard, device, capability, telemetry, command, authentication, or mobile-session contract is changed by this slice.

## Barcode and QR UI Boundary

A future scanner may collect one bounded code value only as a user-initiated onboarding input. The client must not infer that the code identifies a camera, vendor, protocol, tenant, or ownership relationship.

Before any future implementation is approved, the server-side onboarding boundary must be responsible for:

- bounded payload validation;
- safe device-identity resolution;
- tenant-authorized pairing eligibility;
- vendor or protocol adapter selection;
- replay and duplicate handling;
- secret redaction and safe audit metadata;
- normalized success, unsupported, invalid, expired, and retryable outcomes.

The compatibility boundary does not define an endpoint, DTO, persistence model, scanner dependency, native permission, or pairing workflow.

## CCTV UI Boundary

Future clients may render normalized camera information only after an approved backend camera contract exists. The UI-facing shape may eventually include bounded normalized fields already identified by the architecture documents, such as:

- platform camera identity and display name;
- vendor and model as safe presentation metadata;
- online or offline state;
- room or location context;
- bounded camera health information;
- normalized supported capabilities;
- stream availability as a platform decision, not a raw RTSP URL.

The compatibility boundary explicitly forbids clients from receiving or constructing raw RTSP URLs, ONVIF credentials, vendor access tokens, device passwords, MQTT topics, or unrestricted camera payloads.

## Fail-Closed Presentation Rules

Until later implementation checkpoints are separately approved, clients must remain read-only and fail closed:

- no scanner button or camera navigation is activated by this contract;
- no live-view component is introduced;
- no camera-control or PTZ action is exposed;
- no synthetic stream, device, telemetry, or pairing success is displayed;
- unsupported or unavailable future camera data must remain a bounded local state;
- raw backend messages, stack traces, protocol details, credentials, and vendor payloads must not be rendered.

Existing MAP and SWITCH fail-closed behavior remains unchanged.

## Security and Tenant Isolation

Any later barcode or CCTV implementation must preserve the current request boundary:

1. authenticated identity is validated;
2. active tenant context is resolved server-side;
3. resource ownership or membership is verified server-side;
4. adapter or stream decisions are made behind backend boundaries;
5. clients receive only bounded normalized responses.

A scanned code is untrusted input. It must never establish tenant membership, ownership, authorization, or credential access by itself.

## Dependency and Runtime Boundary

This checkpoint adds no runtime dependency and changes no lockfile, application source, backend module, Prisma schema, migration, PostgreSQL behavior, Redis behavior, MQTT behavior, CI workflow, native project, Android permission, iOS permission, or deployment configuration.

The following remain absent and unapproved in this slice:

- Expo camera or barcode-scanner packages;
- React Native camera, video, WebRTC, or RTSP packages;
- browser video-player packages;
- ONVIF or vendor-camera SDKs;
- stream proxy, gateway, transcoder, recorder, or media server;
- camera credential storage;
- barcode persistence;
- camera-specific API routes or database entities.

## Validation Profile

Because this change selects lifecycle metadata and adds a repository contract, the risk-based local gate is:

1. exact branch, HEAD, origin/main, synchronization, and clean-tree verification;
2. changed-file formatting check;
3. focused Module 10 test suite;
4. full Jest regression suite;
5. module lifecycle validation;
6. lifecycle simulation through Module 30;
7. `git diff --check` and exact changed-path audit;
8. one local commit with no push.

`npm ci`, Prisma generation, native build proof, dependency audit repair, and application build are not required because no dependency or runtime implementation changes.

## Explicit Exclusions

This slice does not implement or approve:

- QR or barcode scanning;
- native camera permissions;
- device pairing, activation, provisioning, or ownership mutation;
- camera discovery;
- ONVIF communication;
- RTSP playback or URL exposure;
- HLS, WebRTC, transcoding, recording, or stream proxying;
- vendor camera connectors or cloud integrations;
- camera control, PTZ, audio, alerts, or notifications;
- dashboard mutation, command publication, or realtime delivery;
- Module 11 activation;
- production deployment.

<!-- M10S13-LIFECYCLE-CONTRACT-PREREQUISITE:START -->

## Slice 10.13 Lifecycle Contract Prerequisite

The owner explicitly approved preparation for Module 10 Slice 10.13 after the
repository was verified clean and synchronized at exact remote-green commit
`3a07d9f8c9e40ee135f93a9ffdb1d96c94e285c2`. GitHub Actions run
`30517667137` confirmed 107/107 Jest suites and 755/755 tests. Production
release artifact `8749562325` contained 316 files and its uploaded ZIP had
SHA-256
`cd75fe1829794279593c5d3219a49a94710561a245fbc5492589462d9f1303db`.

The original Slice 10.12 lifecycle selection remains immutably evidenced by
prerequisite commit `f92075d66c5518d4e0f9b9a9dae7a8e092c55c12`, GitHub Actions
run `30361802672`, release artifact `8689205481`, and artifact SHA-256
`eac72d0d858fc664cf9cf825ff2f000a1876cf055a2b01e153f52ee853aebaf3`.

Historical contract tests for Slice 10.12 verify this document-owned immutable
evidence and the compatibility boundaries defined here. They do not freeze the
mutable `projectConfig.development.activeSlice` or current lifecycle evidence,
so a later explicitly approved Module 10 slice can advance without rewriting or
discarding the historical Slice 10.12 proof.

This prerequisite changes this document and its contract test only. It does not
select Slice 10.13 in lifecycle metadata, alter application runtime, add or
upgrade dependencies, change API, schema, Prisma, PostgreSQL, Redis, MQTT, CI,
or deployment behavior, activate Module 11, approve production deployment, or
push a commit. Slice 10.13 lifecycle selection remains a separate bounded step
after this prerequisite commit is confirmed remote-green.
<!-- M10S13-LIFECYCLE-CONTRACT-PREREQUISITE:END -->

## Exit Gate

This documentation and contract-test checkpoint must be committed locally, pushed only after explicit owner approval, and confirmed green by remote CI before any Slice 10.12 runtime implementation or Module 10 completion review is considered.

No later slice, Module 11, or production deployment is activated by this document.

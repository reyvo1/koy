# IoT Platform Safe Workflow Launcher v1

## Purpose

The launcher is a Windows operator interface over the repository's existing Development Kit and Module Execution Kit. It does not introduce another lifecycle engine.

The repository, exact Git commit, official manifests, validation profiles, and Module Execution Kit remain authoritative.

## Safety boundary

Version 1 exposes only bounded operator functions:

1. audit the repository;
2. show the current checkpoint;
3. open mandatory project context;
4. run the official manifest doctor;
5. run non-mutating baseline validation;
6. create a portable local checkpoint through the official handoff generator;
7. open the latest handoff package.

Version 1 intentionally does not expose:

- `module:execute`;
- commit creation;
- push;
- module completion or activation;
- lifecycle mutation;
- production deployment.

A failure stops the selected operation and returns a non-zero exit code. The launcher does not retry with different flags, repair files, or continue to a later gate.

## Windows usage

Open:

`tools/operator-launcher/IoT-Platform-Control-Center.cmd`

Direct buttons are available in the same directory. Every CMD changes to the repository root and uses `npm.cmd`, avoiding PowerShell execution-policy problems.

## Handoff behavior

`Create-Session-Handoff.cmd` calls the official `tools/module-runner/handoff.mjs`. The generated package is deliberately marked `local-unpushed`. The launcher never claims remote-green without exact CI evidence.

Output is written under:

`%USERPROFILE%\Downloads\IoT-Platform-Handoffs`

## Architecture preservation

The launcher does not modify the Module Execution Kit, lifecycle manager, application source, dependencies, schema, CI, Module 11 state, or deployment approval. Future modules continue to use the same sequence:

`READ -> VERIFY -> DEFINE SCOPE -> DOCTOR -> DISPOSABLE WORKTREE -> VALIDATE -> LOCAL COMMIT -> PUSH APPROVAL -> REMOTE CI -> REMOTE-GREEN HANDOFF`

#!/usr/bin/env node

import assert from 'node:assert/strict';
import { summarizeFailureOutput } from './rescue-failure-summary.mjs';

const sample = `
noise before
FAIL test/a.contract.spec.ts
  ● suite A › first invariant
lots of stack detail
FAIL src/device/device.service.spec.ts
  ● DeviceService › rejects cross-tenant access
src/x.ts:12:3 - error TS2345: bad type
FAIL test/a.contract.spec.ts
Test Suites: 2 failed, 178 passed, 180 total
Tests:       3 failed, 1182 passed, 1185 total
Snapshots:   0 total
Time:        140.1 s
noise after
`;

const summary = summarizeFailureOutput(sample);
assert(summary.includes('FAIL test/a.contract.spec.ts'));
assert(summary.includes('FAIL src/device/device.service.spec.ts'));
assert(summary.includes('suite A › first invariant'));
assert(summary.includes('DeviceService › rejects cross-tenant access'));
assert(summary.includes('error TS2345:'));
assert(summary.includes('Test Suites: 2 failed'));
assert(summary.includes('Tests:       3 failed'));
assert.equal(summary.match(/FAIL test\/a\.contract\.spec\.ts/g)?.length, 1);
assert(!summary.includes('lots of stack detail'));
assert(!summary.includes('noise before'));

console.log('PASS  rescue failure summary exposes all failing Jest suite/test headers without dumping low-signal stack noise');
console.log('PASS  rescue failure summary preserves TypeScript diagnostics and aggregate Jest counts');

#!/usr/bin/env node
/**
 * Fail-closed coverage for the production approval GENERATOR.
 *
 * The existing self-test covers receipt VERIFICATION at install time. It does not cover
 * scripts/verify-production-approval.mjs, which is the script that decides whether a release is approved for
 * production at all. That script was referenced only as source text by validate-rescue-baseline.mjs, so its
 * blocking branches were never executed by any test: six fail-closed paths that gate production, none of them
 * proven to fail.
 *
 * What this covers: the branches reachable without physical hardware -- the generator refusing to approve when
 * it is not given evidence, when the evidence does not exist, and when the evidence does not validate against
 * the current sealed source baseline.
 *
 * What this deliberately does NOT cover, and why:
 *
 *  - OTA digest verification PASS. The OTA gate requires a device-observed SHA-256 of real firmware bytes.
 *    A fixture could set status to PASS on paper, but that is exactly the "simulated evidence relabelled as
 *    physical proof" that this project refuses, so it is left for the hardware run rather than faked here.
 *  - Source fingerprint agreement on a fully valid approval. That needs a current automated acceptance report,
 *    which needs the whole rescue runtime up.
 *
 * Those limits are stated rather than papered over. A test that fabricates a device observation to turn a
 * self-test green is worse than an acknowledged gap.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const temp = mkdtempSync(path.join(os.tmpdir(), 'iot-production-approval-gate-'));

function runApproval(args) {
  const result = spawnSync(process.execPath, ['scripts/verify-production-approval.mjs', ...args], {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
  });
  return { status: result.status, output: `${result.stdout ?? ''}${result.stderr ?? ''}` };
}

function expectRejected(label, args, expectedText) {
  const { status, output } = runApproval(args);
  if (status === 0) {
    throw new Error(`${label}: the gate returned success. It must refuse without complete evidence.`);
  }
  if (!output.includes(expectedText)) {
    throw new Error(`${label}: refused, but not for the expected reason.\nExpected: ${expectedText}\nGot: ${output}`);
  }
  console.log(`PASS  ${label}`);
}

try {
  // No evidence argument at all. An approval flow that defaults to approving when given nothing is exactly the
  // failure this project cares about.
  expectRejected('missing evidence is refused', [], 'Production approval requires --evidence=');

  // Evidence path that does not exist. Proves the missing-file path fails rather than falling through.
  expectRejected(
    'a nonexistent evidence file is refused',
    [`--evidence=${path.join(temp, 'absent.json')}`],
    'RESCUE-02B evidence',
  );

  // Evidence that exists but does not satisfy the schema / current baseline. Proves validation runs before
  // anything is approved, and that a malformed file cannot be waved through.
  const malformed = path.join(temp, 'malformed.json');
  writeFileSync(malformed, '{ this is not the evidence schema }\n');
  expectRejected(
    'evidence that fails validation is refused',
    [`--evidence=${malformed}`],
    'RESCUE-02B evidence',
  );

  // A well-formed JSON document that is still not valid evidence. Without this case the previous one would
  // pass merely because the file is unparseable, and the schema-level gate would go unexercised.
  const notEvidence = path.join(temp, 'not-evidence.json');
  writeFileSync(notEvidence, `${JSON.stringify({ note: 'structurally valid JSON, not an evidence document' }, null, 2)}\n`);
  expectRejected(
    'valid JSON that is not evidence is refused',
    [`--evidence=${notEvidence}`],
    'RESCUE-02B evidence',
  );

  console.log('PRODUCTION APPROVAL GENERATOR GATE SELF-TEST PASS');
  console.log(
    'NOTE: OTA digest PASS and full fingerprint agreement are not covered here -- both need a real',
  );
  console.log('      automated acceptance report and, for OTA, device-observed firmware bytes.');
} finally {
  rmSync(temp, { recursive: true, force: true });
}
#!/usr/bin/env node
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const repoRoot = path.resolve(import.meta.dirname, '..');
const verifier = path.join(repoRoot, 'scripts', 'verify-enterprise-wave-status.mjs');
const fixtureRoot = mkdtempSync(path.join(tmpdir(), 'iot-wave-status-self-test-'));
const files = [
  'AGENTS.md', 'CURRENT-STATE.md', 'PROJECT-HANDOFF.md', 'GATE-1-STATUS.md',
  'PASTE-KE-CHAT-BERIKUTNYA.txt', 'docs/project-state.md', 'docs/roadmap.md',
  'docs/SESSION-CHECKPOINT.md', 'AI-Development-Kit/03-Development-Roadmap.md', 'chat-session.md',
];

function ensureParent(rel) { mkdirSync(path.dirname(path.join(fixtureRoot, rel)), { recursive: true }); }
function run() { return spawnSync(process.execPath, [verifier, '--root', fixtureRoot], { encoding: 'utf8' }); }
function expect(condition, message) { if (!condition) throw new Error(message); }
function writeCurrent(marker, sentence) {
  for (const rel of files) {
    ensureParent(rel);
    writeFileSync(path.join(fixtureRoot, rel), `# Current\n\n${marker}\n\n${sentence}\n`);
  }
}

try {
  ensureParent('docs/ENTERPRISE-WAVE-ROADMAP.md');
  const terminalMarker = '<!-- ENTERPRISE-WAVE-SYNC: authority=docs/ENTERPRISE-WAVE-ROADMAP.md; software-closed=1-13; active=none -->';
  writeFileSync(path.join(fixtureRoot, 'docs/ENTERPRISE-WAVE-ROADMAP.md'), `# Roadmap\n\n## Current gate\n\n- Waves 1–13: **SOFTWARE SCOPE CLOSED / GREEN**.\n\n## Production boundary\nExternal evidence remains separate.\n`);
  writeCurrent(terminalMarker, 'Waves 1–13 are SOFTWARE SCOPE CLOSED / GREEN; external evidence remains separate.');
  let result = run();
  expect(result.status === 0, `terminal all-green fixture should pass: ${result.stderr}`);
  console.log('PASS  terminal all-green roadmap with active=none is accepted');

  const driftFile = path.join(fixtureRoot, 'PROJECT-HANDOFF.md');
  writeFileSync(driftFile, readFileSync(driftFile, 'utf8').replace('active=none', 'active=13'));
  result = run();
  expect(result.status !== 0 && /PROJECT-HANDOFF\.md/.test(result.stderr), 'drifted terminal marker must fail closed');
  console.log('PASS  stale terminal handoff marker is rejected');

  writeFileSync(path.join(fixtureRoot, 'docs/ENTERPRISE-WAVE-ROADMAP.md'), `# Roadmap\n\n## Current gate\n\n- Waves 1–12: **CLOSED / GREEN**.\n- Wave 13: **IN PROGRESS**.\n`);
  const activeMarker = '<!-- ENTERPRISE-WAVE-SYNC: authority=docs/ENTERPRISE-WAVE-ROADMAP.md; software-closed=1-12; active=13 -->';
  writeCurrent(activeMarker, 'Wave 13 is IN PROGRESS; Waves 1–12 are CLOSED / GREEN.');
  result = run();
  expect(result.status === 0, `single-active fixture should remain supported: ${result.stderr}`);
  console.log('PASS  single active wave remains supported');

  writeFileSync(path.join(fixtureRoot, 'docs/ENTERPRISE-WAVE-ROADMAP.md'), `# Roadmap\n\n## Current gate\n\n- Waves 1–11: **CLOSED / GREEN**.\n- Wave 12: **ACTIVE**.\n- Wave 13: **IN PROGRESS**.\n`);
  result = run();
  expect(result.status !== 0 && /at most one active\/in-progress wave/.test(result.stderr), 'ambiguous active waves must fail closed');
  console.log('PASS  ambiguous roadmap active state is rejected');

  console.log('ENTERPRISE WAVE STATUS SELF-TEST PASS');
} finally {
  rmSync(fixtureRoot, { recursive: true, force: true });
}

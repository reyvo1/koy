#!/usr/bin/env node
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const repoRoot = path.resolve(import.meta.dirname, '..');
const verifier = path.join(repoRoot, 'scripts', 'verify-enterprise-wave-status.mjs');
const fixtureRoot = mkdtempSync(path.join(tmpdir(), 'iot-wave-status-self-test-'));
const files = [
  'AGENTS.md',
  'CURRENT-STATE.md',
  'PROJECT-HANDOFF.md',
  'GATE-1-STATUS.md',
  'PASTE-KE-CHAT-BERIKUTNYA.txt',
  'docs/project-state.md',
  'docs/roadmap.md',
  'docs/SESSION-CHECKPOINT.md',
  'AI-Development-Kit/03-Development-Roadmap.md',
  'chat-session.md',
];
const marker = '<!-- ENTERPRISE-WAVE-SYNC: authority=docs/ENTERPRISE-WAVE-ROADMAP.md; software-closed=1-12; active=13 -->';

function ensureParent(rel) {
  mkdirSync(path.dirname(path.join(fixtureRoot, rel)), { recursive: true });
}
function run() {
  return spawnSync(process.execPath, [verifier, '--root', fixtureRoot], { encoding: 'utf8' });
}
function expect(condition, message) {
  if (!condition) throw new Error(message);
}

try {
  ensureParent('docs/ENTERPRISE-WAVE-ROADMAP.md');
  writeFileSync(path.join(fixtureRoot, 'docs/ENTERPRISE-WAVE-ROADMAP.md'), `# Roadmap\n\n## Current gate\n\n- Wave 1: **CLOSED / GREEN**.\n- Wave 2: **CLOSED / GREEN**.\n- Wave 3: **CLOSED / GREEN**.\n- Waves 4–11: **SOFTWARE SCOPE CLOSED / GREEN**.\n- Wave 12: **CLOSED / GREEN**.\n- Wave 13: **IN PROGRESS, software deliverables only**.\n\n## Production boundary\nNot approved.\n`);
  for (const rel of files) {
    ensureParent(rel);
    writeFileSync(path.join(fixtureRoot, rel), `# Current\n\n${marker}\n\nWave 13 is **IN PROGRESS, software deliverables only**.\nProduction is NOT APPROVED.\n`);
  }

  let result = run();
  expect(result.status === 0, `valid fixture should pass: ${result.stderr || result.stdout}`);
  console.log('PASS  valid synchronized status fixture');

  // Regression for GitHub run f4ed5cd: chat-session notes may be prepended above the marker. The
  // verifier must follow the current-authority boundary, not a fixed line count.
  const sessionFile = path.join(fixtureRoot, 'chat-session.md');
  const sessionBody = readFileSync(sessionFile, 'utf8');
  writeFileSync(sessionFile, `${'# Current session note\n\n' + 'detail line\n'.repeat(20)}${sessionBody}`);
  result = run();
  expect(result.status === 0, `prepended current notes should not break sync: ${result.stderr || result.stdout}`);
  console.log('PASS  prepended session notes do not create a false status drift');
  writeFileSync(sessionFile, sessionBody);

  writeFileSync(sessionFile, `# New current session without a marker\n\nWave 13 is IN PROGRESS.\n\n--- HISTORICAL CHAT SESSION CHRONOLOGY BELOW ---\n\n${sessionBody}`);
  result = run();
  expect(result.status !== 0 && /chat-session\.md/.test(result.stderr), 'historical-only marker must fail closed');
  console.log('PASS  marker below historical chronology is rejected');
  writeFileSync(sessionFile, sessionBody);

  const driftFile = path.join(fixtureRoot, 'PROJECT-HANDOFF.md');
  writeFileSync(driftFile, readFileSync(driftFile, 'utf8').replace('active=13', 'active=3'));
  result = run();
  expect(result.status !== 0 && /PROJECT-HANDOFF\.md/.test(result.stderr), 'drifted marker must fail closed');
  console.log('PASS  stale handoff marker is rejected');
  writeFileSync(driftFile, readFileSync(driftFile, 'utf8').replace('active=3', 'active=13'));

  const roadmapFile = path.join(fixtureRoot, 'docs/ENTERPRISE-WAVE-ROADMAP.md');
  writeFileSync(roadmapFile, readFileSync(roadmapFile, 'utf8').replace('- Wave 12: **CLOSED / GREEN**.', '- Wave 12: **ACTIVE**.'));
  result = run();
  expect(result.status !== 0 && /exactly one active\/in-progress wave/.test(result.stderr), 'ambiguous current wave must fail closed');
  console.log('PASS  ambiguous roadmap active state is rejected');

  console.log('ENTERPRISE WAVE STATUS SELF-TEST PASS');
} finally {
  rmSync(fixtureRoot, { recursive: true, force: true });
}

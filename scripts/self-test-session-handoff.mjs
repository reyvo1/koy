#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const read = (rel) => readFileSync(path.join(root, rel), 'utf8');
const required = [
  'docs/SESSION-HANDOFF-PROTOCOL.md',
  'AGENTS.md',
  'PASTE-KE-CHAT-BERIKUTNYA.txt',
  'PROJECT-HANDOFF.md',
  'CURRENT-STATE.md',
  'docs/SESSION-CHECKPOINT.md',
  'chat-session.md',
  'AI-Development-Kit/prompts/98-RESUME-AFTER-NEW-SESSION.md',
  'AI-Development-Kit/workflows/AGENT-EXECUTION-LOOP.md',
];

function assert(condition, message) {
  if (!condition) throw new Error(`FAIL  ${message}`);
  console.log(`PASS  ${message}`);
}

for (const rel of required) assert(existsSync(path.join(root, rel)), `session handoff source exists: ${rel}`);

const protocol = read('docs/SESSION-HANDOFF-PROTOCOL.md');
const agents = read('AGENTS.md').split('---')[0];
const paste = read('PASTE-KE-CHAT-BERIKUTNYA.txt').split('--- HISTORICAL CONTINUATION BELOW ---')[0];
const handoff = read('PROJECT-HANDOFF.md').split('--- HISTORICAL WAVE 3 HANDOFF BELOW ---')[0];
const checkpoint = read('docs/SESSION-CHECKPOINT.md').split('--- HISTORICAL CHECKPOINT CHRONOLOGY BELOW ---')[0];
const chat = read('chat-session.md').split('--- HISTORICAL CHAT SESSION CHRONOLOGY BELOW ---')[0];
const resume = read('AI-Development-Kit/prompts/98-RESUME-AFTER-NEW-SESSION.md');
const loop = read('AI-Development-Kit/workflows/AGENT-EXECUTION-LOOP.md');
const pkg = JSON.parse(read('package.json'));

assert(protocol.includes('first failing gate') || protocol.includes('FIRST FAILING GATE'), 'handoff protocol resumes from the first failing gate instead of auditing from zero');
assert(protocol.includes('git rev-parse HEAD') && protocol.includes('git status --short'), 'handoff protocol requires real checkout verification');
assert(protocol.includes('SIMULATED_HARDWARE_LIVE_SERVICE') && protocol.includes('does **not** block software progress'), 'handoff protocol makes physical hardware non-blocking while preserving evidence labels');
assert(agents.includes('SESSION-HANDOFF-PROTOCOL.md') && agents.includes('first failing gate'), 'AGENTS current override forces session-resume continuity before mutations');
assert(['PASTE-KE-CHAT-BERIKUTNYA.txt', 'PROJECT-HANDOFF.md', 'docs/SESSION-CHECKPOINT.md', 'chat-session.md'].every((name) => protocol.includes(`\`${name}\``)), 'handoff protocol names every current continuation artifact');

for (const [name, text] of [
  ['next-chat handoff', paste],
  ['project handoff', handoff],
  ['session checkpoint', checkpoint],
  ['chat session', chat],
]) {
  assert(text.includes('ENTERPRISE-WAVE-SYNC') || name === 'chat session', `${name} retains the current authority block`);
  assert(text.includes('SIMULATED_HARDWARE_LIVE_SERVICE') || text.includes('SIMULATED-HARDWARE / LIVE-SERVICE'), `${name} preserves the simulated-hardware evidence policy`);
}

assert(paste.includes('FIRST FAILING GATE') && paste.includes('git rev-parse HEAD') && paste.includes('git status --short'), 'next-chat handoff contains the exact resume discipline');
assert(chat.includes('## Next action'), 'current chat-session block records an exact next action');
assert(checkpoint.includes('Next action'), 'session checkpoint records the current next action');
assert(!resume.includes('Pesan pertama wajib AUDIT ONLY'), 'new-session prompt no longer forces a from-zero audit');
assert(resume.includes('docs/SESSION-HANDOFF-PROTOCOL.md') && resume.includes('first failing gate'), 'new-session prompt is bound to the handoff protocol and last failure');
assert(loop.includes('RESUME CHECKPOINT') && loop.includes('FIRST FAILING GATE') && loop.includes('ONE COMMIT/PUSH'), 'agent execution loop matches the one-batch resume workflow');
assert(pkg.scripts?.['session:handoff:self-test'] === 'node scripts/self-test-session-handoff.mjs', 'session handoff self-test is package-exposed');

console.log('SESSION HANDOFF SELF-TEST PASS');

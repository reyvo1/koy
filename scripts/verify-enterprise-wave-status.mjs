#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const argRootIndex = process.argv.indexOf('--root');
const root = path.resolve(argRootIndex >= 0 ? process.argv[argRootIndex + 1] : path.resolve(import.meta.dirname, '..'));
const roadmapRel = 'docs/ENTERPRISE-WAVE-ROADMAP.md';
const synchronizedFiles = [
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

function fail(message) {
  throw new Error(message);
}

function read(rel) {
  const file = path.join(root, rel);
  if (!existsSync(file)) fail(`required file missing: ${rel}`);
  return readFileSync(file, 'utf8');
}

function currentGateSection(markdown) {
  const start = markdown.indexOf('## Current gate');
  if (start < 0) fail(`${roadmapRel} is missing "## Current gate"`);
  const tail = markdown.slice(start + '## Current gate'.length);
  const nextHeading = tail.search(/\n##\s+/);
  return nextHeading >= 0 ? tail.slice(0, nextHeading) : tail;
}

function expandWaveState(section) {
  const states = new Map();
  for (const line of section.split(/\r?\n/)) {
    let match = /^- Wave (\d+): \*\*([^*]+)\*\*/.exec(line.trim());
    if (match) {
      states.set(Number(match[1]), match[2].trim());
      continue;
    }
    match = /^- Waves (\d+)[–-](\d+): \*\*([^*]+)\*\*/.exec(line.trim());
    if (match) {
      const start = Number(match[1]);
      const end = Number(match[2]);
      if (end < start) fail(`invalid wave range ${start}-${end}`);
      for (let wave = start; wave <= end; wave += 1) states.set(wave, match[3].trim());
    }
  }
  for (let wave = 1; wave <= 13; wave += 1) {
    if (!states.has(wave)) fail(`${roadmapRel} current gate has no status for Wave ${wave}`);
  }
  return states;
}

function compactRanges(values) {
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 0) return 'none';
  const ranges = [];
  let start = sorted[0];
  let previous = sorted[0];
  for (const value of sorted.slice(1)) {
    if (value === previous + 1) {
      previous = value;
      continue;
    }
    ranges.push(start === previous ? `${start}` : `${start}-${previous}`);
    start = value;
    previous = value;
  }
  ranges.push(start === previous ? `${start}` : `${start}-${previous}`);
  return ranges.join(',');
}

const roadmap = read(roadmapRel);
const states = expandWaveState(currentGateSection(roadmap));
const active = [...states.entries()].filter(([, status]) => /\b(?:ACTIVE|IN PROGRESS)\b/i.test(status));
if (active.length !== 1) fail(`expected exactly one active/in-progress wave, found ${active.length}`);
const [activeWave, activeStatus] = active[0];
const softwareClosed = [...states.entries()]
  .filter(([, status]) => /CLOSED/i.test(status) && /GREEN/i.test(status))
  .map(([wave]) => wave);

const expectedMarker = `<!-- ENTERPRISE-WAVE-SYNC: authority=${roadmapRel}; software-closed=${compactRanges(softwareClosed)}; active=${activeWave} -->`;
const staleTopPatterns = [
  /Wave 3[^\n]{0,100}\bACTIVE\b/i,
  /Wave 4[^\n]{0,100}\bBLOCKED\b/i,
  /Wave 4[–-]13[^\n]{0,100}\bBELUM\b/i,
  /Wave 4[^\n]{0,100}belum dimulai/i,
];

for (const rel of synchronizedFiles) {
  const text = read(rel);
  const markerCount = text.split(expectedMarker).length - 1;
  if (markerCount !== 1) {
    fail(`${rel} must contain exactly one current marker: ${expectedMarker}`);
  }
  const top = text.split(/\r?\n/).slice(0, 12).join('\n');
  if (!new RegExp(`Wave ${activeWave}[^\\n]{0,120}(IN PROGRESS|ACTIVE)`, 'i').test(top)) {
    fail(`${rel} top block does not identify Wave ${activeWave} as current (${activeStatus})`);
  }
  for (const pattern of staleTopPatterns) {
    if (pattern.test(top)) fail(`${rel} top block contains superseded active-wave language: ${pattern}`);
  }
}

console.log(`PASS  roadmap current gate parsed: Wave ${activeWave} = ${activeStatus}`);
console.log(`PASS  software-closed wave set: ${compactRanges(softwareClosed)}`);
console.log(`PASS  synchronized current-state documents: ${synchronizedFiles.length}/${synchronizedFiles.length}`);
console.log('ENTERPRISE WAVE STATUS SYNC PASS');

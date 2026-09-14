#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
const getArg = (name) => argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3);
const fileArg = getArg('file');
const sectionName = getArg('section');
const checkId = getArg('check');
const artifactArg = getArg('artifact');
const note = getArg('note');

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

if (!fileArg || !sectionName || !checkId || !artifactArg || !note) {
  fail('Usage: --file=<evidence.json> --section=<runtimeFlow|liveBroker|physicalEsp32> --check=<id> --artifact=<path> --note=<what this artifact proves>');
}
if (!['runtimeFlow', 'liveBroker', 'physicalEsp32'].includes(sectionName)) {
  fail(`Unsupported section: ${sectionName}`);
}
if (note.trim().length < 8) fail('--note must contain a concrete description.');

const evidencePath = path.resolve(fileArg);
const artifactPath = path.resolve(artifactArg);
if (!existsSync(evidencePath)) fail(`Evidence file not found: ${evidencePath}`);
if (!existsSync(artifactPath) || !statSync(artifactPath).isFile()) fail(`Artifact file not found: ${artifactPath}`);

let evidence;
try {
  evidence = JSON.parse(readFileSync(evidencePath, 'utf8'));
} catch (error) {
  fail(`Evidence file is not valid JSON: ${error.message}`);
}
if (evidence.schemaVersion !== 2 || evidence.gate !== 'RESCUE-02B') {
  fail('Evidence file must be RESCUE-02B schemaVersion=2.');
}
const section = evidence[sectionName];
if (!section || !Array.isArray(section.checks)) fail(`Evidence section is missing: ${sectionName}`);
const row = section.checks.find((item) => item?.id === checkId);
if (!row) fail(`Unknown check id ${sectionName}.${checkId}.`);

const digest = createHash('sha256').update(readFileSync(artifactPath)).digest('hex');
const relative = path.relative(path.dirname(evidencePath), artifactPath) || path.basename(artifactPath);
row.status = 'PASS';
row.evidence = {
  artifactPath: relative,
  artifactSha256: digest,
  note: note.trim(),
};
section.executedAt = new Date().toISOString();
writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
console.log(`ATTACHED  ${sectionName}.${checkId}`);
console.log(`ARTIFACT  ${relative}`);
console.log(`SHA256    ${digest}`);

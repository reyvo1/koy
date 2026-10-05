#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const workflow = readFileSync(path.join(root, '.github/workflows/ci.yml'), 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(`FAIL  ${message}`);
  console.log(`PASS  ${message}`);
}

const required = [
  'actions/checkout@v7',
  'actions/setup-node@v7',
  'actions/cache@v5',
  'actions/upload-artifact@v7',
  'actions/download-artifact@v7',
];
for (const action of required) {
  assert(workflow.includes(action), `core GitHub Action is pinned to the reviewed Node 24 generation: ${action}`);
}
for (const deprecated of [
  'actions/checkout@v4',
  'actions/setup-node@v4',
  'actions/cache@v4',
  'actions/upload-artifact@v4',
  'actions/download-artifact@v4',
]) {
  assert(!workflow.includes(deprecated), `deprecated Node 20 action pin is absent: ${deprecated}`);
}
console.log('GITHUB ACTIONS RUNTIME SELF-TEST PASS');

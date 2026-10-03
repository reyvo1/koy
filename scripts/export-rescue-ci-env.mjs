#!/usr/bin/env node
import { appendFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { parseEnv } from './manage-rescue-local-runtime.mjs';

const envArg = process.argv.find((value) => value.startsWith('--env='));
const envFile = path.resolve(envArg ? envArg.slice('--env='.length) : '.env');
const githubEnv = process.env.GITHUB_ENV;
if (!existsSync(envFile)) throw new Error(`Environment file not found: ${envFile}`);
if (!githubEnv) throw new Error('GITHUB_ENV is not set; this exporter is for GitHub Actions only');
const parsed = parseEnv(envFile);
const port = String(parsed.PORT ?? '').trim();
if (!/^\d+$/.test(port)) throw new Error('Generated rescue env has no valid PORT');
for (const key of ['DATABASE_URL', 'TEST_DATABASE_URL']) {
  if (!parsed[key]) throw new Error(`Generated rescue env is missing ${key}`);
}
const apiBase = `http://127.0.0.1:${port}`;
const exported = {
  DATABASE_URL: parsed.DATABASE_URL,
  TEST_DATABASE_URL: parsed.TEST_DATABASE_URL,
  IOT_API: apiBase,
  PROBE_BASE: apiBase,
  PROBE_API_BASE: apiBase,
};
for (const [key, value] of Object.entries(exported)) {
  if (String(value).includes('\n')) throw new Error(`Refusing multiline value for ${key}`);
  appendFileSync(githubEnv, `${key}=${value}\n`, 'utf8');
}
console.log(`PASS  Exported rescue CI runtime keys (${Object.keys(exported).join(', ')}) without printing secret values`);

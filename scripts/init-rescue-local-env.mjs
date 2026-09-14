#!/usr/bin/env node

import { randomBytes } from 'node:crypto';
import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const force = args.includes('--force');
const outputArg = args.find((value) => value.startsWith('--output='));
const templateArg = args.find((value) => value.startsWith('--template='));
const outputPath = path.resolve(outputArg ? outputArg.slice('--output='.length) : '.env');
const templatePath = path.resolve(
  templateArg ? templateArg.slice('--template='.length) : 'ops/env/rescue-local.env.example',
);

function fail(message) {
  console.error(`FAIL  ${message}`);
  process.exit(1);
}

function secret(bytes = 32) {
  return randomBytes(bytes).toString('hex');
}

if (!existsSync(templatePath)) {
  fail(`Template not found: ${templatePath}`);
}
if (existsSync(outputPath) && !force) {
  fail(`Refusing to overwrite existing environment file: ${outputPath}. Use --force only when rotation is intentional.`);
}

let content = readFileSync(templatePath, 'utf8');
const postgresPassword = secret(24);
const replacements = new Map([
  ['POSTGRES_PASSWORD', postgresPassword],
  ['DATABASE_URL', `postgresql://iot:${postgresPassword}@127.0.0.1:5432/iot`],
  ['TEST_DATABASE_URL', `postgresql://iot:${postgresPassword}@127.0.0.1:5432/iot`],
  ['MQTT_PASSWORD', secret()],
  ['MQTT_WEBHOOK_SECRET', secret()],
  ['JWT_SECRET', secret()],
  ['METRICS_ACCESS_TOKEN', secret()],
  ['EMQX_DASHBOARD_PASSWORD', secret()],
]);

for (const [key, value] of replacements) {
  const pattern = new RegExp(`^${key}=.*$`, 'm');
  if (!pattern.test(content)) {
    fail(`Template is missing required key ${key}`);
  }
  content = content.replace(pattern, `${key}=${value}`);
}

const unresolvedAssignments = content
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter((line) => line && !line.startsWith('#') && line.includes('='))
  .filter((line) => /REPLACE_WITH_|change_me/i.test(line.slice(line.indexOf('=') + 1)));
if (unresolvedAssignments.length > 0) {
  fail(`Template still contains unresolved placeholder assignments: ${unresolvedAssignments.map((line) => line.slice(0, line.indexOf('='))).join(', ')}`);
}

writeFileSync(outputPath, content, { encoding: 'utf8', mode: 0o600 });
try {
  chmodSync(outputPath, 0o600);
} catch {
  // Filesystems such as Windows may not expose POSIX mode bits. The file stays gitignored.
}

console.log(`PASS  Wrote local rescue environment to ${outputPath}`);
console.log('PASS  Generated local secrets were not printed. Keep this file uncommitted and do not reuse it for production.');
console.log('NEXT  Install dependencies, then run rescue:bootstrap:doctor and the local/external runtime bring-up sequence from the runbook.');

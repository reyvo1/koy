#!/usr/bin/env node

import { readFileSync } from 'node:fs';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const jestConfig = readFileSync('jest.config.js', 'utf8');
const jestTsconfig = JSON.parse(readFileSync('tsconfig.jest.json', 'utf8'));
const automationPolicy = readFileSync('src/automation/automation-runtime-policy.ts', 'utf8');

const roots = jestConfig.match(/roots:\s*\[([^\]]+)\]/s)?.[1] ?? '';
assert(roots.includes("'<rootDir>/src'"), 'Jest root must include backend src');
assert(roots.includes("'<rootDir>/test'"), 'Jest root must include backend tests');
assert(roots.includes("'<rootDir>/apps/user-mobile/src'"), 'Jest root must include canonical mobile unit tests');
assert(!roots.includes('admin-web'), 'Jest root must not include Admin Web');
assert(!roots.includes('user-web'), 'Jest root must not include User Web');
assert(jestConfig.includes("tsconfig: 'tsconfig.jest.json'"), 'ts-jest must use the isolated Jest tsconfig');

const includes = jestTsconfig.include ?? [];
const excludes = jestTsconfig.exclude ?? [];
assert(includes.some((value) => value.startsWith('src/')), 'Jest tsconfig must include backend src');
assert(includes.some((value) => value.startsWith('test/')), 'Jest tsconfig must include backend specs');
assert(includes.some((value) => value.startsWith('apps/user-mobile/')), 'Jest tsconfig must include mobile unit-test source');
assert(!includes.some((value) => value.startsWith('apps/admin-web/')), 'Jest tsconfig must not include Admin Web');
assert(!includes.some((value) => value.startsWith('apps/user-web/')), 'Jest tsconfig must not include User Web');
assert(excludes.includes('apps/admin-web/**'), 'Jest tsconfig must explicitly exclude Admin Web');
assert(excludes.includes('apps/user-web/**'), 'Jest tsconfig must explicitly exclude User Web');
assert((jestTsconfig.compilerOptions?.types ?? []).join(',') === 'node,jest', 'Jest tsconfig must pin global type packages to node + jest');

assert(!automationPolicy.includes('env: NodeJS.ProcessEnv'), 'automation runtime policy must not expose ambient ProcessEnv as its injectable contract');
assert(automationPolicy.includes('Readonly<Record<string, string | undefined>>'), 'automation runtime policy must use an ambient-framework-neutral environment record');

console.log('PASS  root Jest execution scope excludes Next.js web workspaces while retaining backend/test/mobile unit roots');
console.log('PASS  ts-jest uses a dedicated compiler boundary with only node + jest globals');
console.log('PASS  automation runtime policy injection is independent of framework augmentation of NodeJS.ProcessEnv');

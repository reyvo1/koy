#!/usr/bin/env node
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve, relative, sep } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const srcRoot = resolve(root, 'src');
const ignoredDirs = new Set(['node_modules', '.git', 'dist', 'coverage', '.next']);
const forbidden = [
  ['request.routerPath', 'request.routeOptions.url'],
  ['request.routerMethod', 'request.routeOptions.method'],
  ['request.routeSchema', 'request.routeOptions.schema'],
  ['request.routeConfig', 'request.routeOptions.config'],
  ['request.context', 'request.routeOptions'],
  ['reply.context', 'reply.routeOptions'],
  ['request.connection', 'request.socket'],
  ['reply.getResponseTime(', 'reply.elapsedTime'],
  ['reply.sent =', 'reply.hijack()'],
];

const findings = [];

function isExecutableSource(path) {
  if (!/\.(ts|tsx|js|mjs|cjs)$/.test(path)) return false;
  return !/\.(spec|test)\.(ts|tsx|js|mjs|cjs)$/.test(path);
}

function walk(path) {
  for (const entry of readdirSync(path)) {
    if (ignoredDirs.has(entry)) continue;
    const full = resolve(path, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      walk(full);
      continue;
    }
    if (!isExecutableSource(full)) continue;

    const source = readFileSync(full, 'utf8');
    for (const [token, replacement] of forbidden) {
      if (!source.includes(token)) continue;
      for (const [index, line] of source.split(/\r?\n/).entries()) {
        if (line.includes(token)) {
          findings.push({
            file: relative(root, full).split(sep).join('/'),
            line: index + 1,
            token,
            replacement,
          });
        }
      }
    }
  }
}

walk(srcRoot);

if (findings.length) {
  for (const finding of findings) {
    console.error(
      `FAIL  ${finding.file}:${finding.line} uses removed Fastify v4 API ${finding.token}; use ${finding.replacement}`,
    );
  }
  process.exit(1);
}

console.log('PASS  no removed Fastify v4 request/reply APIs remain in executable source');

#!/usr/bin/env node
import { access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import process from 'node:process';
import { runChecked } from './lib/process.mjs';

const root = process.cwd();

export function selectChangedTypeScriptPaths(paths) {
  return paths.filter((path) => /\.tsx?$/.test(path));
}

export async function checkChangedTypeScriptFormat(paths) {
  const typescriptPaths = selectChangedTypeScriptPaths(paths);
  if (typescriptPaths.length === 0) {
    console.log('No changed TypeScript files require formatting validation.');
    return;
  }

  const prettierCli = resolve(
    root,
    'node_modules',
    'prettier',
    'bin',
    'prettier.cjs',
  );
  await access(prettierCli);
  await runChecked(
    process.execPath,
    [prettierCli, '--check', ...typescriptPaths],
    {
      cwd: root,
      timeoutMs: 300_000,
      heartbeatMs: 30_000,
      stream: true,
    },
  );
}

async function main() {
  await checkChangedTypeScriptFormat(process.argv.slice(2));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.stack ?? error.message);
    if (error.result?.stdout) console.error(error.result.stdout);
    if (error.result?.stderr) console.error(error.result.stderr);
    process.exitCode = 1;
  });
}

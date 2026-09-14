#!/usr/bin/env node
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import process from 'node:process';
import { parseArguments, optionalString } from './lib/arguments.mjs';
import { assertClean, assertGitRepository } from './lib/git.mjs';
import { createPortableHandoff } from './lib/handoff-core.mjs';

async function main() {
  const { options } = parseArguments(process.argv.slice(2));
  const repositoryRoot = resolve(
    optionalString(options, 'repo', process.cwd()),
  );
  const outputDirectory = resolve(
    optionalString(options, 'output', resolve(repositoryRoot, '..')),
  );
  const status = optionalString(options, 'status', 'local-unpushed');

  if (!['local-unpushed', 'remote-green'].includes(status)) {
    throw new Error('--status must be local-unpushed or remote-green.');
  }

  await assertGitRepository(repositoryRoot);
  await assertClean(repositoryRoot);

  const result = await createPortableHandoff({
    repositoryRoot,
    outputDirectory,
    status,
    reportPath: optionalString(options, 'report'),
    validationLogPath: optionalString(options, 'validation-log'),
    ciLogPath: optionalString(options, 'ci-log'),
    ciRunId: optionalString(options, 'ci-run-id'),
  });

  console.log(`Handoff: ${result.handoffPath}`);
  console.log(`SHA-256: ${result.handoffSha}`);
  console.log(`SHA file: ${result.shaPath}`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.stack ?? error.message);
    process.exitCode = 1;
  });
}

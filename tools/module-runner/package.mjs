#!/usr/bin/env node
import { readdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import process from 'node:process';
import {
  optionalString,
  parseArguments,
  requireOption,
} from './lib/arguments.mjs';
import { executeSlice } from './execute.mjs';
import { cleanupWorkspace, createWorkspace } from './lib/workspace.mjs';
import { loadManifest, resolvePayloadPath } from './lib/manifest.mjs';
import { extractZip } from './lib/zip.mjs';

export async function executePackage({
  repositoryRoot,
  archivePath,
  outputDirectory,
  workRoot,
}) {
  const repo = resolve(repositoryRoot);
  const archive = resolve(archivePath);
  const extraction = await createWorkspace({
    repositoryRoot: repo,
    requestedRoot: workRoot,
  });
  const extractedRoot = resolve(extraction.temporaryRoot, 'p');

  let workspaceTransferred = false;
  try {
    await extractZip(archive, extractedRoot);
    const manifests = await findFiles(extractedRoot, (name) =>
      name.endsWith('.manifest.json'),
    );
    if (manifests.length !== 1) {
      throw new Error(
        `Expected exactly one slice manifest in package. Found ${manifests.length}.`,
      );
    }
    const manifestPath = manifests[0];
    const manifestInfo = await loadManifest(manifestPath);
    const payloadPath = resolvePayloadPath(manifestInfo);
    if (resolve(payloadPath) !== resolve(dirname(manifestPath), 'payload')) {
      throw new Error(
        `Package payload must resolve to the payload directory beside its manifest: ${payloadPath}`,
      );
    }

    workspaceTransferred = true;
    return await executeSlice({
      repositoryRoot: repo,
      manifestPath,
      payloadPath,
      outputDirectory,
      workRoot: extraction.root,
      workspace: extraction,
    });
  } finally {
    if (!workspaceTransferred) {
      await cleanupWorkspace(extraction);
    }
  }
}

async function findFiles(directory, predicate) {
  const entries = await readdir(directory, { withFileTypes: true });
  const matches = [];
  for (const entry of entries) {
    const path = resolve(directory, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error(`Package symlink is not allowed: ${path}`);
    }
    if (entry.isDirectory()) {
      matches.push(...(await findFiles(path, predicate)));
    } else if (entry.isFile() && predicate(entry.name)) {
      matches.push(path);
    }
  }
  return matches.sort();
}

async function main() {
  const { options } = parseArguments(process.argv.slice(2));
  const result = await executePackage({
    repositoryRoot: optionalString(options, 'repo', process.cwd()),
    archivePath: requireOption(options, 'archive'),
    outputDirectory: optionalString(options, 'output'),
    workRoot: optionalString(options, 'work-root'),
  });

  console.log();
  console.log('PACKAGE EXECUTION VERIFIED');
  console.log(`HEAD: ${result.provenCommit}`);
  console.log(`Snapshot: ${result.snapshotPath}`);
  console.log(`Report: ${result.reportPath}`);
  console.log(`Validation log: ${result.logPath}`);
  console.log(`Handoff: ${result.handoffPath}`);
  console.log(`Handoff SHA: ${result.shaPath}`);
  console.log('Push performed: no');
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.stack ?? error.message);
    if (error.result && !error.result.streamed) {
      if (error.result.stdout) console.error(error.result.stdout);
      if (error.result.stderr) console.error(error.result.stderr);
    }
    if (error.failureOutputs) {
      console.error(`Failure report: ${error.failureOutputs.reportPath}`);
      console.error(`Failure log: ${error.failureOutputs.logPath}`);
    }
    process.exitCode = 1;
  });
}

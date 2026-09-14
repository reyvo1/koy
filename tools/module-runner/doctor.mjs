#!/usr/bin/env node
import { access, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import process from 'node:process';
import { parseArguments, optionalString } from './lib/arguments.mjs';
import {
  assertClean,
  assertGitRepository,
  currentBranch,
  fetchRemote,
  gitResult,
  gitText,
  headSha,
  trackedFileCount,
} from './lib/git.mjs';
import { loadManifest } from './lib/manifest.mjs';
import { runChecked } from './lib/process.mjs';
import { selectWorkspaceRoot } from './lib/workspace.mjs';

export async function runDoctor({
  repositoryRoot,
  manifestPath = null,
  fetch = true,
  workRoot = null,
}) {
  const repo = resolve(repositoryRoot);
  await assertGitRepository(repo);

  for (const path of [
    'package.json',
    'package-lock.json',
    'project-config.json',
    'AI-Development-Kit/bootstrap/PROJECT-BOOTSTRAP-v1.0.md',
    'AI-Development-Kit/architecture/SYSTEM.md',
    'AI-Development-Kit/agent/REPOSITORY-MEMORY.md',
    'scripts/manage-module-state.mjs',
    '.prettierrc',
    '.eslintrc.cjs',
    '.gitattributes',
    '.editorconfig',
  ]) {
    await access(resolve(repo, path), constants.R_OK);
  }

  const expectedNode = (await readFile(resolve(repo, '.nvmrc'), 'utf8')).trim();
  if (process.version.slice(1) !== expectedNode) {
    throw new Error(
      `Node runtime mismatch. Expected ${expectedNode}, actual ${process.version.slice(1)}.`,
    );
  }

  const npm = await runChecked('npm', ['--version'], {
    cwd: repo,
    timeoutMs: 30_000,
  });
  const gitVersion = await runChecked('git', ['--version'], {
    cwd: repo,
    timeoutMs: 30_000,
  });
  const gitUserName = await gitText(repo, ['config', '--get', 'user.name']);
  const gitUserEmail = await gitText(repo, ['config', '--get', 'user.email']);
  if (!gitUserName || !gitUserEmail) {
    throw new Error('Git user.name and user.email must be configured.');
  }
  const packageJson = JSON.parse(
    await readFile(resolve(repo, 'package.json'), 'utf8'),
  );
  if (npm.stdout.trim() !== packageJson.packageManager.replace('npm@', '')) {
    throw new Error(
      `npm runtime mismatch. Expected ${packageJson.packageManager}, actual npm@${npm.stdout.trim()}.`,
    );
  }

  await assertClean(repo);
  const branch = await currentBranch(repo);
  const head = await headSha(repo);
  const trackedFiles = await trackedFileCount(repo);
  let manifestInfo = null;
  let remoteHead = null;

  if (manifestPath) {
    manifestInfo = await loadManifest(manifestPath);
    const manifest = manifestInfo.manifest;
    if (branch !== manifest.branch) {
      throw new Error(
        `Branch mismatch. Expected ${manifest.branch}, actual ${branch}.`,
      );
    }
    if (head !== manifest.baseSha) {
      throw new Error(
        `HEAD mismatch. Expected ${manifest.baseSha}, actual ${head}.`,
      );
    }
    if (trackedFiles !== manifest.expectedTrackedFilesBefore) {
      throw new Error(
        `Tracked-file count mismatch. Expected ${manifest.expectedTrackedFilesBefore}, actual ${trackedFiles}.`,
      );
    }

    if (manifest.remote && fetch) {
      await fetchRemote(repo, manifest.remote.name);
      remoteHead = await gitText(repo, [
        'rev-parse',
        `${manifest.remote.name}/${manifest.remote.branch}`,
      ]);
      if (remoteHead !== manifest.baseSha) {
        throw new Error(
          `Remote baseline mismatch. Expected ${manifest.baseSha}, actual ${remoteHead}.`,
        );
      }
    }
  }

  const readGitConfig = async (name) => {
    const result = await gitResult(repo, ['config', '--get', name]);
    return result.exitCode === 0 ? result.stdout.trim() : 'unset';
  };
  const autocrlf = await readGitConfig('core.autocrlf');
  const coreEol = await readGitConfig('core.eol');
  const safeCrlf = await readGitConfig('core.safecrlf');
  const prettierConfig = JSON.parse(
    await readFile(resolve(repo, '.prettierrc'), 'utf8'),
  );
  const workspace = await selectWorkspaceRoot({
    repositoryRoot: repo,
    requestedRoot: workRoot,
  });

  return {
    repositoryRoot: repo,
    node: process.version.slice(1),
    npm: npm.stdout.trim(),
    git: gitVersion.stdout.trim(),
    gitUserName,
    gitUserEmail,
    branch,
    head,
    remoteHead,
    trackedFiles,
    coreAutocrlf: autocrlf,
    coreEol,
    coreSafeCrlf: safeCrlf,
    prettierEndOfLine: prettierConfig.endOfLine ?? 'default',
    manifest: manifestInfo?.manifest.id ?? null,
    workspaceRoot: workspace.root,
    projectedGeneratedPathLength: workspace.projectedPathLength,
    safePathLimit: workspace.safePathLimit,
  };
}

async function main() {
  const { options } = parseArguments(process.argv.slice(2));
  const repositoryRoot = optionalString(options, 'repo', process.cwd());
  const manifestPath = optionalString(options, 'manifest');
  const workRoot = optionalString(options, 'work-root');
  const result = await runDoctor({
    repositoryRoot,
    manifestPath,
    fetch: options.get('no-fetch') !== true,
    workRoot,
  });
  console.log(JSON.stringify(result, null, 2));
  console.log('MODULE DOCTOR PASSED');
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.stack ?? error.message);
    process.exitCode = 1;
  });
}

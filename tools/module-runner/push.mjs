#!/usr/bin/env node
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import process from 'node:process';
import {
  optionalString,
  parseArguments,
  requireOption,
} from './lib/arguments.mjs';
import { verifyAllowedChanges } from './lib/change-policy.mjs';
import {
  assertClean,
  assertGitRepository,
  commitNameStatus,
  commitSubject,
  currentBranch,
  fetchRemote,
  git,
  gitText,
  headSha,
  trackedFileCount,
} from './lib/git.mjs';
import { loadManifest } from './lib/manifest.mjs';

export async function pushVerifiedCommit({
  repositoryRoot,
  manifestPath,
  expectedSha,
}) {
  const repo = resolve(repositoryRoot);
  const { manifest } = await loadManifest(manifestPath);
  const remote = manifest.remote ?? { name: 'origin', branch: manifest.branch };

  await assertGitRepository(repo);
  await assertClean(repo);

  const branch = await currentBranch(repo);
  if (branch !== manifest.branch) {
    throw new Error(
      `Branch mismatch. Expected ${manifest.branch}, actual ${branch}.`,
    );
  }

  const head = await headSha(repo);
  if (head !== expectedSha) {
    throw new Error(`HEAD mismatch. Expected ${expectedSha}, actual ${head}.`);
  }
  if ((await headSha(repo, 'HEAD^')) !== manifest.baseSha) {
    throw new Error(`HEAD parent is not manifest base ${manifest.baseSha}.`);
  }
  if ((await commitSubject(repo)) !== manifest.commitSubject) {
    throw new Error('Commit subject does not match the manifest.');
  }
  verifyAllowedChanges(
    manifest,
    await commitNameStatus(repo),
    'Commit selected for push',
  );
  if ((await trackedFileCount(repo)) !== manifest.expectedTrackedFilesAfter) {
    throw new Error('Tracked-file count does not match the manifest.');
  }

  await fetchRemote(repo, remote.name);
  const remoteRef = `${remote.name}/${remote.branch}`;
  const remoteSha = await headSha(repo, remoteRef);
  if (remoteSha !== manifest.baseSha) {
    throw new Error(
      `Remote baseline moved. Expected ${manifest.baseSha}, actual ${remoteSha}.`,
    );
  }

  const divergence = await gitText(repo, [
    'rev-list',
    '--left-right',
    '--count',
    `${remoteRef}...HEAD`,
  ]);
  const [behindText, aheadText] = divergence.split(/\s+/);
  const behind = Number(behindText);
  const ahead = Number(aheadText);
  if (behind !== 0 || ahead !== 1) {
    throw new Error(
      `Expected ahead 1 / behind 0. Actual ahead ${ahead} / behind ${behind}.`,
    );
  }

  await git(repo, ['push', remote.name, `HEAD:refs/heads/${remote.branch}`]);
  await fetchRemote(repo, remote.name);

  const remoteAfter = await headSha(repo, remoteRef);
  if (remoteAfter !== expectedSha) {
    throw new Error(
      `Remote verification failed. Expected ${expectedSha}, actual ${remoteAfter}.`,
    );
  }
  await assertClean(repo);

  return {
    branch,
    head,
    remote: remoteRef,
    remoteHead: remoteAfter,
  };
}

async function main() {
  const { options } = parseArguments(process.argv.slice(2));
  const result = await pushVerifiedCommit({
    repositoryRoot: optionalString(options, 'repo', process.cwd()),
    manifestPath: requireOption(options, 'manifest'),
    expectedSha: requireOption(options, 'sha'),
  });

  console.log('PUSH VERIFIED');
  console.log(`Branch: ${result.branch}`);
  console.log(`HEAD: ${result.head}`);
  console.log(`${result.remote}: ${result.remoteHead}`);
  console.log('Working tree: clean');
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.stack ?? error.message);
    if (error.result?.stdout) console.error(error.result.stdout);
    if (error.result?.stderr) console.error(error.result.stderr);
    process.exitCode = 1;
  });
}

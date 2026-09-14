import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { resolve } from 'node:path';

export function sha256Buffer(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

export async function sha256File(path) {
  const hash = createHash('sha256');
  await new Promise((resolvePromise, reject) => {
    const stream = createReadStream(path);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', resolvePromise);
  });
  return hash.digest('hex');
}

export async function verifyExpectedFileHashes(
  repositoryRoot,
  changes,
  expectedFileHashes,
) {
  const expectedPaths = changes
    .filter((change) => change.status !== 'D')
    .map((change) => change.path)
    .sort();
  const configuredPaths = Object.keys(expectedFileHashes).sort();

  if (expectedPaths.join('\n') !== configuredPaths.join('\n')) {
    throw new Error(
      `Expected-file hash paths do not match added/modified paths.\nExpected:\n${expectedPaths.join('\n')}\nConfigured:\n${configuredPaths.join('\n')}`,
    );
  }

  for (const path of expectedPaths) {
    const actual = await sha256File(resolve(repositoryRoot, path));
    const expected = expectedFileHashes[path];
    if (actual !== expected) {
      throw new Error(
        `File SHA-256 mismatch for ${path}. Expected ${expected}, actual ${actual}.`,
      );
    }
  }
}

import { compareChanges, expectedChanges } from './manifest.mjs';

export function verifyAllowedChanges(manifest, actualChanges, label) {
  const expected = expectedChanges(manifest);
  const actual = [...actualChanges]
    .map(({ status, path }) => ({ status: status[0], path }))
    .sort(compareChanges);

  const expectedText = expected.map(formatChange).join('\n');
  const actualText = actual.map(formatChange).join('\n');

  if (expectedText !== actualText) {
    throw new Error(
      `${label} does not match the manifest.\nExpected:\n${expectedText}\nActual:\n${actualText}`,
    );
  }

  for (const change of actual) {
    for (const prefix of manifest.forbiddenPrefixes) {
      if (change.path === prefix || change.path.startsWith(prefix)) {
        throw new Error(
          `${label} contains forbidden path ${change.path} (prefix ${prefix}).`,
        );
      }
    }
  }

  return actual;
}

function formatChange(change) {
  return `${change.status}\t${change.path}`;
}

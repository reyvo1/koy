import { readFile } from 'node:fs/promises';
import { dirname, isAbsolute, resolve } from 'node:path';

const shaPattern = /^[0-9a-f]{40}$/;
const idPattern = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/;
const allowedStatuses = new Set(['A', 'M', 'D']);
const payloadFormat = 'exact-files-v1';

export async function loadManifest(path) {
  const absolutePath = resolve(path);
  const raw = await readFile(absolutePath, 'utf8');
  let manifest;

  try {
    manifest = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Invalid JSON manifest ${absolutePath}: ${error.message}`);
  }

  validateManifest(manifest, absolutePath);
  return {
    manifest,
    path: absolutePath,
    directory: dirname(absolutePath),
  };
}

export function validateManifest(manifest, source = 'manifest') {
  if (manifest.version !== 1) {
    throw new Error(`${source}: version must be 1.`);
  }
  requireString(manifest.id, `${source}: id`);
  if (!idPattern.test(manifest.id)) {
    throw new Error(`${source}: id has an unsupported format.`);
  }
  requireString(manifest.title, `${source}: title`);
  requireString(manifest.baseSha, `${source}: baseSha`);
  if (!shaPattern.test(manifest.baseSha)) {
    throw new Error(`${source}: baseSha must be a full lowercase SHA-1.`);
  }
  requireString(manifest.branch, `${source}: branch`);
  requireString(manifest.commitSubject, `${source}: commitSubject`);

  assertInteger(
    manifest.expectedTrackedFilesBefore,
    `${source}: expectedTrackedFilesBefore`,
  );
  assertInteger(
    manifest.expectedTrackedFilesAfter,
    `${source}: expectedTrackedFilesAfter`,
  );

  if (!manifest.payload || typeof manifest.payload !== 'object') {
    throw new Error(`${source}: payload is required.`);
  }
  if (manifest.payload.format !== payloadFormat) {
    throw new Error(`${source}: payload.format must be ${payloadFormat}.`);
  }
  if (manifest.payload.path !== undefined) {
    validateRepositoryPath(
      manifest.payload.path,
      `${source}: payload.path`,
      true,
    );
  }

  if (!manifest.allowedChanges || typeof manifest.allowedChanges !== 'object') {
    throw new Error(`${source}: allowedChanges is required.`);
  }

  const seen = new Set();
  for (const status of allowedStatuses) {
    const key = statusToManifestKey(status);
    const paths = manifest.allowedChanges[key];
    if (!Array.isArray(paths)) {
      throw new Error(`${source}: allowedChanges.${key} must be an array.`);
    }
    for (const path of paths) {
      validateRepositoryPath(path, `${source}: allowedChanges.${key}`);
      if (seen.has(path)) {
        throw new Error(`${source}: duplicate allowed path ${path}.`);
      }
      seen.add(path);
    }
  }

  if (seen.size === 0) {
    throw new Error(`${source}: at least one allowed path is required.`);
  }

  if (
    !manifest.expectedFileHashes ||
    typeof manifest.expectedFileHashes !== 'object' ||
    Array.isArray(manifest.expectedFileHashes)
  ) {
    throw new Error(`${source}: expectedFileHashes must be an object.`);
  }

  const expectedHashPaths = expectedChanges(manifest)
    .filter((change) => change.status !== 'D')
    .map((change) => change.path);
  const configuredHashPaths = Object.keys(manifest.expectedFileHashes);

  if (expectedHashPaths.length !== configuredHashPaths.length) {
    throw new Error(
      `${source}: expectedFileHashes must contain every added or modified path exactly once.`,
    );
  }

  for (const path of configuredHashPaths) {
    validateRepositoryPath(path, `${source}: expectedFileHashes`);
    if (!expectedHashPaths.includes(path)) {
      throw new Error(
        `${source}: expectedFileHashes contains non-added/modified path ${path}.`,
      );
    }
    if (!/^[0-9a-f]{64}$/.test(manifest.expectedFileHashes[path])) {
      throw new Error(
        `${source}: expectedFileHashes.${path} must be lowercase SHA-256.`,
      );
    }
  }

  if (!Array.isArray(manifest.forbiddenPrefixes)) {
    throw new Error(`${source}: forbiddenPrefixes must be an array.`);
  }
  for (const prefix of manifest.forbiddenPrefixes) {
    validateRepositoryPath(prefix, `${source}: forbiddenPrefixes`, true);
    for (const path of seen) {
      if (path === prefix || path.startsWith(prefix)) {
        throw new Error(
          `${source}: allowed path ${path} overlaps forbidden prefix ${prefix}.`,
        );
      }
    }
  }

  requireString(manifest.validationProfile, `${source}: validationProfile`);
  if (manifest.postApplyValidationProfile !== undefined) {
    requireString(
      manifest.postApplyValidationProfile,
      `${source}: postApplyValidationProfile`,
    );
  }

  if (manifest.remote !== undefined) {
    if (!manifest.remote || typeof manifest.remote !== 'object') {
      throw new Error(`${source}: remote must be an object.`);
    }
    requireString(manifest.remote.name, `${source}: remote.name`);
    requireString(manifest.remote.branch, `${source}: remote.branch`);
  }
}

export async function loadValidationProfiles(repositoryRoot) {
  const path = resolve(
    repositoryRoot,
    'tools/module-runner/profiles/validation-profiles.json',
  );
  const raw = await readFile(path, 'utf8');
  const value = JSON.parse(raw);
  validateValidationProfiles(value, path);
  return value.profiles;
}

export function validateValidationProfiles(
  value,
  source = 'validation profiles',
) {
  if (
    value.version !== 1 ||
    !value.profiles ||
    typeof value.profiles !== 'object' ||
    Array.isArray(value.profiles)
  ) {
    throw new Error(`Invalid validation profile registry: ${source}`);
  }

  for (const [profileName, steps] of Object.entries(value.profiles)) {
    if (!Array.isArray(steps) || steps.length === 0) {
      throw new Error(`${source}: profile ${profileName} must contain steps.`);
    }

    const labels = new Set();
    for (const [index, step] of steps.entries()) {
      const label = `${source}: profile ${profileName} step ${index + 1}`;
      if (!step || typeof step !== 'object' || Array.isArray(step)) {
        throw new Error(`${label} must be an object.`);
      }
      requireString(step.label, `${label}.label`);
      if (labels.has(step.label)) {
        throw new Error(
          `${source}: profile ${profileName} contains duplicate label ${step.label}.`,
        );
      }
      labels.add(step.label);
      requireString(step.command, `${label}.command`);
      if (
        !Array.isArray(step.args) ||
        step.args.some((argument) => typeof argument !== 'string')
      ) {
        throw new Error(`${label}.args must be an array of strings.`);
      }
      for (const argument of step.args) {
        if (/^\{[^{}]+\}$/.test(argument) && argument !== '{changed}') {
          throw new Error(
            `${label}.args uses unsupported argument placeholder ${argument}.`,
          );
        }
      }
      if (
        step.timeoutMs !== undefined &&
        (!Number.isInteger(step.timeoutMs) || step.timeoutMs <= 0)
      ) {
        throw new Error(`${label}.timeoutMs must be a positive integer.`);
      }
      if (
        step.heartbeatMs !== undefined &&
        (!Number.isInteger(step.heartbeatMs) || step.heartbeatMs <= 0)
      ) {
        throw new Error(`${label}.heartbeatMs must be a positive integer.`);
      }
      if (step.stream !== undefined && typeof step.stream !== 'boolean') {
        throw new Error(`${label}.stream must be a boolean.`);
      }
      if (step.env !== undefined) {
        if (
          !step.env ||
          typeof step.env !== 'object' ||
          Array.isArray(step.env)
        ) {
          throw new Error(`${label}.env must be an object of string values.`);
        }
        for (const [key, value] of Object.entries(step.env)) {
          if (key.trim().length === 0 || typeof value !== 'string') {
            throw new Error(
              `${label}.env must contain non-empty string keys and string values.`,
            );
          }
        }
      }
      validateRequiredEnvironmentKeys(step.requiredEnv, label);
      if (
        isPrismaValidateCommand(step) &&
        (typeof step.env?.DATABASE_URL !== 'string' ||
          step.env.DATABASE_URL.trim().length === 0)
      ) {
        throw new Error(
          `${source}: profile ${profileName} Prisma validate steps require DATABASE_URL.`,
        );
      }
      if (isDatabaseIntegrationCommand(step)) {
        if (step.env?.NODE_ENV !== 'test') {
          throw new Error(
            `${source}: profile ${profileName} database integration steps require NODE_ENV=test.`,
          );
        }
        if (step.env?.DATABASE_INTEGRATION_TESTS_ALLOWED !== 'true') {
          throw new Error(
            `${source}: profile ${profileName} database integration steps require DATABASE_INTEGRATION_TESTS_ALLOWED=true.`,
          );
        }
        const integrationDatabaseUrl =
          step.env?.TEST_DATABASE_URL ?? step.env?.DATABASE_URL;
        const requiresHostTestDatabaseUrl =
          step.requiredEnv?.includes('TEST_DATABASE_URL') === true;
        if (
          (typeof integrationDatabaseUrl !== 'string' ||
            integrationDatabaseUrl.trim().length === 0) &&
          !requiresHostTestDatabaseUrl
        ) {
          throw new Error(
            `${source}: profile ${profileName} database integration steps require a safe literal URL or requiredEnv TEST_DATABASE_URL.`,
          );
        }
        if (
          typeof integrationDatabaseUrl === 'string' &&
          integrationDatabaseUrl.trim().length > 0
        ) {
          validateDatabaseIntegrationUrl(
            integrationDatabaseUrl,
            `${source}: profile ${profileName}`,
          );
        }
      }
      if (step.command === 'npm' && step.args[0] === 'install') {
        throw new Error(
          `${source}: profile ${profileName} must use one locked npm ci, not npm install.`,
        );
      }
    }

    enforceHeavyProfileEfficiency(profileName, steps, source);
  }
}


function validateRequiredEnvironmentKeys(requiredEnv, label) {
  if (requiredEnv === undefined) return;
  if (
    !Array.isArray(requiredEnv) ||
    requiredEnv.length === 0 ||
    requiredEnv.some(
      (key) =>
        typeof key !== 'string' || !/^[A-Z_][A-Z0-9_]*$/.test(key),
    ) ||
    new Set(requiredEnv).size !== requiredEnv.length
  ) {
    throw new Error(
      `${label}.requiredEnv must contain unique environment variable names.`,
    );
  }
}

function validateDatabaseIntegrationUrl(value, label) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${label} database integration URL must be valid.`);
  }
  if (!['postgresql:', 'postgres:'].includes(parsed.protocol)) {
    throw new Error(`${label} database integration URL must use PostgreSQL.`);
  }
  if (!['localhost', '127.0.0.1', '::1'].includes(parsed.hostname)) {
    throw new Error(
      `${label} database integration URL must use a loopback host.`,
    );
  }
  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  if (
    !databaseName ||
    ['postgres', 'template0', 'template1'].includes(databaseName)
  ) {
    throw new Error(
      `${label} database integration URL must use a non-system database.`,
    );
  }
}

function isDatabaseIntegrationCommand(step) {
  return (
    step.command === 'npm' &&
    step.args[0] === 'run' &&
    step.args[1] === 'test:integration:db'
  );
}

function isPrismaValidateCommand(step) {
  return (
    step.command === 'npx' &&
    step.args[0] === 'prisma' &&
    step.args[1] === 'validate'
  );
}

function enforceHeavyProfileEfficiency(profileName, steps, source) {
  const matches = (command, args) =>
    steps
      .map((step, index) => ({ step, index }))
      .filter(
        ({ step }) =>
          step.command === command &&
          args.length === step.args.length &&
          args.every((argument, index) => step.args[index] === argument),
      );
  const npmCi = steps.filter(
    (step) => step.command === 'npm' && step.args[0] === 'ci',
  );
  if (npmCi.length > 1) {
    throw new Error(
      `${source}: profile ${profileName} contains more than one npm ci.`,
    );
  }

  const fullJest = matches('npm', ['test', '--', '--runInBand']);
  if (fullJest.length > 1) {
    throw new Error(
      `${source}: profile ${profileName} contains more than one broad Full Jest.`,
    );
  }
  if (fullJest.length === 0) return;
  if (npmCi.length !== 1) {
    throw new Error(
      `${source}: broad profile ${profileName} must contain exactly one npm ci.`,
    );
  }

  for (const forbidden of ['test:contracts', 'test:module-10']) {
    if (
      steps.some(
        (step) =>
          step.command === 'npm' &&
          step.args[0] === 'run' &&
          step.args[1] === forbidden,
      )
    ) {
      throw new Error(
        `${source}: broad profile ${profileName} duplicates Full Jest with ${forbidden}.`,
      );
    }
  }

  const required = {
    selfTest: matches('node', ['tools/module-runner/self-test.mjs']),
    sourceCheck: matches('npm', ['run', 'module:runner:check']),
    format: matches('node', [
      'tools/module-runner/check-format.mjs',
      '{changed}',
    ]),
    lint: matches('npm', ['run', 'lint:check']),
    lifecycle: matches('npm', ['run', 'module:validate']),
    simulation: matches('npm', ['run', 'module:simulate']),
    prisma: matches('npx', ['prisma', 'generate']),
  };
  for (const [name, entries] of Object.entries(required)) {
    if (entries.length !== 1) {
      throw new Error(
        `${source}: broad profile ${profileName} must contain exactly one ${name} gate.`,
      );
    }
  }

  const ciIndex = steps.findIndex(
    (step) => step.command === 'npm' && step.args[0] === 'ci',
  );
  // Keep the externally visible profile order compatible with the runner at
  // the base checkpoint. The self-test itself begins with source/lifecycle
  // fail-fast checks, so predictable defects still stop before its longer
  // hermetic probes and before dependency bootstrap.
  const order = [
    ['self-test', required.selfTest[0].index],
    ['source check', required.sourceCheck[0].index],
    ['npm ci', ciIndex],
    ['formatting', required.format[0].index],
    ['lint', required.lint[0].index],
    ['lifecycle validation', required.lifecycle[0].index],
    ['lifecycle simulation', required.simulation[0].index],
    ['Prisma generation', required.prisma[0].index],
    ['Full Jest', fullJest[0].index],
  ];
  if (required.format[0].index >= required.lint[0].index) {
    throw new Error(
      `${source}: broad profile ${profileName} must order formatting before lint.`,
    );
  }
  for (let index = 1; index < order.length; index += 1) {
    if (order[index - 1][1] >= order[index][1]) {
      throw new Error(
        `${source}: broad profile ${profileName} must order ${order[index - 1][0]} before ${order[index][0]}.`,
      );
    }
  }

  const matrix = matches('npm', [
    'run',
    'test:historical-contract-transitions',
  ]);
  if (matrix.length > 1) {
    throw new Error(
      `${source}: profile ${profileName} contains more than one transition matrix.`,
    );
  }
  if (matrix.length === 1 && matrix[0].index <= fullJest[0].index) {
    throw new Error(
      `${source}: profile ${profileName} must run the transition matrix after Full Jest.`,
    );
  }
}

export function resolvePayloadPath(manifestInfo, cliPayloadPath) {
  if (cliPayloadPath) {
    return resolve(cliPayloadPath);
  }
  const configured = manifestInfo.manifest.payload.path;
  if (typeof configured !== 'string' || configured.trim().length === 0) {
    throw new Error(
      'Payload path is required through --payload or manifest.payload.path.',
    );
  }
  return isAbsolute(configured)
    ? configured
    : resolve(manifestInfo.directory, configured);
}

export function expectedChanges(manifest) {
  const result = [];
  for (const status of ['A', 'M', 'D']) {
    const key = statusToManifestKey(status);
    for (const path of manifest.allowedChanges[key]) {
      result.push({ status, path });
    }
  }
  return result.sort(compareChanges);
}

export function compareChanges(left, right) {
  return (
    left.path.localeCompare(right.path) ||
    left.status.localeCompare(right.status)
  );
}

export function statusToManifestKey(status) {
  if (status === 'A') return 'added';
  if (status === 'M') return 'modified';
  if (status === 'D') return 'deleted';
  throw new Error(`Unsupported change status: ${status}`);
}

function validateRepositoryPath(path, label, allowPrefix = false) {
  requireString(path, label);
  if (path.includes('\\') || path.startsWith('/') || /^[A-Za-z]:/.test(path)) {
    throw new Error(
      `${label}: repository paths must use relative POSIX syntax.`,
    );
  }
  if (!allowPrefix && path.endsWith('/')) {
    throw new Error(`${label}: file path must not end with '/': ${path}`);
  }
  const pathForParts = allowPrefix ? path.replace(/\/$/, '') : path;
  const normalized = pathForParts.split('/');
  if (normalized.some((part) => part === '' || part === '.' || part === '..')) {
    throw new Error(`${label}: unsafe repository path ${path}.`);
  }
}

function requireString(value, label) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }
}

function assertInteger(value, label) {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative integer.`);
  }
}

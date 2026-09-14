import process from 'node:process';
import { runChecked } from './process.mjs';

const DEFAULT_STEP_TIMEOUT_MS = 15 * 60 * 1000;

export async function runValidationProfile({
  repositoryRoot,
  profileName,
  profiles,
  changedPaths,
  log,
}) {
  const profile = profiles[profileName];
  if (!Array.isArray(profile) || profile.length === 0) {
    throw new Error(`Unknown or empty validation profile: ${profileName}`);
  }

  const results = [];

  for (const step of profile) {
    validateStep(step, profileName);
    assertRequiredEnvironment(step, profileName, process.env);
    const args = expandArguments(step.args, changedPaths);
    const stream = step.stream ?? true;
    const result = await runChecked(step.command, args, {
      cwd: repositoryRoot,
      env: step.env ?? {},
      timeoutMs: step.timeoutMs ?? DEFAULT_STEP_TIMEOUT_MS,
      heartbeatMs: step.heartbeatMs ?? 30_000,
      stream,
      log,
    });
    if (!stream) {
      process.stdout.write(
        `[module-runner] passed (${formatDuration(result.durationMs)}): ${
          step.label
        }\n`,
      );
    }
    results.push({ label: step.label, ...result });
  }

  return results;
}

function validateStep(step, profileName) {
  if (!step || typeof step !== 'object') {
    throw new Error(`Invalid validation step in profile ${profileName}.`);
  }
  for (const key of ['label', 'command']) {
    if (typeof step[key] !== 'string' || step[key].trim().length === 0) {
      throw new Error(`Validation step ${key} is required in ${profileName}.`);
    }
  }
  if (
    !Array.isArray(step.args) ||
    step.args.some((value) => typeof value !== 'string')
  ) {
    throw new Error(`Validation step args must be strings in ${profileName}.`);
  }
  for (const key of ['timeoutMs', 'heartbeatMs']) {
    if (
      step[key] !== undefined &&
      (!Number.isInteger(step[key]) || step[key] <= 0)
    ) {
      throw new Error(
        `Validation step ${key} must be a positive integer in ${profileName}.`,
      );
    }
  }
  if (step.stream !== undefined && typeof step.stream !== 'boolean') {
    throw new Error(
      `Validation step stream must be boolean in ${profileName}.`,
    );
  }
  if (step.requiredEnv !== undefined) {
    if (
      !Array.isArray(step.requiredEnv) ||
      step.requiredEnv.length === 0 ||
      step.requiredEnv.some(
        (key) =>
          typeof key !== 'string' ||
          !/^[A-Z_][A-Z0-9_]*$/.test(key),
      ) ||
      new Set(step.requiredEnv).size !== step.requiredEnv.length
    ) {
      throw new Error(
        `Validation step requiredEnv must contain unique environment keys in ${profileName}.`,
      );
    }
  }
  if (step.env !== undefined) {
    if (!step.env || typeof step.env !== 'object' || Array.isArray(step.env)) {
      throw new Error(
        `Validation step env must be an object in ${profileName}.`,
      );
    }
    for (const [key, value] of Object.entries(step.env)) {
      if (key.trim().length === 0 || typeof value !== 'string') {
        throw new Error(
          `Validation step env must contain string values in ${profileName}.`,
        );
      }
    }
  }
}


function assertRequiredEnvironment(step, profileName, source) {
  for (const key of step.requiredEnv ?? []) {
    const value = source[key];
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new Error(
        `Validation step ${step.label} requires host environment variable ${key} in ${profileName}.`,
      );
    }
  }
}

export function expandArguments(args, changedPaths) {
  const expanded = [];
  for (const value of args) {
    if (value === '{changed}') {
      expanded.push(...changedPaths);
      continue;
    }
    if (/^\{[^{}]+\}$/.test(value)) {
      throw new Error(`Unsupported validation argument placeholder: ${value}`);
    }
    expanded.push(value);
  }
  return expanded;
}

function formatDuration(durationMs) {
  if (durationMs < 1_000) return `${durationMs}ms`;
  return `${(durationMs / 1_000).toFixed(1)}s`;
}

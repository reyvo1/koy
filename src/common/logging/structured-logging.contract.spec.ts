import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const SOURCE_ROOT = join(process.cwd(), 'src');
const LOGGER_CALL_PATTERN =
  /\b(?:this\.)?logger\.(?:log|warn|error|debug|verbose|fatal)\(\s*\{([\s\S]*?)\}\s*\);/g;
const NON_STRUCTURED_LOGGER_CALL_PATTERN =
  /\b(?:this\.)?logger\.(?:log|warn|error|debug|verbose|fatal)\(\s*(?!\{)/g;
const CONSOLE_CALL_PATTERN = /\bconsole\.(?:log|warn|error|debug|info)\s*\(/g;
const SENSITIVE_LOG_KEY_PATTERN =
  /\b(?:payload|password|passwordHash|token|tokenHash|accessToken|refreshToken|secret|credential)\s*:/i;
const EVENT_NAME_PATTERN = /^[a-z][a-z0-9]*(?:[._][a-z0-9]+)*$/;

function collectSourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const absolutePath = join(directory, entry);

    if (statSync(absolutePath).isDirectory()) {
      return collectSourceFiles(absolutePath);
    }

    if (!entry.endsWith('.ts') || entry.endsWith('.spec.ts')) {
      return [];
    }

    return [absolutePath];
  });
}

describe('Structured Logging Contract', () => {
  const sourceFiles = collectSourceFiles(SOURCE_ROOT);

  it('does not use console logging in application source', () => {
    const violations = sourceFiles.flatMap((filePath) => {
      const source = readFileSync(filePath, 'utf8');
      return CONSOLE_CALL_PATTERN.test(source)
        ? [relative(process.cwd(), filePath)]
        : [];
    });

    expect(violations).toEqual([]);
  });

  it('uses structured objects for every application logger call', () => {
    const violations = sourceFiles.flatMap((filePath) => {
      const source = readFileSync(filePath, 'utf8');
      return NON_STRUCTURED_LOGGER_CALL_PATTERN.test(source)
        ? [relative(process.cwd(), filePath)]
        : [];
    });

    expect(violations).toEqual([]);
  });

  it('requires a valid event name on every structured application log', () => {
    const violations: string[] = [];

    for (const filePath of sourceFiles) {
      const source = readFileSync(filePath, 'utf8');
      const calls = [...source.matchAll(LOGGER_CALL_PATTERN)];

      for (const [index, call] of calls.entries()) {
        const eventMatch = call[1].match(/\bevent\s*:\s*'([^']+)'/);
        const eventName = eventMatch?.[1];

        if (!eventName || !EVENT_NAME_PATTERN.test(eventName)) {
          violations.push(
            `${relative(process.cwd(), filePath)}#logger-call-${index + 1}`,
          );
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it('does not place sensitive payload keys inside structured log objects', () => {
    const violations: string[] = [];

    for (const filePath of sourceFiles) {
      const source = readFileSync(filePath, 'utf8');
      const calls = [...source.matchAll(LOGGER_CALL_PATTERN)];

      for (const [index, call] of calls.entries()) {
        if (SENSITIVE_LOG_KEY_PATTERN.test(call[1])) {
          violations.push(
            `${relative(process.cwd(), filePath)}#logger-call-${index + 1}`,
          );
        }
      }
    }

    expect(violations).toEqual([]);
  });
});

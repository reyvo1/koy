/**
 * Guards the failure mode that cost a real debugging cycle: a BFF route that forwards a
 * body through `client.request(...)` without setting `content-type: application/json`.
 *
 * The symptom is misleading. The backend body parser yields `undefined`, so every field on
 * a DTO fails validation and the client receives VALIDATION_FAILED with an empty enum list
 * — a 400 that reads like "you sent the wrong values" when the values were never read at
 * all. Pinning the header keeps that class of bug from returning silently.
 *
 * Scope notes:
 *  - Only inline `client.request(...)` calls are inspected. A route that merely parses an
 *    incoming body and hands off to a helper (`sendDeviceCommand`) is out of scope, because
 *    the helper owns the outgoing headers.
 *  - Each call is delimited by balanced parentheses rather than a fixed-length window, so a
 *    neighbouring call's header cannot mask or manufacture a finding.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const API_DIR = join(__dirname, '..', 'apps', 'admin-web', 'app', 'api');

function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return routeFiles(full);
    return entry === 'route.ts' ? [full] : [];
  });
}

/** The exact source of each `client.request(...)` call, including its closing paren. */
function requestCalls(source: string): string[] {
  const calls: string[] = [];
  const marker = /client\.request\(/g;
  let match: RegExpExecArray | null;

  while ((match = marker.exec(source)) !== null) {
    const start = match.index;
    let depth = 0;
    let end = -1;

    for (let i = source.indexOf('(', start); i < source.length; i += 1) {
      const ch = source[i];
      if (ch === '(') depth += 1;
      else if (ch === ')') {
        depth -= 1;
        if (depth === 0) {
          end = i + 1;
          break;
        }
      }
    }

    if (end === -1) break;
    calls.push(source.slice(start, end));
    marker.lastIndex = end;
  }

  return calls;
}

function flagsMissingContentType(call: string): boolean {
  return /\bbody\b\s*:/.test(call) && !/content-type/i.test(call);
}

describe('admin-web BFF request bodies declare their content type', () => {
  const files = routeFiles(API_DIR);

  it('discovers the BFF route files', () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it('has no inline client.request call that sends a body without a content-type', () => {
    const offenders: string[] = [];

    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      if (requestCalls(source).some(flagsMissingContentType)) {
        offenders.push(file.slice(API_DIR.length));
      }
    }

    expect(offenders).toEqual([]);
  });

  it('keeps the check meaningful rather than vacuously true', () => {
    // A rule that can never fire is not a gate. Prove the detector sees a body-bearing
    // call and would flag one that omits the header.
    const withHeader =
      "client.request('/x', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })";
    const withoutHeader = "client.request('/x', { method: 'POST', body: '{}' })";
    const noBody = "client.request('/x', { method: 'GET' })";

    expect(requestCalls(withHeader).some(flagsMissingContentType)).toBe(false);
    expect(requestCalls(withoutHeader).some(flagsMissingContentType)).toBe(true);
    expect(requestCalls(noBody).some(flagsMissingContentType)).toBe(false);
  });

  it('does not let a neighbouring call mask a missing header', () => {
    // The regression this protects: a fixed-length window let a later call's
    // content-type header hide an earlier call that omitted it.
    const source = [
      "client.request('/a', { method: 'POST', body: '{}' });",
      "client.request('/b', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: '{}' });",
    ].join('\n');

    expect(requestCalls(source)).toHaveLength(2);
    expect(requestCalls(source).filter(flagsMissingContentType)).toHaveLength(1);
  });
});

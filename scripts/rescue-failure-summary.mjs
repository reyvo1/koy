const FAILURE_LINE_PATTERNS = [
  /^FAIL\s+/,
  /^\s*●\s+/,
  /error TS\d+:/,
  /^Test Suites:/,
  /^Tests:/,
  /^Snapshots:/,
  /^Time:/,
];

/**
 * Return a bounded, high-signal failure index from a subprocess transcript.
 * The full stdout/stderr remains in the JSON acceptance report; this summary
 * exists so terminal operators can see every failing Jest suite/test instead
 * of only the last tail fragment.
 */
export function summarizeFailureOutput(detail, options = {}) {
  const maxLines = Number.isInteger(options.maxLines) ? options.maxLines : 240;
  const maxChars = Number.isInteger(options.maxChars) ? options.maxChars : 24_000;
  const seen = new Set();
  const selected = [];

  for (const rawLine of String(detail ?? '').split(/\r?\n/)) {
    const line = rawLine.replace(/\x1b\[[0-9;]*m/g, '');
    if (!FAILURE_LINE_PATTERNS.some((pattern) => pattern.test(line))) continue;
    const normalized = line.trimEnd();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    selected.push(normalized);
    if (selected.length >= maxLines) break;
  }

  if (selected.length === 0) return '';
  const joined = selected.join('\n');
  if (joined.length <= maxChars) return joined;
  return `${joined.slice(0, maxChars)}\n... failure summary truncated; full output is preserved in the JSON report ...`;
}

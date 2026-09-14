import { readFile, writeFile } from 'node:fs/promises';
import { basename, extname, resolve } from 'node:path';

const textExtensions = new Set([
  '.cjs',
  '.css',
  '.env',
  '.example',
  '.gitignore',
  '.gitattributes',
  '.html',
  '.js',
  '.json',
  '.jsx',
  '.md',
  '.mjs',
  '.prisma',
  '.sh',
  '.sql',
  '.ts',
  '.tsx',
  '.txt',
  '.yaml',
  '.yml',
]);

const crlfExtensions = new Set(['.bat', '.cmd', '.ps1']);
const utf8Decoder = new TextDecoder('utf-8', { fatal: true });

export function isTextPath(path) {
  const extension = extname(path).toLowerCase();
  const name = basename(path).toLowerCase();
  return (
    textExtensions.has(extension) ||
    crlfExtensions.has(extension) ||
    ['.editorconfig', '.gitignore', '.gitattributes', '.npmrc'].includes(name)
  );
}

export async function captureTextStyles(repositoryRoot, changes) {
  const styles = new Map();

  for (const change of changes) {
    if (change.status === 'D' || !isTextPath(change.path)) {
      continue;
    }

    const extension = extname(change.path).toLowerCase();
    if (change.status === 'A') {
      styles.set(change.path, crlfExtensions.has(extension) ? 'crlf' : 'lf');
      continue;
    }

    const absolutePath = resolve(repositoryRoot, change.path);
    const bytes = await readFile(absolutePath);
    styles.set(change.path, inspectTextBytes(change.path, bytes).style);
  }

  return styles;
}

export async function normalizeChangedTextFiles(
  repositoryRoot,
  changes,
  styles = new Map(),
) {
  const normalized = [];

  for (const change of changes) {
    if (change.status === 'D' || !isTextPath(change.path)) {
      continue;
    }

    const absolutePath = resolve(repositoryRoot, change.path);
    const bytes = await readFile(absolutePath);
    const { text } = inspectTextBytes(change.path, bytes);
    const extension = extname(change.path).toLowerCase();
    const style =
      styles.get(change.path) ??
      (crlfExtensions.has(extension) ? 'crlf' : 'lf');
    const canonicalLf = `${text.replace(/\r\n?/g, '\n').trimEnd()}\n`;
    const output =
      style === 'crlf' ? canonicalLf.replace(/\n/g, '\r\n') : canonicalLf;

    if (!bytes.equals(Buffer.from(output, 'utf8'))) {
      await writeFile(absolutePath, output, 'utf8');
      normalized.push(change.path);
    }
  }

  return normalized;
}

export async function verifyPayloadTextFiles(repositoryRoot, changes) {
  for (const change of changes) {
    if (change.status === 'D' || !isTextPath(change.path)) {
      continue;
    }

    const absolutePath = resolve(repositoryRoot, change.path);
    const bytes = await readFile(absolutePath);
    const { text, style } = inspectTextBytes(change.path, bytes);
    const finalNewline = style === 'crlf' ? '\r\n' : '\n';
    verifyTextHygiene(change.path, text, finalNewline);
  }
}

export async function verifyChangedTextFiles(
  repositoryRoot,
  changes,
  styles = new Map(),
) {
  for (const change of changes) {
    if (change.status === 'D' || !isTextPath(change.path)) {
      continue;
    }

    const absolutePath = resolve(repositoryRoot, change.path);
    const bytes = await readFile(absolutePath);
    const { text, style } = inspectTextBytes(change.path, bytes);
    const extension = extname(change.path).toLowerCase();
    const expected =
      styles.get(change.path) ??
      (crlfExtensions.has(extension) ? 'crlf' : 'lf');

    if (style !== expected && style !== 'none') {
      throw new Error(
        `Line-ending style mismatch for ${change.path}. Expected ${expected}, actual ${style}.`,
      );
    }

    const finalNewline = expected === 'crlf' ? '\r\n' : '\n';
    verifyTextHygiene(change.path, text, finalNewline);
  }
}

function verifyTextHygiene(path, text, finalNewline) {
  if (!text.endsWith(finalNewline)) {
    throw new Error(`Missing final newline: ${path}`);
  }

  const withoutFinalNewline = text.slice(0, -finalNewline.length);
  if (withoutFinalNewline.endsWith(finalNewline)) {
    throw new Error(`Extra blank line at EOF: ${path}`);
  }

  const canonicalLf = text.replace(/\r\n/g, '\n');
  const lines = canonicalLf.slice(0, -1).split('\n');
  const trailingWhitespaceLine = lines.findIndex((line) =>
    /[ \t]+$/.test(line),
  );
  if (trailingWhitespaceLine >= 0) {
    throw new Error(`Trailing whitespace at ${path}:${trailingWhitespaceLine + 1}`);
  }
}

function inspectTextBytes(path, bytes) {
  if (bytes.includes(0)) {
    throw new Error(`NUL byte found in text file: ${path}`);
  }

  let text;
  try {
    text = utf8Decoder.decode(bytes);
  } catch {
    throw new Error(`Text file is not valid UTF-8: ${path}`);
  }

  if (text.charCodeAt(0) === 0xfeff) {
    throw new Error(`UTF-8 BOM is not allowed: ${path}`);
  }

  const hasCrLf = text.includes('\r\n');
  const withoutCrLf = text.replace(/\r\n/g, '');
  const hasBareLf = withoutCrLf.includes('\n');
  const hasBareCr = withoutCrLf.includes('\r');

  if ((hasCrLf && hasBareLf) || hasBareCr) {
    throw new Error(`Mixed line endings found: ${path}`);
  }

  return {
    text,
    style: hasCrLf ? 'crlf' : hasBareLf ? 'lf' : 'none',
  };
}

#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const treePath = path.join(root, 'repository-tree.txt');
const manifestPath = path.join(root, 'BASELINE-MANIFEST.sha256');
const mode = process.argv[2] ?? 'verify';
const excludedAnywhere = new Set(['.git', 'node_modules', 'dist', '.next', 'coverage', '__pycache__']);
const excludedTopLevel = new Set(['artifacts', 'reports']);
const excludedFiles = new Set(['repository-tree.txt', 'BASELINE-MANIFEST.sha256', '.env']);
const excludedFilePatterns = [/\.tsbuildinfo$/i];
const excludedTopLevelFilePatterns = [/^APPLY-.*\.txt$/i, /^README-HOTFIX\.txt$/i];

function canonicalBytes(file, relativePath) {
  const raw = readFileSync(file);

  // Preserve binary bytes exactly. Canonicalize UTF-8 text so equivalent
  // Windows CRLF and Linux LF checkouts seal to one source fingerprint.
  if (raw.includes(0)) return raw;

  const decoded = raw.toString('utf8');
  if (!Buffer.from(decoded, 'utf8').equals(raw)) return raw;

  const normalizedLf = decoded.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const extension = path.extname(relativePath).toLowerCase();

  // Windows launchers remain semantically CRLF even if a temporary checkout
  // exposes LF. .gitattributes + operator contracts still enforce checkout EOL.
  if (extension === '.cmd' || extension === '.bat') {
    return Buffer.from(normalizedLf.replace(/\n/g, '\r\n'), 'utf8');
  }

  return Buffer.from(normalizedLf, 'utf8');
}

function sha256(file, relativePath = path.relative(root, file).split(path.sep).join('/')) {
  return createHash('sha256')
    .update(canonicalBytes(file, relativePath))
    .digest('hex');
}

function collect(directory = root, depth = 0) {
  const out = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (excludedAnywhere.has(entry.name)) continue;
    if (depth === 0 && excludedTopLevel.has(entry.name)) continue;
    if (depth === 0 && excludedFiles.has(entry.name)) continue;
    if (depth === 0 && excludedTopLevelFilePatterns.some((pattern) => pattern.test(entry.name))) continue;
    const absolute = path.join(directory, entry.name);
    const stat = lstatSync(absolute);
    if (stat.isSymbolicLink()) {
      throw new Error(`Symlink is not allowed in sealed source baseline: ${path.relative(root, absolute)}`);
    }
    if (stat.isFile() && excludedFilePatterns.some((pattern) => pattern.test(entry.name))) continue;
    if (stat.isDirectory()) {
      out.push(...collect(absolute, depth + 1));
    } else if (stat.isFile()) {
      out.push(path.relative(root, absolute).split(path.sep).join('/'));
    } else {
      throw new Error(`Unsupported source filesystem entry: ${path.relative(root, absolute)}`);
    }
  }
  return out.sort((a, b) => a.localeCompare(b));
}

function expectedManifestRows(tree) {
  return [
    ...tree.map((relative) => ({
      path: `./${relative}`,
      sha256: sha256(path.join(root, relative), relative),
    })),
    { path: './repository-tree.txt', sha256: sha256(treePath) },
  ];
}

function parseManifest() {
  const rows = [];
  for (const [index, raw] of readFileSync(manifestPath, 'utf8').split(/\r?\n/).entries()) {
    if (!raw) continue;
    const match = /^([a-f0-9]{64})  (\.\/.+)$/.exec(raw);
    if (!match) throw new Error(`Invalid manifest row ${index + 1}: ${raw}`);
    rows.push({ sha256: match[1], path: match[2] });
  }
  return rows;
}

function generate() {
  const tree = collect();
  writeFileSync(treePath, `${tree.join('\n')}\n`);
  const rows = expectedManifestRows(tree);
  writeFileSync(manifestPath, rows.map((row) => `${row.sha256}  ${row.path}`).join('\n') + '\n');
  console.log(`GENERATED repository-tree.txt: ${tree.length} source paths`);
  console.log(`GENERATED BASELINE-MANIFEST.sha256: ${rows.length} entries`);
}

function verify() {
  const expectedTree = collect();
  const observedTree = readFileSync(treePath, 'utf8').split(/\r?\n/).filter(Boolean);
  if (new Set(observedTree).size !== observedTree.length) throw new Error('repository-tree.txt contains duplicate paths');
  if (JSON.stringify(observedTree) !== JSON.stringify(expectedTree)) {
    const expected = new Set(expectedTree);
    const observed = new Set(observedTree);
    const missing = expectedTree.filter((item) => !observed.has(item));
    const stale = observedTree.filter((item) => !expected.has(item));
    throw new Error(`repository-tree.txt does not match source set (missing=${missing.join(', ') || 'none'}; stale=${stale.join(', ') || 'none'})`);
  }

  const expectedRows = expectedManifestRows(expectedTree);
  const observedRows = parseManifest();
  const seen = new Set();
  for (const row of observedRows) {
    if (seen.has(row.path)) throw new Error(`Duplicate manifest path: ${row.path}`);
    seen.add(row.path);
  }
  if (observedRows.length !== expectedRows.length) {
    throw new Error(`Manifest entry count mismatch: expected ${expectedRows.length}, got ${observedRows.length}`);
  }
  for (let index = 0; index < expectedRows.length; index += 1) {
    const expected = expectedRows[index];
    const observed = observedRows[index];
    if (observed.path !== expected.path || observed.sha256 !== expected.sha256) {
      throw new Error(`Manifest mismatch at row ${index + 1}: expected ${expected.sha256}  ${expected.path}`);
    }
  }
  console.log(`PASS  repository-tree exact source set: ${expectedTree.length}/${expectedTree.length}`);
  console.log(`PASS  baseline manifest exact hash set: ${expectedRows.length}/${expectedRows.length}`);
}

if (mode === 'generate') generate();
else if (mode === 'verify') verify();
else {
  console.error('Usage: node scripts/manage-baseline-manifest.mjs <generate|verify>');
  process.exit(2);
}

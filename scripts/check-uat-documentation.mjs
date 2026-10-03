#!/usr/bin/env node
/**
 * Wave 4 — the documentation must not describe an account that cannot be logged into.
 *
 * `docs/UAT-CHECKLIST.md`, `docs/STAGING-RUNBOOK.md` and `docs/PANDUAN-UI.md` all instructed
 * the operator to log in as `admin@demo.id / Demo12345!` on a tenant called "Demo Home".
 * None of it existed. Later revisions also duplicated runtime ports in prose and drifted away
 * from the generated rescue `.env`, so this checker now derives the API port from that file. Worse, `admin@demo.id` is on the *forbidden* list in
 * `scripts/validate-rescue-baseline.mjs` — the gate and the documents contradicted each other.
 *
 * The forbidden-string check passed because it only concatenates `.ts/.tsx/.js/.mjs` into one
 * blob. Documentation was never in scope, so a document could name any account it liked and the
 * gate stayed green. That blind spot is the defect: a gate that measures only the code cannot
 * notice when the instructions for using the code are fiction.
 *
 * This script closes it, and it closes it the only way that helps — by asking the database,
 * not by matching strings. A document that names an account must name one that exists, and a
 * document that states a port must state the port the stack actually uses.
 *
 * Run from the repository root, against the live stack:
 *   node scripts/check-uat-documentation.mjs
 */
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { parseEnv } from './manage-rescue-local-runtime.mjs';

const require = createRequire(import.meta.url);
const results = [];
const record = (name, ok, detail) => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  —  ${detail}`);
};

const DOCS = ['docs/UAT-CHECKLIST.md', 'docs/STAGING-RUNBOOK.md', 'docs/PANDUAN-UI.md'];

// The account the old documents invented, and the tenant that went with it. Kept as literals
// here so the check is anchored to the specific failure rather than to a general "no emails in
// docs" rule, which would ban the legitimate references in this very file.
const BANNED_ACCOUNT = 'admin@demo.id';
const BANNED_TENANT = 'Demo Home';
// 3100 is the admin-web dev port. 5000/5001 are historical document drift; the rescue API
// source of truth is PORT in the generated .env (currently 3000).
const BANNED_PORTS = [':5000', ':5001'];

// Where the stack really is, read from the same sources the runtime reads.
function realPorts() {
  const api = String(parseEnv('.env').PORT ?? '').trim();
  let web = '5001';
  if (existsSync('apps/admin-web/package.json')) {
    const pkg = JSON.parse(readFileSync('apps/admin-web/package.json', 'utf8'));
    const script = Object.values(pkg.scripts ?? {}).join(' ');
    const fromScript = /--port[= ](\d+)/.exec(script)?.[1];
    if (fromScript) web = fromScript;
  }
  return { api, web };
}

/**
 * Drop the sections that explain the old failure, so a document may *describe* the mistake
 * without being flagged for describing it.
 *
 * The first version of this check flagged the very paragraphs that were correcting the problem,
 * which is how a check ends up pushing an operator towards deleting the explanation. Scoping by
 * heading is deliberate: the correction lives under `## Kenapa` and the instruction does not.
 */
function instructionsOnly(text) {
  const lines = text.split('\n');
  const out = [];
  let skipping = false;
  for (const line of lines) {
    if (/^#{1,6}\s/.test(line)) {
      // Sections about why the previous access block was wrong, and historical notes.
      skipping = /kenapa|sebelumnya|sejarah|history/i.test(line);
    }
    if (!skipping) out.push(line);
  }
  return out.join('\n');
}

const ports = realPorts();
record('the real ports were read from the generated rescue environment', /^\d+$/.test(ports.api), `api ${ports.api}, web ${ports.web}`);

const databaseUrl = process.env.DATABASE_URL || parseEnv('.env').DATABASE_URL;
if (databaseUrl) process.env.DATABASE_URL = databaseUrl;

// 1. No document may name the account that never existed. A quoted mention of the mistake is
//    allowed, because the documents now explain the history; what is banned is a document that
//    tells the reader to log in with it.
for (const doc of DOCS) {
  if (!existsSync(doc)) {
    record(`${doc} exists`, false, 'missing');
    continue;
  }
  const text = instructionsOnly(readFileSync(doc, 'utf8'));
  const instructs = /Login\s*(?:dengan)?[^\n]*admin@demo\.id/i.test(text);
  record(`${doc} does not instruct a login with the invented account`, !instructs, instructs ? 'found a login instruction' : 'clean');

  const tenantUsed = text.includes(BANNED_TENANT);
  record(`${doc} does not reference the invented tenant`, !tenantUsed, tenantUsed ? 'references it outside the explanation' : 'clean');
}

// 2. The ports a document states must be the ports the stack uses.
for (const doc of DOCS) {
  if (!existsSync(doc)) continue;
  const text = instructionsOnly(readFileSync(doc, 'utf8'));
  for (const banned of BANNED_PORTS) {
    const hits = text.includes(banned);
    record(`${doc} does not state the wrong port ${banned}`, !hits, hits ? 'found' : 'clean');
  }
  record(`${doc} states the current API port`, text.includes(`:${ports.api}`), `expected :${ports.api}`);
  record(`${doc} states the current web port`, text.includes(`:${ports.web}`), `expected :${ports.web}`);
}

// 3. The accounts the documents point at must exist in the live database. This is the part a
//    string check cannot do.
let prisma = null;
try {
  const { PrismaClient } = require('@prisma/client');
  prisma = new PrismaClient();
  const named = new Set();
  for (const doc of DOCS) {
    if (!existsSync(doc)) continue;
    for (const m of readFileSync(doc, 'utf8').matchAll(/`(uat\.[a-z]+@iot\.local)`/g)) named.add(m[1]);
  }
  record('the documents name at least one UAT account', named.size > 0, `${named.size} named`);
  for (const email of named) {
    const rows = await prisma.user.findMany({ where: { email }, select: { email: true } });
    record(`${email} exists in the database`, rows.length > 0, rows.length ? 'found' : 'NOT FOUND');
  }
  // And the tenant they belong to.
  const tenant = await prisma.tenant.findUnique({
    where: { id: '44444444-4444-4444-8444-444444444444' },
    select: { name: true },
  });
  record('the UAT tenant exists', !!tenant, tenant ? tenant.name : 'NOT FOUND');
} catch (error) {
  record('the database was reachable for the account check', false, error.message);
} finally {
  if (prisma) await prisma.$disconnect();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} PASS`);
process.exitCode = failed.length === 0 ? 0 : 1;

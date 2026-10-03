#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const shellPath = path.join(root, 'apps/user-web/components/user-shell.tsx');
const shell = readFileSync(shellPath, 'utf8');
const required = [
  ['/beranda', 'Beranda'],
  ['/ruangan', 'Ruangan'],
  ['/perangkat-saya', 'Perangkat Saya'],
  ['/realtime', 'Realtime'],
  ['/dashboard', 'Dashboard'],
  ['/alerts', 'Alerts'],
  ['/profil', 'Profil'],
];

function fail(message) { throw new Error(message); }
function navHrefs(text) {
  return [...text.matchAll(/\{\s*href:\s*'([^']+)'\s*,\s*label:\s*'([^']+)'/g)].map((match) => [match[1], match[2]]);
}
function validate(text) {
  const actual = navHrefs(text);
  const hrefs = new Set(actual.map(([href]) => href));
  for (const [href, label] of required) {
    if (!hrefs.has(href)) fail(`User Web navigation is missing ${label} (${href})`);
    const page = href === '/perangkat-saya' ? 'apps/user-web/app/perangkat-saya/page.tsx' : `apps/user-web/app${href}/page.tsx`;
    if (!existsSync(path.join(root, page))) fail(`Navigation target has no page: ${page}`);
  }
  if (actual.length !== required.length) fail(`User Web top-level navigation must have exactly ${required.length} governed entries; found ${actual.length}`);
}

validate(shell);
console.log('PASS  User Web has exactly seven governed top-level menu entries with real pages');

for (const rel of ['apps/user-web/app/api/alerts/route.ts','apps/user-web/app/api/profile/route.ts','apps/user-web/app/api/realtime/[deviceId]/route.ts']) {
  if (!existsSync(path.join(root, rel))) fail(`required User Web BFF route missing: ${rel}`);
}
const alertsBackend = readFileSync(path.join(root, 'src/analytics/accessible-analytics.controller.ts'), 'utf8');
const realtimeBackend = readFileSync(path.join(root, 'src/telemetry/telemetry-stream.controller.ts'), 'utf8');
const profileBackend = readFileSync(path.join(root, 'src/users/users.controller.ts'), 'utf8');
if (!alertsBackend.includes("@Controller('analytics/alerts')") || !alertsBackend.includes("@Get('accessible')")) fail('Alerts menu is not backed by the accessible analytics endpoint');
if (!realtimeBackend.includes("@Sse('stream')") || !realtimeBackend.includes("@RequireDeviceAccess('VIEW')")) fail('Realtime menu is not backed by VIEW-guarded SSE');
if (!profileBackend.includes("@Get('profile')") || !profileBackend.includes("@Post('profile')")) fail('Profile menu is not backed by GET/POST profile endpoints');
console.log('PASS  Realtime, Alerts and Profile surfaces are backed by the intended backend contracts');

let mutationRejected = false;
try { validate(shell.replace(/\n\s*\{ href: '\/dashboard'[^\n]+/, '')); } catch { mutationRejected = true; }
if (!mutationRejected) fail('navigation mutation test failed: deleting Dashboard still passed');
console.log('PASS  Navigation completeness fails closed when a governed menu entry is removed');
console.log('USER WEB NAVIGATION SELF-TEST PASS');

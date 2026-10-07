import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';

const root = process.cwd();
const census = readFileSync(join(root, 'docs/BACKEND-FRONTEND-SURFACE-CENSUS.md'), 'utf8');

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...walk(path));
    else out.push(path);
  }
  return out;
}

const controllers = walk(join(root, 'src'))
  .filter((path) => path.endsWith('.controller.ts'))
  .sort();

function endpointCount(source: string): number {
  return [...source.matchAll(/@(Get|Post|Put|Patch|Delete|Sse)\((?:'[^']*'|"[^"]*")?\)/g)].length;
}

describe('backend ↔ frontend surface census', () => {
  it('accounts for every backend controller and every current HTTP/SSE endpoint', () => {
    expect(controllers).toHaveLength(46);
    const total = controllers.reduce((sum, path) => sum + endpointCount(readFileSync(path, 'utf8')), 0);
    expect(total).toBe(197);
    expect(census).toContain('46 controller files / 197 HTTP-or-SSE endpoints');

    for (const path of controllers) {
      const name = relative(join(root, 'src'), path).split('/').pop() as string;
      expect(census).toContain(`\`${name}\``);
    }
  });

  it('classifies machine endpoints instead of demanding fake menu entries', () => {
    for (const route of ['/health*', '/metrics', '/mqtt/*', '/v1/*', '/users/tenant-context']) {
      expect(census).toContain(route);
    }
    expect(census).toContain('MACHINE_ONLY');
  });

  it('keeps known partial frontend surfaces quarantined rather than calling them production-ready', () => {
    for (const route of ['/noc', '/cctv', '/technician', '/mobile-preview']) {
      expect(census).toContain(`\`${route}\``);
    }
    expect(census).toContain('QUARANTINE');
  });

  it('records the only known legacy user-directory route as a cleanup candidate', () => {
    expect(census).toContain('`GET /admin/users`');
    expect(census).toContain('LEGACY');
  });
});

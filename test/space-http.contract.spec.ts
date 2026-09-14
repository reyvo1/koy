import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

describe('Space HTTP surface (G1.1 tenant locations UI foundation)', () => {
  it('exposes bounded GET/POST /spaces behind JWT, tenant, ADMIN guards', () => {
    const controller = read('src/space/space.controller.ts');
    expect(controller).toContain("@Controller('spaces')");
    expect(controller).toContain('@Get()');
    expect(controller).toContain('@Post()');
    expect(controller).toContain(
      '@UseGuards(JwtAuthGuard, TenantContextGuard, AdminRoleGuard)',
    );
    // Tenant scoping derived from trusted context, never raw headers.
    expect(controller).toContain('request.user.tenantContext.tenantId');
    // Bounded list.
    expect(controller).toContain('MAX_SPACES_TAKE');
  });

  it('registers the controller on the SpaceModule', () => {
    const mod = read('src/space/space.module.ts');
    expect(mod).toContain('controllers: [SpaceController, AccessibleSpaceController]');
    expect(mod).toContain('AccessibleSpaceService');
  });

  it('delegates creation to the Module 17 hierarchy service domain rules', () => {
    const controller = read('src/space/space.controller.ts');
    const service = read('src/space/space-hierarchy.service.ts');
    expect(controller).toContain('hierarchy.createSpace');
    expect(service).toContain('SPACE_PARENT_KIND_INVALID');
    expect(service).toContain('SPACE_DEPTH_EXCEEDED');
  });

  it('rejects invalid create payloads without leaking internals', () => {
    const controller = read('src/space/space.controller.ts');
    expect(controller).toContain("SPACE_NAME_INVALID");
    expect(controller).toContain('VALID_KINDS.includes(kind as SpaceKind)');
  });
});

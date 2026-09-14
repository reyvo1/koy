import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

describe('G1.9 firmware/OTA live screen', () => {
  it('backend exposes bounded firmware + rollout endpoint', () => {
    const controller = read(
      'src/admin-operations/admin-billing-directory.controller.ts',
    );
    expect(controller).toContain("@Get('firmware')");
    expect(controller).toContain('firmwareArtifact.findMany');
    expect(controller).toContain('otaRollout.findMany');
    // Full hash never leaves the backend — prefix only.
    expect(controller).toContain('sha256Prefix');
  });

  it('firmware page renders live content via proxy, demo rows removed', () => {
    const page = read('apps/admin-web/app/super/firmware/page.tsx');
    expect(page).toContain('SuperFirmwareContent');
    const route = read('apps/admin-web/app/api/super/firmware/route.ts');
    expect(route).toContain("client.request('/admin/firmware')");
    const content = read('apps/admin-web/components/super-firmware-content.tsx');
    expect(content).not.toContain("id: 'fw-1'");
  });
});

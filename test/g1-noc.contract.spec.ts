import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

describe('G1.13 NOC / Control Room live', () => {
  it('NOC page renders live tiles + stream, placeholder dashes removed', () => {
    const page = read('apps/admin-web/app/noc/page.tsx');
    expect(page).toContain('NocContent');
    const content = read('apps/admin-web/components/noc-content.tsx');
    expect(content).toContain('/api/admin/operational-summary');
    expect(content).toContain('/api/admin/telemetry-stream?deviceId=');
    expect(content).not.toContain("'—', '🟢']");
  });
});

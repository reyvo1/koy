import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '..');
const read = (relativePath: string): string =>
  readFileSync(resolve(root, relativePath), 'utf8');

describe('Module 09 completion review contract', () => {
  it('records the completed capability and validation evidence', () => {
    const review = read('docs/module-09-completion-review.md');

    expect(review).toContain('207894e');
    expect(review).toContain('114 checks with 0 failures');
    expect(review).toContain('12 focused Module 09 suites with 140 tests');
    expect(review).toContain('70 full Jest suites with 530 tests');
    expect(review).toContain(
      'isolated PostgreSQL integration: 2 suites with 5 tests',
    );
    expect(review).toContain(
      'runner-owned MQTT workflow integration: 1 suite with 3 tests',
    );
    expect(review).toContain('Fastify E2E: 1 suite with 4 tests');
    expect(review).toContain('currentModule` is `null`');
    expect(review).toContain('lastCompletedModule` is `9`');
  });

  it('retains architecture safety boundaries in immutable completion evidence', () => {
    const review = read('docs/module-09-completion-review.md');

    expect(review).toContain(
      'does not change application runtime behavior, Prisma schema or migrations',
    );
    expect(review).toContain('Module 10 remains inactive');
  });
});

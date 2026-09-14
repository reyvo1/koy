import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '..');
const read = (relativePath: string): string =>
  readFileSync(resolve(root, relativePath), 'utf8');

describe('Module 09 source-of-truth reconciliation contract', () => {
  it('records reconciliation in immutable Module 09 completion evidence', () => {
    const completion = read('docs/module-09-completion-review.md');

    expect(completion).toContain(
      'reconciled and test-protected Module 09 source-of-truth documentation',
    );
    expect(completion).toContain(
      'Module 10 remains inactive until this completion-review commit is green remotely',
    );
  });
});

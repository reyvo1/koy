import { readFileSync } from 'node:fs';

const readSummary = (path: string): string => readFileSync(path, 'utf8');
const currentDocuments = ['docs/project-state.md', 'docs/roadmap.md'];
const aliases = currentDocuments;
for (const documentPath of aliases) {
  const content = readSummary(documentPath);
  expect(content).toMatch(/historical checkpoint/i);
}

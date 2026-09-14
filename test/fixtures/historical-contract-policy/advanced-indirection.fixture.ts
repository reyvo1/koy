import * as fileSystem from 'node:fs';

const directory = 'docs';
const fileName = 'project-state.md';
const summaryPath = `${directory}/${fileName}`;
const readSummary = (path: string): string =>
  fileSystem.readFileSync(path, 'utf8');
const summary = readSummary(summaryPath);
expect(summary).toMatch(/commit 850c3de5171dea4cd07a135de46078ff521d3ef9/i);

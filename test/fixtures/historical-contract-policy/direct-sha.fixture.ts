import { readFileSync } from 'node:fs';

const projectState = readFileSync('docs/project-state.md', 'utf8');
expect(projectState).toContain('850c3de5171dea4cd07a135de46078ff521d3ef9');

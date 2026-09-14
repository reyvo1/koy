import { readRepositoryText } from './imported-reader-helper';

const content = readRepositoryText('docs/project-state.md');
expect(content).toContain('historical evidence');

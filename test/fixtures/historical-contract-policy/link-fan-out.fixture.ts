import { readFileSync } from 'node:fs';

const read = (path: string): string => readFileSync(path, 'utf8');
const summaries = ['docs/project-state.md', 'docs/roadmap.md'].map(read).join('\n');
expect(summaries).toContain('docs/telemetry-storage-strategy.md');

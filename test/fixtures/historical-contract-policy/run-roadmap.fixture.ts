import { readFileSync } from 'node:fs';

const roadmap = readFileSync('docs/roadmap.md', 'utf8');
expect(roadmap).toContain('30560593208');

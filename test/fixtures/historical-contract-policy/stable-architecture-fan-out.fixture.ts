import { readFileSync } from 'node:fs';

const architecture = readFileSync('docs/architecture.md', 'utf8');
expect(architecture).toContain('historical slice checkpoint sentence');

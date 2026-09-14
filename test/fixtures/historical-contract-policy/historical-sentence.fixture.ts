import { readFileSync } from 'node:fs';

const summary = readFileSync('docs/project-state.md', 'utf8');
expect(summary).toContain('MQTT Production Transport Implementation completed');

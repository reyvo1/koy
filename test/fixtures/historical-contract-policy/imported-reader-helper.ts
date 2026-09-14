import { readFileSync } from 'node:fs';

export const readRepositoryText = (relativePath: string): string =>
  readFileSync(relativePath, 'utf8');

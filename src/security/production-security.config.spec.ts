import { ConfigService } from '@nestjs/config';
import {
  defaultCorsAllowedOrigins,
  parseCorsAllowedOrigins,
  resolveCorsAllowedOrigins,
} from './production-security.config';

describe('production security configuration', () => {
  it('parses and deduplicates exact HTTP origins', () => {
    expect(
      parseCorsAllowedOrigins(
        'https://app.example.com, https://admin.example.com,https://app.example.com',
      ),
    ).toEqual(['https://app.example.com', 'https://admin.example.com']);
  });

  it.each([
    '*',
    'https://app.example.com/path',
    'https://user:secret@app.example.com',
    'ftp://app.example.com',
    'not-an-origin',
  ])('rejects unsafe CORS origin value %s', (origin) => {
    expect(() => parseCorsAllowedOrigins(origin)).toThrow();
  });

  it('keeps production CORS explicit while supporting local development', () => {
    expect(defaultCorsAllowedOrigins('production')).toBe('');
    expect(
      parseCorsAllowedOrigins(defaultCorsAllowedOrigins('development')),
    ).toEqual(
      expect.arrayContaining([
        'http://localhost:3000',
        'http://127.0.0.1:3000',
      ]),
    );
  });

  it('resolves the validated allowlist through ConfigService', () => {
    const configService = {
      getOrThrow: jest.fn(() => 'https://app.example.com'),
    } as unknown as ConfigService;

    expect(resolveCorsAllowedOrigins(configService)).toEqual([
      'https://app.example.com',
    ]);
  });
});

import { parseCapabilityValue } from '../../packages/sdk/src/capability-value';
describe('shared typed capability values', () => {
  it.each([
    ['boolean', 'false', false],
    ['integer', '0', 0],
    ['number', '1.25', 1.25],
    ['string', 'lamp', 'lamp'],
    ['object', '{"level":0}', { level: 0 }],
  ])('preserves %s JSON type', (dataType, raw, value) => {
    expect(parseCapabilityValue(raw, { dataType })).toEqual({
      ok: true,
      value,
    });
  });
  it.each([
    ['boolean', 'yes'],
    ['integer', '2.5'],
    ['integer', '9007199254740993'],
    ['number', 'Infinity'],
    ['number', ''],
    ['object', 'null'],
    ['object', '[]'],
    ['object', '{'],
    ['script', 'anything'],
  ])('rejects unsafe %s %s', (dataType, raw) => {
    expect(parseCapabilityValue(raw, { dataType }).ok).toBe(false);
  });
  it('enforces numeric range and precision without silently rounding', () => {
    const cap = {
      dataType: 'number',
      constraints: { min: 0, max: 10, precision: 2 },
    };
    expect(parseCapabilityValue('10.01', cap).ok).toBe(false);
    expect(parseCapabilityValue('-1', cap).ok).toBe(false);
    expect(parseCapabilityValue('1.234', cap).ok).toBe(false);
    expect(parseCapabilityValue('1.23', cap).ok).toBe(true);
  });
  it('returns the canonical enum primitive', () => {
    const cap = {
      dataType: 'enum',
      constraints: { enumValues: [0, 'auto', false] },
    };
    expect(parseCapabilityValue('0', cap)).toEqual({ ok: true, value: 0 });
    expect(parseCapabilityValue('false', cap)).toEqual({
      ok: true,
      value: false,
    });
    expect(parseCapabilityValue('other', cap).ok).toBe(false);
  });
  it('bounds payload size before JSON parsing', () => {
    expect(
      parseCapabilityValue('x'.repeat(16385), { dataType: 'string' }).ok,
    ).toBe(false);
  });
});

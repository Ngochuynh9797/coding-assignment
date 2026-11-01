import { Decimal } from 'decimal.js';
import { normalizeUnitCode, SUPPORTED_UNIT_CODES, WEIGHT_UNITS } from './unit.registry';

describe('WEIGHT_UNITS invariants', () => {
  it('has unique codes', () => {
    const codes = WEIGHT_UNITS.map((u) => u.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('has aliases that collide with no code and no other alias', () => {
    const names = WEIGHT_UNITS.flatMap((u) => [u.code, ...u.aliases]);
    expect(new Set(names).size).toBe(names.length);
  });

  it('uses lowercase codes and aliases', () => {
    for (const name of WEIGHT_UNITS.flatMap((u) => [u.code, ...u.aliases])) {
      expect(name).toBe(name.toLowerCase());
    }
  });

  it.each(WEIGHT_UNITS)('$code has a positive kgPerUnit', ({ kgPerUnit }) => {
    expect(new Decimal(kgPerUnit).gt(0)).toBe(true);
  });

  it('derives SUPPORTED_UNIT_CODES from the registry', () => {
    expect(SUPPORTED_UNIT_CODES).toEqual(WEIGHT_UNITS.map((u) => u.code));
  });
});

describe('normalizeUnitCode', () => {
  it.each([
    [' LBS ', 'lb'],
    ['Kg', 'kg'],
    ['pounds', 'lb'],
    ['stn', 'stn'],
    [' STN ', 'stn'],
  ])('maps %p to %p', (input, expected) => {
    expect(normalizeUnitCode(input)).toBe(expected);
  });

  it.each([null, undefined, 5])('returns non-string %p unchanged', (input) => {
    expect(normalizeUnitCode(input)).toBe(input);
  });
});

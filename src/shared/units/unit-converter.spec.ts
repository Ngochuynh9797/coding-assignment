import { Decimal } from 'decimal.js';
import { roundForOutput, UnitConverter } from './unit-converter';
import { WEIGHT_UNITS, type WeightUnitDef } from './unit.registry';

const def = (code: string, kgPerUnit: string, aliases: string[] = []): WeightUnitDef => ({
  code,
  kgPerUnit,
  aliases,
  reference: { value: '1', kg: kgPerUnit },
});

describe('UnitConverter', () => {
  const converter = new UnitConverter(WEIGHT_UNITS);

  it.each(WEIGHT_UNITS)('converts the $code reference value to its expected kg', (unit) => {
    const kg = converter.toStoredKg(new Decimal(unit.reference.value), unit.code);
    expect(kg.eq(new Decimal(unit.reference.kg).toDecimalPlaces(4, Decimal.ROUND_HALF_UP))).toBe(
      true,
    );
  });

  it('rounds stored kg to 4 decimal places half-up', () => {
    expect(converter.toStoredKg(new Decimal(225), 'lb').toFixed()).toBe('102.0583');
  });

  it('exposes the registry codes', () => {
    for (const unit of WEIGHT_UNITS) {
      expect(converter.isSupported(unit.code)).toBe(true);
    }
    expect(converter.supportedCodes()).toEqual(WEIGHT_UNITS.map((u) => u.code));
    expect(converter.isSupported('stn')).toBe(false);
  });

  it('does not treat aliases as codes', () => {
    expect(converter.isSupported('lbs')).toBe(false);
  });

  it('converts kg to a target unit without rounding', () => {
    expect(converter.fromKg(new Decimal('45.359237'), 'lb').toFixed()).toBe('100');
  });

  it('throws on a unit that is not in the registry', () => {
    expect(() => converter.toStoredKg(new Decimal(1), 'stn')).toThrow(/stn/);
    expect(() => converter.fromKg(new Decimal(1), 'stn')).toThrow(/stn/);
  });

  describe('convertForOutput', () => {
    const lbSet = { weight: new Decimal(225), unit: 'lb', weightKg: new Decimal('102.0583') };

    it('returns the original weight exactly when the unit matches', () => {
      expect(converter.convertForOutput(lbSet, 'lb').toFixed()).toBe('225');
    });

    it('converts from the original weight, not from the rounded weightKg', () => {
      expect(converter.convertForOutput(lbSet, 'kg').toFixed()).toBe('102.05828325');
    });

    it('converts kg to lb', () => {
      const kgSet = { weight: new Decimal(100), unit: 'kg', weightKg: new Decimal(100) };
      expect(converter.convertForOutput(kgSet, 'lb').toDecimalPlaces(6).toFixed()).toBe(
        '220.462262',
      );
    });

    // A registry without the set's unit stands for a unit that was removed after the set was stored.
    it('falls back to weightKg when the original unit is no longer in the registry', () => {
      const kgOnly = new UnitConverter([def('kg', '1')]);
      const stoneSet = { weight: new Decimal(1), unit: 'stone', weightKg: new Decimal('6.3503') };
      expect(kgOnly.convertForOutput(stoneSet, 'kg').toFixed()).toBe('6.3503');
    });
  });

  it('supports a new unit through the injected registry alone', () => {
    const withStone = new UnitConverter([def('kg', '1'), def('stone', '6.35029318', ['st'])]);
    expect(withStone.toStoredKg(new Decimal(1), 'stone').toFixed()).toBe('6.3503');
  });

  describe('registry validation', () => {
    it.each<[string, WeightUnitDef[]]>([
      ['duplicate code', [def('kg', '1'), def('kg', '2')]],
      ['alias equal to another code', [def('kg', '1'), def('lb', '0.45', ['kg'])]],
      ['alias shared by two units', [def('kg', '1', ['k']), def('lb', '0.45', ['k'])]],
      ['uppercase code', [def('KG', '1')]],
      ['uppercase alias', [def('kg', '1', ['KGS'])]],
      ['zero factor', [def('kg', '0')]],
      ['negative factor', [def('kg', '-1')]],
    ])('throws on %s', (_, defs) => {
      expect(() => new UnitConverter(defs)).toThrow();
    });
  });
});

describe('roundForOutput', () => {
  it.each([
    ['102.05828325', 102.06],
    ['220.4622621848', 220.46],
    ['0.005', 0.01],
    ['225', 225],
  ])('rounds %s to %p', (input, expected) => {
    expect(roundForOutput(new Decimal(input))).toBe(expected);
  });
});

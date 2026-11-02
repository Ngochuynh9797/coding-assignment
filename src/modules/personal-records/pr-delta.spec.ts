import { Decimal } from 'decimal.js';
import { UnitConverter } from '@shared/units/unit-converter';
import { WEIGHT_UNITS } from '@shared/units/unit.registry';
import { prDelta } from './pr-delta';

const converter = new UnitConverter(WEIGHT_UNITS);
const kg = (value: string) => new Decimal(value);

describe('prDelta', () => {
  it('compares two values: absolute difference, percent to 1 decimal, improved', () => {
    expect(prDelta(kg('105'), kg('102.5'), 'kg', converter)).toEqual({
      absolute: 2.5,
      percent: 2.4,
      improved: true,
    });
  });

  it('reports a decrease as negative and not improved', () => {
    expect(prDelta(kg('100'), kg('120'), 'kg', converter)).toEqual({
      absolute: -20,
      percent: -16.7,
      improved: false,
    });
  });

  it('reports an equal value as zero change and not improved', () => {
    expect(prDelta(kg('900'), kg('900'), 'kg', converter)).toEqual({
      absolute: 0,
      percent: 0,
      improved: false,
    });
  });

  it('rounds the percent half up', () => {
    expect(prDelta(kg('100.05'), kg('100'), 'kg', converter).percent).toBe(0.1);
  });

  it('converts the absolute difference to the requested unit; percent does not depend on it', () => {
    // 225 lb vs 220 lb as stored in kg.
    expect(prDelta(kg('102.0583'), kg('99.7903'), 'lb', converter)).toEqual({
      absolute: 5,
      percent: 2.3,
      improved: true,
    });
  });

  it('is improved without numbers when only the current period has a value', () => {
    expect(prDelta(kg('100'), null, 'kg', converter)).toEqual({
      absolute: null,
      percent: null,
      improved: true,
    });
  });

  it('is not improved without numbers when only the previous period has a value', () => {
    expect(prDelta(null, kg('100'), 'kg', converter)).toEqual({
      absolute: null,
      percent: null,
      improved: false,
    });
  });

  it('is all null when neither period has a value', () => {
    expect(prDelta(null, null, 'kg', converter)).toEqual({
      absolute: null,
      percent: null,
      improved: null,
    });
  });
});

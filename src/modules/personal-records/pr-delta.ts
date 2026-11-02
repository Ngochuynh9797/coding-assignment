import { Decimal } from 'decimal.js';
import { roundForOutput, type UnitConverter } from '@shared/units/unit-converter';

export interface PrDelta {
  absolute: number | null;
  percent: number | null;
  improved: boolean | null;
}

const PERCENT_SCALE = 1;

// Inputs are kg values with bodyweight already mapped to null (recordValueKg), so previous is never 0.
// The difference is taken in kg and converted once, so both periods share the same rounding.
export function prDelta(
  currentKg: Decimal | null,
  previousKg: Decimal | null,
  unit: string,
  converter: UnitConverter,
): PrDelta {
  if (currentKg === null || previousKg === null) {
    const improved = currentKg !== null ? true : previousKg !== null ? false : null;
    return { absolute: null, percent: null, improved };
  }
  const diffKg = currentKg.minus(previousKg);
  return {
    absolute: roundForOutput(converter.fromKg(diffKg, unit)),
    percent: diffKg
      .div(previousKg)
      .times(100)
      .toDecimalPlaces(PERCENT_SCALE, Decimal.ROUND_HALF_UP)
      .toNumber(),
    improved: currentKg.gt(previousKg),
  };
}

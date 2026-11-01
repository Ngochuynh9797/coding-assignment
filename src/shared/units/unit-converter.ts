import { Inject, Injectable } from '@nestjs/common';
import { Decimal } from 'decimal.js';
import { WEIGHT_UNITS_TOKEN, type WeightUnitDef } from './unit.registry';

export interface StoredWeight {
  weight: Decimal;
  unit: string;
  weightKg: Decimal;
}

// Matches the scale of workout_sets.weight_kg (NUMERIC(10,4)).
const STORED_KG_SCALE = 4;
const OUTPUT_SCALE = 2;

@Injectable()
export class UnitConverter {
  private readonly factors = new Map<string, Decimal>();

  constructor(@Inject(WEIGHT_UNITS_TOKEN) defs: readonly WeightUnitDef[]) {
    const names = new Set<string>();
    for (const def of defs) {
      for (const name of [def.code, ...def.aliases]) {
        if (name !== name.toLowerCase()) {
          throw new Error(`Unit name '${name}' must be lowercase`);
        }
        if (names.has(name)) {
          throw new Error(`Unit name '${name}' is declared more than once`);
        }
        names.add(name);
      }
      const factor = new Decimal(def.kgPerUnit);
      if (factor.lte(0)) {
        throw new Error(`Unit '${def.code}' must have a positive kgPerUnit`);
      }
      this.factors.set(def.code, factor);
    }
  }

  supportedCodes(): string[] {
    return [...this.factors.keys()];
  }

  isSupported(code: string): boolean {
    return this.factors.has(code);
  }

  toStoredKg(weight: Decimal, unit: string): Decimal {
    return weight
      .times(this.factorOf(unit))
      .toDecimalPlaces(STORED_KG_SCALE, Decimal.ROUND_HALF_UP);
  }

  fromKg(kg: Decimal, target: string): Decimal {
    return kg.div(this.factorOf(target));
  }

  // Converting from the original weight avoids carrying the 4-decimal storage rounding into the output.
  convertForOutput(src: StoredWeight, target: string): Decimal {
    if (src.unit === target) {
      return src.weight;
    }
    const sourceFactor = this.factors.get(src.unit);
    if (!sourceFactor) {
      return this.fromKg(src.weightKg, target);
    }
    return src.weight.times(sourceFactor).div(this.factorOf(target));
  }

  private factorOf(code: string): Decimal {
    const factor = this.factors.get(code);
    if (!factor) {
      throw new Error(`Unsupported unit '${code}'`);
    }
    return factor;
  }
}

export function roundForOutput(value: Decimal): number {
  return value.toDecimalPlaces(OUTPUT_SCALE, Decimal.ROUND_HALF_UP).toNumber();
}

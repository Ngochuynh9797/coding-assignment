export interface WeightUnitDef {
  code: string;
  // A string so Decimal receives the exact factor, with no float rounding on the way in.
  kgPerUnit: string;
  aliases: readonly string[];
  reference: { value: string; kg: string };
}

// Append-only: stored rows keep their original unit, so removing an entry would orphan them.
export const WEIGHT_UNITS: readonly WeightUnitDef[] = [
  {
    code: 'kg',
    kgPerUnit: '1',
    aliases: ['kgs', 'kilogram', 'kilograms'],
    reference: { value: '1', kg: '1' },
  },
  {
    code: 'lb',
    kgPerUnit: '0.45359237',
    aliases: ['lbs', 'pound', 'pounds'],
    reference: { value: '100', kg: '45.359237' },
  },
];

export const SUPPORTED_UNIT_CODES: string[] = WEIGHT_UNITS.map((u) => u.code);

function baseUnitCode(): string {
  const base = WEIGHT_UNITS.find((u) => u.kgPerUnit === '1');
  if (!base) {
    throw new Error("The unit registry has no base unit (kgPerUnit '1')");
  }
  return base.code;
}

// The unit stored values are normalized to; used where an output unit must not depend on the input.
export const BASE_UNIT_CODE: string = baseUnitCode();

export const WEIGHT_UNITS_TOKEN = Symbol('WEIGHT_UNITS');

const CODE_BY_NAME = new Map(
  WEIGHT_UNITS.flatMap((u) => [u.code, ...u.aliases].map((name) => [name, u.code] as const)),
);

// Unknown strings are returned trimmed and lowercased so @IsIn reports the value the user meant.
export function normalizeUnitCode(input: unknown): unknown {
  if (typeof input !== 'string') {
    return input;
  }
  const name = input.trim().toLowerCase();
  return CODE_BY_NAME.get(name) ?? name;
}

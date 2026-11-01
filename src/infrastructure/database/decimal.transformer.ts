import { Decimal } from 'decimal.js';
import type { ValueTransformer } from 'typeorm';

// pg returns NUMERIC as a string; mapping it to Decimal keeps weights out of float and string comparisons.
// Non-Decimal values (null, FindOperator) pass through so the transformer also works inside where clauses.
export const decimalTransformer: ValueTransformer = {
  to: (value: unknown) => (value instanceof Decimal ? value.toFixed() : value),
  from: (value: string | null) => (value === null ? null : new Decimal(value)),
};

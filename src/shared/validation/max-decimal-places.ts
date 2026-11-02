import { Decimal } from 'decimal.js';
import { ValidateBy, type ValidationArguments, type ValidationOptions } from 'class-validator';

// class-validator's maxDecimalPlaces splits value.toString() on '.', which misreads exponent forms
// (1e-7 throws, 1.5e-7 counts as 4 places). Decimal reads the exact number of decimal places.
// Only checks finite numbers: any other value is reported by the type validator.
export function MaxDecimalPlaces(
  max: number,
  validationOptions?: ValidationOptions,
): PropertyDecorator {
  return ValidateBy(
    {
      name: 'maxDecimalPlaces',
      constraints: [max],
      validator: {
        validate: (value: unknown) =>
          typeof value !== 'number' ||
          !Number.isFinite(value) ||
          new Decimal(value).decimalPlaces() <= max,
        defaultMessage: (args?: ValidationArguments) =>
          `${args?.property} must have at most ${max} decimal places`,
      },
    },
    validationOptions,
  );
}

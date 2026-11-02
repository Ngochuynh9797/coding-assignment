import { ValidateBy, type ValidationArguments, type ValidationOptions } from 'class-validator';
import { isValidLocalDate } from '@shared/date/local-date';

// Only compares two valid dates: a missing or malformed value is reported by its own validator.
export function IsOnOrBefore(
  property: string,
  validationOptions?: ValidationOptions,
): PropertyDecorator {
  return ValidateBy(
    {
      name: 'isOnOrBefore',
      constraints: [property],
      validator: {
        validate: (value: unknown, args?: ValidationArguments) => {
          const other = (args?.object as Record<string, unknown> | undefined)?.[property];
          // YYYY-MM-DD strings sort lexicographically in calendar order.
          return !isValidLocalDate(value) || !isValidLocalDate(other) || value <= other;
        },
        defaultMessage: () => `must be on or before '${property}'`,
      },
    },
    validationOptions,
  );
}

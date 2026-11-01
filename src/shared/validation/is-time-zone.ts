import { ValidateBy, type ValidationOptions } from 'class-validator';
import { IANAZone } from 'luxon';

export function IsTimeZone(validationOptions?: ValidationOptions): PropertyDecorator {
  return ValidateBy(
    {
      name: 'isTimeZone',
      validator: {
        validate: (value: unknown) => typeof value === 'string' && IANAZone.isValidZone(value),
        defaultMessage: () => 'must be a valid IANA timezone',
      },
    },
    validationOptions,
  );
}

import { ValidateBy, type ValidationOptions } from 'class-validator';

const USER_ID = /^[A-Za-z0-9_-]{1,64}$/;

export function IsUserId(validationOptions?: ValidationOptions): PropertyDecorator {
  return ValidateBy(
    {
      name: 'isUserId',
      validator: {
        validate: (value: unknown) => typeof value === 'string' && USER_ID.test(value),
        defaultMessage: () => "must be 1-64 characters of letters, digits, '_' or '-'",
      },
    },
    validationOptions,
  );
}

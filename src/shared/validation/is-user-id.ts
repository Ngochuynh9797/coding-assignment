import { ValidateBy, type ValidationOptions } from 'class-validator';

const USER_ID = /^[A-Za-z0-9_-]{1,64}$/;

export const USER_ID_RULE = "must be 1-64 characters of letters, digits, '_' or '-'";

export function isUserId(value: unknown): boolean {
  return typeof value === 'string' && USER_ID.test(value);
}

export function IsUserId(validationOptions?: ValidationOptions): PropertyDecorator {
  return ValidateBy(
    {
      name: 'isUserId',
      validator: {
        validate: isUserId,
        defaultMessage: () => USER_ID_RULE,
      },
    },
    validationOptions,
  );
}

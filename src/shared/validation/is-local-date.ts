import { ValidateBy, type ValidationArguments, type ValidationOptions } from 'class-validator';
import { isNotTooFarInFuture, isValidLocalDate } from '@shared/date/local-date';

export interface IsLocalDateOptions {
  maxFutureDays?: number;
}

export const LOCAL_DATE_FORMAT_MESSAGE = 'must be a valid date in YYYY-MM-DD format';

export function IsLocalDate(
  options: IsLocalDateOptions = {},
  validationOptions?: ValidationOptions,
): PropertyDecorator {
  const { maxFutureDays } = options;
  return ValidateBy(
    {
      name: 'isLocalDate',
      validator: {
        validate: (value: unknown) =>
          isValidLocalDate(value) &&
          (maxFutureDays === undefined || isNotTooFarInFuture(value, new Date(), maxFutureDays)),
        defaultMessage: (args?: ValidationArguments) =>
          isValidLocalDate(args?.value)
            ? `must be at most ${maxFutureDays} day(s) after the current UTC date`
            : LOCAL_DATE_FORMAT_MESSAGE,
      },
    },
    validationOptions,
  );
}

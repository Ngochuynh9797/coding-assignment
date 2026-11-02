import { applyDecorators } from '@nestjs/common';
import {
  IsIn,
  IsOptional,
  ValidateBy,
  ValidateIf,
  type ValidationArguments,
} from 'class-validator';
import type { PeriodKind } from '@shared/date/period';
import { BASE_UNIT_CODE } from '@shared/units/unit.registry';
import { invalidLocalDateMessage, IsLocalDate } from '@shared/validation/is-local-date';
import { IsOnOrBefore } from '@shared/validation/is-on-or-before';
import { IsTimeZone } from '@shared/validation/is-time-zone';
import { ExerciseName, OutputUnit } from './personal-records.query';

const PERIODS: readonly PeriodKind[] = ['week', 'month', 'year'];

const CUSTOM_FIELDS = ['baseFrom', 'baseTo', 'compareFrom', 'compareTo'] as const;

const CUSTOM_FIELDS_LIST = CUSTOM_FIELDS.join(', ');

function hasCustomForm(query: object): boolean {
  const values = query as Record<string, unknown>;
  return CUSTOM_FIELDS.some((field) => values[field] !== undefined);
}

function NotWithCustomForm(): PropertyDecorator {
  return ValidateBy({
    name: 'notWithCustomForm',
    validator: {
      validate: (_value: unknown, args?: ValidationArguments) =>
        args === undefined || !hasCustomForm(args.object),
      defaultMessage: () => `must not be combined with ${CUSTOM_FIELDS_LIST}`,
    },
  });
}

// One issue per field: a missing date is reported as required, not also as badly formatted.
function CustomFormDate(): PropertyDecorator {
  return applyDecorators(
    ValidateIf(hasCustomForm),
    IsLocalDate(
      {},
      {
        message: ({ value }) =>
          value === undefined
            ? `is required when any of ${CUSTOM_FIELDS_LIST} is given`
            : invalidLocalDateMessage(value),
      },
    ),
  );
}

// Exactly one form: preset (period, tz, anchor) or custom (all four ranges). tz has no default here,
// otherwise a custom-form request would always look mixed; the service falls back to UTC.
export class CompareQuery {
  @ExerciseName()
  exercise!: string;

  // Both periods must share a unit for the delta to be meaningful, so the default does not depend on
  // the winning sets.
  @IsOptional()
  @OutputUnit()
  unit: string = BASE_UNIT_CODE;

  // Required when the custom form is absent, so a request with neither form is rejected here.
  @ValidateIf((query: CompareQuery) => query.period !== undefined || !hasCustomForm(query))
  @IsIn(PERIODS)
  @NotWithCustomForm()
  period?: PeriodKind;

  @IsOptional()
  @IsTimeZone()
  @NotWithCustomForm()
  tz?: string;

  @IsOptional()
  @IsLocalDate()
  @NotWithCustomForm()
  anchor?: string;

  @CustomFormDate()
  @IsOnOrBefore('baseTo')
  baseFrom?: string;

  @CustomFormDate()
  baseTo?: string;

  @CustomFormDate()
  @IsOnOrBefore('compareTo')
  compareFrom?: string;

  @CustomFormDate()
  compareTo?: string;
}

import { applyDecorators } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { normalizeUnitCode, SUPPORTED_UNIT_CODES } from '@shared/units/unit.registry';
import { IsLocalDate } from '@shared/validation/is-local-date';
import { IsOnOrBefore } from '@shared/validation/is-on-or-before';

const supportedUnits = `Supported units: ${SUPPORTED_UNIT_CODES.join(', ')}`;

export function ExerciseName(): PropertyDecorator {
  return applyDecorators(
    IsString(),
    MinLength(1),
    MaxLength(100),
    Matches(/\S/, { message: 'exercise must not be blank' }),
  );
}

export function OutputUnit(): PropertyDecorator {
  return applyDecorators(
    Transform(({ value }) => normalizeUnitCode(value)),
    IsIn(SUPPORTED_UNIT_CODES, {
      message: ({ value }) =>
        typeof value === 'string'
          ? `Unsupported unit '${value}'. ${supportedUnits}`
          : `unit must be a string. ${supportedUnits}`,
    }),
  );
}

export class PersonalRecordsQuery {
  @ExerciseName()
  exercise!: string;

  @IsOptional()
  @IsLocalDate()
  @IsOnOrBefore('to')
  from?: string;

  @IsOptional()
  @IsLocalDate()
  to?: string;

  @IsOptional()
  @OutputUnit()
  unit?: string;
}

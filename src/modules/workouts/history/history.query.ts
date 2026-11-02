import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { normalizeUnitCode, SUPPORTED_UNIT_CODES } from '@shared/units/unit.registry';
import { IsLocalDate } from '@shared/validation/is-local-date';

const supportedUnits = `Supported units: ${SUPPORTED_UNIT_CODES.join(', ')}`;

export class HistoryQueryDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  // A blank term normalizes to '' and would match the whole catalog.
  @Matches(/\S/, { message: 'exercise must not be blank' })
  exercise?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[a-z_]{1,50}$/, { message: 'muscleGroup must match ^[a-z_]{1,50}$' })
  muscleGroup?: string;

  @IsOptional()
  @IsLocalDate()
  from?: string;

  @IsOptional()
  @IsLocalDate()
  to?: string;

  @IsOptional()
  @Transform(({ value }) => normalizeUnitCode(value))
  @IsIn(SUPPORTED_UNIT_CODES, {
    message: ({ value }) =>
      typeof value === 'string'
        ? `Unsupported unit '${value}'. ${supportedUnits}`
        : `unit must be a string. ${supportedUnits}`,
  })
  unit?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  cursor?: string;
}

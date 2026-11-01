import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { normalizeUnitCode, SUPPORTED_UNIT_CODES } from '@shared/units/unit.registry';
import { IsLocalDate } from '@shared/validation/is-local-date';

const supportedUnits = `Supported units: ${SUPPORTED_UNIT_CODES.join(', ')}`;

export class SetDto {
  @IsInt()
  @Min(1)
  @Max(1000)
  reps!: number;

  // Matches workout_sets.weight NUMERIC(10,4): more decimals would be rounded silently by the DB.
  @IsNumber({ allowNaN: false, allowInfinity: false, maxDecimalPlaces: 4 })
  @Min(0)
  weight!: number;

  @Transform(({ value }) => normalizeUnitCode(value))
  @IsIn(SUPPORTED_UNIT_CODES, {
    message: ({ value }) =>
      typeof value === 'string'
        ? `Unsupported unit '${value}'. ${supportedUnits}`
        : `unit must be a string. ${supportedUnits}`,
  })
  unit!: string;
}

export class EntryDto {
  @IsLocalDate({ maxFutureDays: 1 })
  date!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  exerciseName!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => SetDto)
  sets!: SetDto[];
}

export class LogWorkoutsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => EntryDto)
  entries!: EntryDto[];
}

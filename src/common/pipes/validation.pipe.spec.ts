import 'reflect-metadata';
import { Type } from 'class-transformer';
import { IsArray, IsInt, IsString, Min, ValidateNested } from 'class-validator';
import { AppException } from '@shared/errors/app-exception';
import { createValidationPipe } from './validation.pipe';

class SetDto {
  @IsInt()
  @Min(1)
  reps!: number;

  @IsString()
  unit!: string;
}

class EntryDto {
  @IsString()
  exerciseName!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SetDto)
  sets!: SetDto[];
}

class BodyDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EntryDto)
  entries!: EntryDto[];
}

const validSet = { reps: 5, unit: 'u' };
const validEntry = { exerciseName: 'Bench Press', sets: [validSet] };

async function validationError(value: unknown): Promise<AppException> {
  try {
    await createValidationPipe().transform(value, { type: 'body', metatype: BodyDto });
  } catch (error) {
    return error as AppException;
  }
  throw new Error('expected validation to fail');
}

describe('createValidationPipe', () => {
  it('returns a transformed instance for a valid body', async () => {
    const result: unknown = await createValidationPipe().transform(
      { entries: [validEntry] },
      { type: 'body', metatype: BodyDto },
    );

    expect(result).toBeInstanceOf(BodyDto);
    expect((result as BodyDto).entries[0]).toBeInstanceOf(EntryDto);
  });

  it('throws an AppException with the shared validation code', async () => {
    const error = await validationError({ entries: [{ ...validEntry, exerciseName: 1 }] });

    expect(error).toBeInstanceOf(AppException);
    expect(error.code).toBe('VALIDATION_ERROR');
    expect(error.httpStatus).toBe(400);
    expect(error.message).toBe('Request validation failed');
  });

  it('reports a field nested two levels deep inside arrays with its full path', async () => {
    const error = await validationError({
      entries: [validEntry, { ...validEntry, sets: [{ ...validSet, reps: 0 }] }],
    });

    expect(error.details).toEqual([
      { field: 'entries[1].sets[0].reps', issue: 'reps must not be less than 1' },
    ]);
  });

  it('rejects an unknown top-level property', async () => {
    const error = await validationError({ entries: [validEntry], x: 1 });

    expect(error.details).toEqual([{ field: 'x', issue: 'property x should not exist' }]);
  });

  it('rejects an unknown property nested inside arrays', async () => {
    const error = await validationError({
      entries: [{ ...validEntry, sets: [{ ...validSet, extra: true }] }],
    });

    expect(error.details).toEqual([
      { field: 'entries[0].sets[0].extra', issue: 'property extra should not exist' },
    ]);
  });

  it('reports every invalid field, not only the first one', async () => {
    const error = await validationError({
      entries: [
        { ...validEntry, exerciseName: 42 },
        {
          ...validEntry,
          sets: [
            { ...validSet, reps: 0 },
            { ...validSet, unit: 7 },
          ],
        },
      ],
    });

    expect(error.details.map((detail) => detail.field)).toEqual([
      'entries[0].exerciseName',
      'entries[1].sets[0].reps',
      'entries[1].sets[1].unit',
    ]);
  });

  it('emits one detail per failed constraint on the same field', async () => {
    const error = await validationError({
      entries: [{ ...validEntry, sets: [{ ...validSet, reps: 0.5 }] }],
    });

    expect(error.details).toEqual([
      { field: 'entries[0].sets[0].reps', issue: 'reps must not be less than 1' },
      { field: 'entries[0].sets[0].reps', issue: 'reps must be an integer number' },
    ]);
  });

  it('does not convert a numeric string implicitly', async () => {
    const error = await validationError({
      entries: [{ ...validEntry, sets: [{ ...validSet, reps: '5' }] }],
    });

    expect(error.details).toContainEqual({
      field: 'entries[0].sets[0].reps',
      issue: 'reps must be an integer number',
    });
  });

  it('reports a non-array value where an array is expected', async () => {
    const error = await validationError({ entries: 'nope' });

    expect(error.details).toContainEqual({ field: 'entries', issue: 'entries must be an array' });
  });
});

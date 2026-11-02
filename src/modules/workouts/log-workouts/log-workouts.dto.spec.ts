import 'reflect-metadata';
import type { ArgumentMetadata } from '@nestjs/common';
import { createValidationPipe } from '@common/pipes/validation.pipe';
import { AppException, type ErrorDetail } from '@shared/errors/app-exception';
import { SUPPORTED_UNIT_CODES } from '@shared/units/unit.registry';
import { UserIdParam } from '@shared/validation/user-id.param';
import { LogWorkoutsDto } from './log-workouts.dto';

const body: ArgumentMetadata = { type: 'body', metatype: LogWorkoutsDto };
const param: ArgumentMetadata = { type: 'param', metatype: UserIdParam };

const validSet = () => ({ reps: 5, weight: 100, unit: 'kg' });
const validEntry = () => ({ date: '2026-10-31', exerciseName: 'Bench Press', sets: [validSet()] });

function withSet(overrides: Record<string, unknown>): unknown {
  return { entries: [{ ...validEntry(), sets: [{ ...validSet(), ...overrides }] }] };
}

function withEntry(overrides: Record<string, unknown>): unknown {
  return { entries: [{ ...validEntry(), ...overrides }] };
}

async function details(value: unknown, metadata: ArgumentMetadata = body): Promise<ErrorDetail[]> {
  try {
    await createValidationPipe().transform(value, metadata);
  } catch (error) {
    expect(error).toBeInstanceOf(AppException);
    return (error as AppException).details;
  }
  throw new Error('expected validation to fail');
}

async function fields(value: unknown, metadata?: ArgumentMetadata): Promise<string[]> {
  return [...new Set((await details(value, metadata)).map((d) => d.field))];
}

describe('LogWorkoutsDto', () => {
  it('accepts a valid body and returns nested instances', async () => {
    const result = (await createValidationPipe().transform(
      { entries: [validEntry()] },
      body,
    )) as LogWorkoutsDto;

    expect(result).toBeInstanceOf(LogWorkoutsDto);
    expect(result.entries[0]!.sets[0]!.weight).toBe(100);
  });

  it.each([null, '2026-02-30', '31/10/2026', '2999-01-01', '2026-10-31T00:00:00Z'])(
    'rejects date %p',
    async (date) => {
      expect(await fields(withEntry({ date }))).toEqual(['entries[0].date']);
    },
  );

  it.each([-1, 0, 2.5, 1001, '5'])('rejects reps %p', async (reps) => {
    expect(await fields(withSet({ reps }))).toEqual(['entries[0].sets[0].reps']);
  });

  it.each([-5, '100', 1.23456, Number.NaN, null])('rejects weight %p', async (weight) => {
    expect(await fields(withSet({ weight }))).toEqual(['entries[0].sets[0].weight']);
  });

  it.each([0, 102.5, 1.2345])('accepts weight %p', async (weight) => {
    await expect(
      createValidationPipe().transform(withSet({ weight }), body),
    ).resolves.toBeDefined();
  });

  it('rejects an unsupported unit and lists the supported codes', async () => {
    expect(await details(withSet({ unit: 'stn' }))).toEqual([
      {
        field: 'entries[0].sets[0].unit',
        issue: `Unsupported unit 'stn'. Supported units: ${SUPPORTED_UNIT_CODES.join(', ')}`,
      },
    ]);
  });

  it('normalizes a unit alias with surrounding spaces', async () => {
    const result = (await createValidationPipe().transform(
      withSet({ unit: ' LBS ' }),
      body,
    )) as LogWorkoutsDto;

    expect(result.entries[0]!.sets[0]!.unit).toBe('lb');
  });

  it('rejects a missing unit', async () => {
    const set: Record<string, unknown> = validSet();
    delete set.unit;

    expect(await fields({ entries: [{ ...validEntry(), sets: [set] }] })).toEqual([
      'entries[0].sets[0].unit',
    ]);
  });

  it.each([
    ['empty sets', withEntry({ sets: [] }), 'entries[0].sets'],
    ['51 sets', withEntry({ sets: Array.from({ length: 51 }, validSet) }), 'entries[0].sets'],
    ['empty entries', { entries: [] }, 'entries'],
    ['101 entries', { entries: Array.from({ length: 101 }, validEntry) }, 'entries'],
    ['missing entries', {}, 'entries'],
    ['blank exerciseName', withEntry({ exerciseName: '' }), 'entries[0].exerciseName'],
    ['long exerciseName', withEntry({ exerciseName: 'x'.repeat(101) }), 'entries[0].exerciseName'],
  ])('rejects %s', async (_, value, field) => {
    expect(await fields(value)).toEqual([field]);
  });

  it('rejects unknown fields with their path', async () => {
    expect(await fields(withEntry({ notes: 'heavy day' }))).toEqual(['entries[0].notes']);
  });

  it('reports every invalid field at once', async () => {
    const value = {
      entries: [
        validEntry(),
        { ...validEntry(), date: null, sets: [validSet(), { ...validSet(), reps: 0 }] },
      ],
    };

    expect(await fields(value)).toEqual(['entries[1].date', 'entries[1].sets[1].reps']);
  });
});

describe('UserIdParam', () => {
  it('accepts a valid user id', async () => {
    await expect(
      createValidationPipe().transform({ userId: 'user_123' }, param),
    ).resolves.toBeInstanceOf(UserIdParam);
  });

  it.each(['a b', 'a'.repeat(65)])('rejects %p', async (userId) => {
    expect(await fields({ userId }, param)).toEqual(['userId']);
  });
});

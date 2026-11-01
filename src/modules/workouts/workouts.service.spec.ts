import { Decimal } from 'decimal.js';
import type { DataSource, EntityManager } from 'typeorm';
import { v7 } from 'uuid';
import { hashRequestBody } from '@infra/idempotency/canonical-json';
import type { IdempotencyService } from '@infra/idempotency/idempotency.service';
import type { CatalogService } from '@modules/catalog/catalog.service';
import type { DailyBestsWriter } from '@modules/personal-records/daily-bests.writer';
import { AppException } from '@shared/errors/app-exception';
import { UnitConverter } from '@shared/units/unit-converter';
import { WEIGHT_UNITS } from '@shared/units/unit.registry';
import type { LogWorkoutsDto } from './dto/log-workouts.dto';
import type { NewEntry, NewSet, WorkoutsRepository } from './workouts.repository';
import { WorkoutsService } from './workouts.service';

const exercises: Record<string, { id: number; displayName: string }> = {
  'bench press': { id: 1, displayName: 'Bench Press' },
  'back squat': { id: 7, displayName: 'Back Squat' },
};

function dto(entries: LogWorkoutsDto['entries']): LogWorkoutsDto {
  return { entries };
}

const twoEntries = (): LogWorkoutsDto =>
  dto([
    {
      date: '2026-10-31',
      exerciseName: 'Bench Press',
      sets: [
        { reps: 5, weight: 225, unit: 'lb' },
        { reps: 3, weight: 235, unit: 'lb' },
      ],
    },
    {
      date: '2026-10-30',
      exerciseName: 'back squat',
      sets: [{ reps: 5, weight: 140, unit: 'kg' }],
    },
  ]);

async function rejection(promise: Promise<unknown>): Promise<AppException> {
  try {
    await promise;
  } catch (error) {
    return error as AppException;
  }
  throw new Error('expected the promise to reject');
}

describe('WorkoutsService.logBulk', () => {
  const tx = {} as EntityManager;
  let transaction: jest.Mock;
  let catalog: jest.Mocked<Pick<CatalogService, 'resolveNamesOrThrow'>>;
  let repository: jest.Mocked<WorkoutsRepository>;
  let writer: jest.Mocked<Pick<DailyBestsWriter, 'applySets'>>;
  let idempotency: jest.Mocked<IdempotencyService>;
  let service: WorkoutsService;

  const inserted = (): { entries: NewEntry[]; sets: NewSet[] } => {
    const [, entries, sets] = repository.insertEntriesAndSets.mock.calls[0]!;
    return { entries, sets };
  };

  beforeEach(() => {
    transaction = jest.fn((_isolation: string, fn: (manager: EntityManager) => Promise<unknown>) =>
      fn(tx),
    );
    catalog = {
      resolveNamesOrThrow: jest.fn((items: { name: string; field: string }[]) =>
        Promise.resolve(items.map((item) => exercises[item.name.toLowerCase()]!)),
      ),
    };
    repository = {
      insertEntriesAndSets: jest.fn().mockResolvedValue(undefined),
    };
    writer = { applySets: jest.fn().mockResolvedValue(undefined) };
    idempotency = {
      claim: jest.fn().mockResolvedValue({ kind: 'new' }),
      complete: jest.fn().mockResolvedValue(undefined),
    };
    service = new WorkoutsService(
      { transaction } as unknown as DataSource,
      catalog as unknown as CatalogService,
      new UnitConverter(WEIGHT_UNITS),
      repository,
      writer as unknown as DailyBestsWriter,
      idempotency,
    );
  });

  it('runs every step in one READ COMMITTED transaction and returns 201', async () => {
    const result = await service.logBulk('user_1', twoEntries());

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(transaction).toHaveBeenCalledWith('READ COMMITTED', expect.any(Function));
    expect(catalog.resolveNamesOrThrow).toHaveBeenCalledWith(
      [
        { name: 'Bench Press', field: 'entries[0].exerciseName' },
        { name: 'back squat', field: 'entries[1].exerciseName' },
      ],
      tx,
    );
    expect(repository.insertEntriesAndSets).toHaveBeenCalledWith(
      tx,
      expect.any(Array),
      expect.any(Array),
    );
    expect(writer.applySets).toHaveBeenCalledWith(tx, 'user_1', expect.any(Array));
    expect(result.status).toBe(201);
    expect(result.replayed).toBe(false);
  });

  it('stores the original weight and unit next to the kg value and builds the response', async () => {
    const result = await service.logBulk('user_1', twoEntries());
    const { entries, sets } = inserted();

    expect(entries).toEqual([
      { id: entries[0]!.id, userId: 'user_1', exerciseId: 1, performedOn: '2026-10-31' },
      { id: entries[1]!.id, userId: 'user_1', exerciseId: 7, performedOn: '2026-10-30' },
    ]);
    expect(
      sets.map((s) => [s.setIndex, s.reps, s.weight.toFixed(), s.unit, s.weightKg.toFixed()]),
    ).toEqual([
      [1, 5, '225', 'lb', '102.0583'],
      [2, 3, '235', 'lb', '106.5942'],
      [1, 5, '140', 'kg', '140'],
    ]);
    expect(result.body).toEqual({
      data: {
        entries: [
          {
            id: entries[0]!.id,
            date: '2026-10-31',
            exercise: { id: 1, name: 'Bench Press' },
            sets: [
              { id: sets[0]!.id, setIndex: 1, reps: 5, weight: 225, unit: 'lb', weightKg: 102.06 },
              { id: sets[1]!.id, setIndex: 2, reps: 3, weight: 235, unit: 'lb', weightKg: 106.59 },
            ],
          },
          {
            id: entries[1]!.id,
            date: '2026-10-30',
            exercise: { id: 7, name: 'Back Squat' },
            sets: [
              { id: sets[2]!.id, setIndex: 1, reps: 5, weight: 140, unit: 'kg', weightKg: 140 },
            ],
          },
        ],
      },
    });
  });

  it('generates ids in request order and links every set to its entry', async () => {
    await service.logBulk('user_1', twoEntries());
    const { entries, sets } = inserted();
    const entryIds = entries.map((e) => e.id);
    const setIds = sets.map((s) => s.id);

    expect(entryIds).toEqual([...entryIds].sort());
    expect(setIds).toEqual([...setIds].sort());
    expect(new Set([...entryIds, ...setIds]).size).toBe(5);
    expect(sets.map((s) => s.entryId)).toEqual([entryIds[0], entryIds[0], entryIds[1]]);
  });

  it('relies on uuid v7 ids generated in the same millisecond being strictly increasing', () => {
    const ids = Array.from({ length: 10_000 }, () => v7());

    expect(ids.every((id, i) => i === 0 || ids[i - 1]! < id)).toBe(true);
  });

  it('passes every set to the daily bests writer in request order', async () => {
    await service.logBulk('user_1', twoEntries());
    const { sets } = inserted();
    const prSets = writer.applySets.mock.calls[0]![2];

    expect(
      prSets.map((s) => [s.setId, s.exerciseId, s.performedOn, s.reps, s.weightKg.toFixed()]),
    ).toEqual([
      [sets[0]!.id, 1, '2026-10-31', 5, '102.0583'],
      [sets[1]!.id, 1, '2026-10-31', 3, '106.5942'],
      [sets[2]!.id, 7, '2026-10-30', 5, '140'],
    ]);
  });

  it('reports every weight above 1000 kg at once and writes nothing', async () => {
    const body = dto([
      {
        date: '2026-10-31',
        exerciseName: 'Back Squat',
        sets: [
          { reps: 1, weight: 1000, unit: 'kg' },
          { reps: 1, weight: 1000.0001, unit: 'kg' },
          { reps: 1, weight: 2204, unit: 'lb' },
        ],
      },
      {
        date: '2026-10-31',
        exerciseName: 'Bench Press',
        sets: [{ reps: 1, weight: 2300, unit: 'lb' }],
      },
    ]);

    const error = await rejection(service.logBulk('user_1', body, 'key-1'));

    expect(error).toBeInstanceOf(AppException);
    expect(error.code).toBe('VALIDATION_ERROR');
    expect(error.httpStatus).toBe(400);
    expect(error.details).toEqual([
      { field: 'entries[0].sets[1].weight', issue: 'exceeds maximum of 1000 kg' },
      { field: 'entries[1].sets[0].weight', issue: 'exceeds maximum of 1000 kg' },
    ]);
    expect(repository.insertEntriesAndSets).not.toHaveBeenCalled();
    expect(writer.applySets).not.toHaveBeenCalled();
    expect(idempotency.complete).not.toHaveBeenCalled();
  });

  it('does not touch idempotency keys without a header', async () => {
    await service.logBulk('user_1', twoEntries());

    expect(idempotency.claim).not.toHaveBeenCalled();
    expect(idempotency.complete).not.toHaveBeenCalled();
  });

  it('claims the key with the hash of the validated body and stores the response', async () => {
    const body = twoEntries();

    const result = await service.logBulk('user_1', body, 'key-1');

    expect(idempotency.claim).toHaveBeenCalledWith(tx, 'user_1', 'key-1', hashRequestBody(body));
    expect(idempotency.complete).toHaveBeenCalledWith(tx, 'user_1', 'key-1', 201, result.body);
  });

  it('replays a stored response without resolving, inserting or updating bests', async () => {
    const stored = { data: { entries: [] } };
    idempotency.claim.mockResolvedValue({ kind: 'replay', status: 201, body: stored });

    const result = await service.logBulk('user_1', twoEntries(), 'key-1');

    expect(result).toEqual({ status: 201, body: stored, replayed: true });
    expect(catalog.resolveNamesOrThrow).not.toHaveBeenCalled();
    expect(repository.insertEntriesAndSets).not.toHaveBeenCalled();
    expect(writer.applySets).not.toHaveBeenCalled();
    expect(idempotency.complete).not.toHaveBeenCalled();
  });

  it('keeps Decimal precision for weights', async () => {
    await service.logBulk(
      'user_1',
      dto([
        {
          date: '2026-10-31',
          exerciseName: 'Bench Press',
          sets: [{ reps: 1, weight: 0.1, unit: 'kg' }],
        },
      ]),
    );

    expect(inserted().sets[0]!.weight).toEqual(new Decimal('0.1'));
  });
});

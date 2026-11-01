import type { EntityManager } from 'typeorm';
import { AppException } from '@shared/errors/app-exception';
import { CatalogErrorCode } from './catalog.errors';
import type { CatalogRepository, ExerciseRef } from './catalog.repository';
import { CatalogService } from './catalog.service';

const benchPress: ExerciseRef = { id: 1, displayName: 'Bench Press' };
const backSquat: ExerciseRef = { id: 7, displayName: 'Back Squat' };
const catalog = new Map([
  ['bench press', benchPress],
  ['back squat', backSquat],
]);

function createRepository(): jest.Mocked<CatalogRepository> {
  return {
    findByNameKeys: jest.fn((keys: string[]) =>
      Promise.resolve(
        new Map(keys.flatMap((key) => (catalog.has(key) ? [[key, catalog.get(key)!]] : []))),
      ),
    ),
    findIdsByNameLike: jest.fn(),
    findIdsByMuscleGroup: jest.fn(),
    list: jest.fn(),
  } as unknown as jest.Mocked<CatalogRepository>;
}

async function rejection(promise: Promise<unknown>): Promise<AppException> {
  try {
    await promise;
  } catch (error) {
    return error as AppException;
  }
  throw new Error('expected the promise to reject');
}

describe('CatalogService', () => {
  let repository: jest.Mocked<CatalogRepository>;
  let service: CatalogService;

  beforeEach(() => {
    repository = createRepository();
    service = new CatalogService(repository);
  });

  describe('resolveNamesOrThrow', () => {
    it('resolves names in input order with one query', async () => {
      const result = await service.resolveNamesOrThrow([
        { name: 'Back Squat', field: 'entries[0].exerciseName' },
        { name: 'Bench Press', field: 'entries[1].exerciseName' },
      ]);

      expect(result).toEqual([backSquat, benchPress]);
      expect(repository.findByNameKeys).toHaveBeenCalledTimes(1);
    });

    it('queries a repeated name once, whatever its casing or spacing', async () => {
      const result = await service.resolveNamesOrThrow([
        { name: 'Bench Press', field: 'entries[0].exerciseName' },
        { name: ' BENCH  press ', field: 'entries[1].exerciseName' },
        { name: 'bench press', field: 'entries[2].exerciseName' },
      ]);

      expect(result).toEqual([benchPress, benchPress, benchPress]);
      expect(repository.findByNameKeys).toHaveBeenCalledTimes(1);
      expect(repository.findByNameKeys).toHaveBeenCalledWith(['bench press'], undefined);
    });

    it('reports every unknown name with its field in a single error', async () => {
      const error = await rejection(
        service.resolveNamesOrThrow([
          { name: 'Bech Press', field: 'entries[0].exerciseName' },
          { name: 'Bench Press', field: 'entries[1].exerciseName' },
          { name: 'Squatt', field: 'entries[2].exerciseName' },
        ]),
      );

      expect(error).toBeInstanceOf(AppException);
      expect(error.code).toBe(CatalogErrorCode.UNKNOWN_EXERCISE);
      expect(error.httpStatus).toBe(400);
      expect(error.message).toContain('GET /api/v1/exercises');
      expect(error.details).toEqual([
        { field: 'entries[0].exerciseName', issue: "Unknown exercise 'Bech Press'" },
        { field: 'entries[2].exerciseName', issue: "Unknown exercise 'Squatt'" },
      ]);
      expect(repository.findByNameKeys).toHaveBeenCalledTimes(1);
    });

    it("reads through the caller's transaction when a manager is given", async () => {
      const manager = {} as EntityManager;

      await service.resolveNamesOrThrow(
        [{ name: 'Bench Press', field: 'entries[0].exerciseName' }],
        manager,
      );

      expect(repository.findByNameKeys).toHaveBeenCalledWith(['bench press'], manager);
    });

    it('does not query for an empty list', async () => {
      await expect(service.resolveNamesOrThrow([])).resolves.toEqual([]);
      expect(repository.findByNameKeys).not.toHaveBeenCalled();
    });
  });

  describe('getByNameOrThrow', () => {
    it('returns the exercise for a case-insensitive match', async () => {
      await expect(service.getByNameOrThrow('  bench PRESS')).resolves.toEqual(benchPress);
      expect(repository.findByNameKeys).toHaveBeenCalledWith(['bench press']);
    });

    it('throws EXERCISE_NOT_FOUND (404) for an unknown name', async () => {
      const error = await rejection(service.getByNameOrThrow('Bech Press'));

      expect(error).toBeInstanceOf(AppException);
      expect(error.code).toBe(CatalogErrorCode.EXERCISE_NOT_FOUND);
      expect(error.httpStatus).toBe(404);
      expect(error.message).toContain("'Bech Press'");
    });
  });

  describe('resolveFilterIds', () => {
    it('returns null without querying when no filter is given', async () => {
      await expect(service.resolveFilterIds({})).resolves.toBeNull();
      expect(repository.findIdsByNameLike).not.toHaveBeenCalled();
      expect(repository.findIdsByMuscleGroup).not.toHaveBeenCalled();
    });

    it('matches the exercise filter on the normalized name', async () => {
      repository.findIdsByNameLike.mockResolvedValue([1, 3, 4]);

      await expect(service.resolveFilterIds({ exercise: ' Bench  PRESS ' })).resolves.toEqual([
        1, 3, 4,
      ]);
      expect(repository.findIdsByNameLike).toHaveBeenCalledWith('bench press');
      expect(repository.findIdsByMuscleGroup).not.toHaveBeenCalled();
    });

    it('escapes LIKE wildcards so they match literally', async () => {
      repository.findIdsByNameLike.mockResolvedValue([]);

      await expect(service.resolveFilterIds({ exercise: '_%' })).resolves.toEqual([]);
      expect(repository.findIdsByNameLike).toHaveBeenCalledWith('\\_\\%');
    });

    it('filters by muscle group code', async () => {
      repository.findIdsByMuscleGroup.mockResolvedValue([1, 2]);

      await expect(service.resolveFilterIds({ muscleGroup: 'chest' })).resolves.toEqual([1, 2]);
      expect(repository.findIdsByMuscleGroup).toHaveBeenCalledWith('chest');
      expect(repository.findIdsByNameLike).not.toHaveBeenCalled();
    });

    it('intersects both filters', async () => {
      repository.findIdsByNameLike.mockResolvedValue([1, 3, 4, 9]);
      repository.findIdsByMuscleGroup.mockResolvedValue([4, 1, 2]);

      await expect(
        service.resolveFilterIds({ exercise: 'press', muscleGroup: 'chest' }),
      ).resolves.toEqual([1, 4]);
    });

    it('returns an empty list when a filter matches nothing', async () => {
      repository.findIdsByNameLike.mockResolvedValue([1]);
      repository.findIdsByMuscleGroup.mockResolvedValue([]);

      await expect(
        service.resolveFilterIds({ exercise: 'press', muscleGroup: 'nope' }),
      ).resolves.toEqual([]);
    });
  });

  describe('list', () => {
    it('normalizes and escapes the search term before querying', async () => {
      repository.list.mockResolvedValue([]);

      await service.list({ search: ' Bench_  Press ', muscleGroup: 'chest' });

      expect(repository.list).toHaveBeenCalledWith({
        search: 'bench\\_ press',
        muscleGroup: 'chest',
      });
    });

    it('passes no filters when none are given', async () => {
      repository.list.mockResolvedValue([]);

      await service.list({});

      expect(repository.list).toHaveBeenCalledWith({});
    });
  });
});

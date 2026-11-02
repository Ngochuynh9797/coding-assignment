import { Decimal } from 'decimal.js';
import type { CatalogService } from '@modules/catalog/catalog.service';
import { AppException } from '@shared/errors/app-exception';
import { encodeCursor } from '@shared/pagination/cursor';
import { UnitConverter } from '@shared/units/unit-converter';
import { WEIGHT_UNITS } from '@shared/units/unit.registry';
import type { HistoryQueryDto } from './history.query';
import { emptyHistoryResponse } from './history.mapper';
import { WorkoutHistoryService } from './workout-history.service';
import type { HistoryEntryRow, WorkoutHistoryRepository } from './workout-history.repository';

const entry = (id: string): HistoryEntryRow => ({
  id,
  exerciseId: 1,
  exerciseName: 'Bench Press',
  performedOn: '2026-10-31',
  createdAt: new Date('2026-10-31T10:15:00.000Z'),
});

function query(overrides: Partial<HistoryQueryDto> = {}): HistoryQueryDto {
  return { limit: 20, ...overrides };
}

async function rejection(promise: Promise<unknown>): Promise<AppException> {
  try {
    await promise;
  } catch (error) {
    return error as AppException;
  }
  throw new Error('expected the promise to reject');
}

describe('WorkoutHistoryService', () => {
  let catalog: jest.Mocked<Pick<CatalogService, 'resolveFilterIds'>>;
  let repository: jest.Mocked<
    Pick<WorkoutHistoryRepository, 'findHistoryPage' | 'findSetsByEntryIds'>
  >;
  let service: WorkoutHistoryService;

  beforeEach(() => {
    catalog = { resolveFilterIds: jest.fn().mockResolvedValue(null) };
    repository = {
      findHistoryPage: jest
        .fn()
        .mockResolvedValue({ entries: [], hasMore: false, nextCursor: null }),
      findSetsByEntryIds: jest.fn().mockResolvedValue([]),
    };
    service = new WorkoutHistoryService(
      catalog as unknown as CatalogService,
      repository as unknown as WorkoutHistoryRepository,
      new UnitConverter(WEIGHT_UNITS),
    );
  });

  describe('resolveFilters', () => {
    it('returns null without exercise or muscle group filters', async () => {
      await expect(service.resolveFilters(query())).resolves.toBeNull();
      expect(catalog.resolveFilterIds).toHaveBeenCalledWith({});
    });

    it('forwards both filters to the catalog, which intersects them', async () => {
      catalog.resolveFilterIds.mockResolvedValue([3]);

      await expect(
        service.resolveFilters(query({ exercise: 'press', muscleGroup: 'chest' })),
      ).resolves.toEqual([3]);
      expect(catalog.resolveFilterIds).toHaveBeenCalledWith({
        exercise: 'press',
        muscleGroup: 'chest',
      });
    });
  });

  describe('getHistory', () => {
    it('reads every exercise when there is no exercise or muscle group filter', async () => {
      await service.getHistory('user_1', query({ from: '2026-10-01', to: '2026-10-31' }));

      expect(repository.findHistoryPage).toHaveBeenCalledWith({
        userId: 'user_1',
        exerciseIds: null,
        from: '2026-10-01',
        to: '2026-10-31',
        limit: 20,
      });
    });

    it('passes the resolved exercise ids to the repository', async () => {
      catalog.resolveFilterIds.mockResolvedValue([1, 3]);

      await service.getHistory('user_1', query({ exercise: 'press', muscleGroup: 'chest' }));

      expect(repository.findHistoryPage).toHaveBeenCalledWith(
        expect.objectContaining({ exerciseIds: [1, 3] }),
      );
    });

    it('returns the empty response without reading entries when no exercise matches', async () => {
      catalog.resolveFilterIds.mockResolvedValue([]);

      const response = await service.getHistory('user_1', query({ muscleGroup: 'nope' }));

      expect(response).toEqual(emptyHistoryResponse());
      expect(repository.findHistoryPage).not.toHaveBeenCalled();
      expect(repository.findSetsByEntryIds).not.toHaveBeenCalled();
    });

    it('rejects from after to as a validation error on from', async () => {
      const error = await rejection(
        service.getHistory('user_1', query({ from: '2026-11-01', to: '2026-10-31' })),
      );

      expect(error).toBeInstanceOf(AppException);
      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.httpStatus).toBe(400);
      expect(error.details).toEqual([{ field: 'from', issue: "must be on or before 'to'" }]);
      expect(catalog.resolveFilterIds).not.toHaveBeenCalled();
      expect(repository.findHistoryPage).not.toHaveBeenCalled();
    });

    it('accepts from equal to to', async () => {
      await service.getHistory('user_1', query({ from: '2026-10-31', to: '2026-10-31' }));

      expect(repository.findHistoryPage).toHaveBeenCalled();
    });

    it('rejects a malformed cursor before resolving filters', async () => {
      const error = await rejection(service.getHistory('user_1', query({ cursor: 'garbage!' })));

      expect(error.code).toBe('INVALID_CURSOR');
      expect(error.httpStatus).toBe(400);
      expect(catalog.resolveFilterIds).not.toHaveBeenCalled();
    });

    it('passes the decoded cursor to the repository', async () => {
      const cursor = { performedOn: '2026-10-31', id: '019a3f2e-7c41-7d3a-9b2e-5f1c8a6d4e21' };

      await service.getHistory('user_1', query({ cursor: encodeCursor(cursor) }));

      expect(repository.findHistoryPage).toHaveBeenCalledWith(expect.objectContaining({ cursor }));
    });

    it('loads the sets of the whole page in one call and maps the response', async () => {
      repository.findHistoryPage.mockResolvedValue({
        entries: [entry('e1'), entry('e2')],
        hasMore: true,
        nextCursor: 'next',
      });
      repository.findSetsByEntryIds.mockResolvedValue([
        {
          entryId: 'e1',
          setIndex: 1,
          reps: 5,
          weight: new Decimal(225),
          unit: 'lb',
          weightKg: new Decimal('102.0583'),
        },
      ]);

      const response = await service.getHistory('user_1', query({ unit: 'kg' }));

      expect(repository.findSetsByEntryIds).toHaveBeenCalledTimes(1);
      expect(repository.findSetsByEntryIds).toHaveBeenCalledWith(['e1', 'e2']);
      expect(response.data[0]!.sets).toEqual([
        {
          setIndex: 1,
          reps: 5,
          weight: 225,
          unit: 'lb',
          converted: { weight: 102.06, unit: 'kg' },
        },
      ]);
      expect(response.data[1]!.sets).toEqual([]);
      expect(response.pageInfo).toEqual({ nextCursor: 'next', hasMore: true });
    });

    it('does not load sets for an empty page', async () => {
      const response = await service.getHistory('user_1', query());

      expect(response).toEqual(emptyHistoryResponse());
      expect(repository.findSetsByEntryIds).not.toHaveBeenCalled();
    });
  });
});

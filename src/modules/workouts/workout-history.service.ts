import { HttpStatus, Injectable } from '@nestjs/common';
import { CatalogService, type ExerciseFilter } from '@modules/catalog/catalog.service';
import { AppException } from '@shared/errors/app-exception';
import { ErrorCode } from '@shared/errors/error-codes';
import { decodeCursor } from '@shared/pagination/cursor';
import { UnitConverter } from '@shared/units/unit-converter';
import type { HistoryQueryDto } from './dto/history.query';
import type { HistoryPageParams } from './history-query.builder';
import { emptyHistoryResponse, type HistoryResponse, toHistoryResponse } from './history.mapper';
import { WorkoutsRepository } from './workouts.repository';

@Injectable()
export class WorkoutHistoryService {
  constructor(
    private readonly catalog: CatalogService,
    private readonly repository: WorkoutsRepository,
    private readonly converter: UnitConverter,
  ) {}

  async getHistory(userId: string, query: HistoryQueryDto): Promise<HistoryResponse> {
    assertRange(query.from, query.to);
    // Decoded first so a bad cursor is reported even when the filters match nothing.
    const cursor = query.cursor === undefined ? undefined : decodeCursor(query.cursor);

    const exerciseIds = await this.resolveFilters(query);
    if (exerciseIds !== null && exerciseIds.length === 0) {
      return emptyHistoryResponse();
    }

    const params: HistoryPageParams = { userId, exerciseIds, limit: query.limit };
    if (query.from !== undefined) {
      params.from = query.from;
    }
    if (query.to !== undefined) {
      params.to = query.to;
    }
    if (cursor !== undefined) {
      params.cursor = cursor;
    }
    const page = await this.repository.findHistoryPage(params);
    if (page.entries.length === 0) {
      return emptyHistoryResponse();
    }
    const sets = await this.repository.findSetsByEntryIds(page.entries.map((entry) => entry.id));
    return toHistoryResponse(page, sets, query.unit, this.converter);
  }

  // Name and muscle-group filters are resolved on the small catalog, so workout_entries is only read
  // through its (user_id, exercise_id, ...) index. null = no filter; [] = nothing can match.
  resolveFilters(query: HistoryQueryDto): Promise<number[] | null> {
    const filter: ExerciseFilter = {};
    if (query.exercise !== undefined) {
      filter.exercise = query.exercise;
    }
    if (query.muscleGroup !== undefined) {
      filter.muscleGroup = query.muscleGroup;
    }
    return this.catalog.resolveFilterIds(filter);
  }
}

// Both are validated YYYY-MM-DD strings, so lexicographic order is calendar order.
function assertRange(from: string | undefined, to: string | undefined): void {
  if (from !== undefined && to !== undefined && from > to) {
    throw new AppException(
      ErrorCode.VALIDATION_ERROR,
      HttpStatus.BAD_REQUEST,
      'Request validation failed',
      [{ field: 'from', issue: "must be on or before 'to'" }],
    );
  }
}

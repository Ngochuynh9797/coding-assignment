import { Injectable } from '@nestjs/common';
import type { ErrorDetail } from '@shared/errors/app-exception';
import { exerciseNotFoundError, unknownExercisesError } from './catalog.errors';
import {
  type CatalogListFilter,
  CatalogRepository,
  type ExerciseRef,
  type ExerciseWithGroups,
} from './catalog.repository';
import { escapeLike } from './domain/escape-like';
import { normalizeExerciseName } from './domain/normalize-exercise-name';

export interface ExerciseFilter {
  exercise?: string;
  muscleGroup?: string;
}

function toLikeTerm(input: string): string {
  return escapeLike(normalizeExerciseName(input));
}

@Injectable()
export class CatalogService {
  constructor(private readonly repository: CatalogRepository) {}

  async resolveNamesOrThrow(items: { name: string; field: string }[]): Promise<ExerciseRef[]> {
    if (items.length === 0) {
      return [];
    }
    const keys = items.map((item) => normalizeExerciseName(item.name));
    const found = await this.repository.findByNameKeys([...new Set(keys)]);

    const resolved: ExerciseRef[] = [];
    const unknown: ErrorDetail[] = [];
    items.forEach((item, index) => {
      const exercise = found.get(keys[index]!);
      if (exercise) {
        resolved.push(exercise);
      } else {
        unknown.push({ field: item.field, issue: `Unknown exercise '${item.name}'` });
      }
    });
    if (unknown.length > 0) {
      throw unknownExercisesError(unknown);
    }
    return resolved;
  }

  async getByNameOrThrow(name: string): Promise<ExerciseRef> {
    const key = normalizeExerciseName(name);
    const exercise = (await this.repository.findByNameKeys([key])).get(key);
    if (!exercise) {
      throw exerciseNotFoundError(name);
    }
    return exercise;
  }

  // null = no filter; [] = a filter was given but matched no exercise.
  async resolveFilterIds(filter: ExerciseFilter): Promise<number[] | null> {
    const [byName, byMuscleGroup] = await Promise.all([
      filter.exercise === undefined
        ? undefined
        : this.repository.findIdsByNameLike(toLikeTerm(filter.exercise)),
      filter.muscleGroup === undefined
        ? undefined
        : this.repository.findIdsByMuscleGroup(filter.muscleGroup),
    ]);
    if (byName === undefined) {
      return byMuscleGroup ?? null;
    }
    if (byMuscleGroup === undefined) {
      return byName;
    }
    const inMuscleGroup = new Set(byMuscleGroup);
    return byName.filter((id) => inMuscleGroup.has(id));
  }

  list(query: { search?: string; muscleGroup?: string }): Promise<ExerciseWithGroups[]> {
    const filter: CatalogListFilter = {};
    if (query.search !== undefined) {
      filter.search = toLikeTerm(query.search);
    }
    if (query.muscleGroup !== undefined) {
      filter.muscleGroup = query.muscleGroup;
    }
    return this.repository.list(filter);
  }
}

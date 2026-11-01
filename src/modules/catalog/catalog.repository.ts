import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository, type SelectQueryBuilder } from 'typeorm';
import { Exercise } from './entities/exercise.entity';
import { ExerciseMuscleGroup } from './entities/exercise-muscle-group.entity';

export interface ExerciseRef {
  id: number;
  displayName: string;
}

export interface ExerciseWithGroups {
  id: number;
  name: string;
  muscleGroups: string[];
}

export interface CatalogListFilter {
  // Already normalized and LIKE-escaped by the caller.
  search?: string;
  muscleGroup?: string;
}

function whereNameKeyContains(qb: SelectQueryBuilder<Exercise>, term: string): void {
  qb.andWhere(`e.nameKey LIKE :pattern ESCAPE '\\'`, { pattern: `%${term}%` });
}

@Injectable()
export class CatalogRepository {
  constructor(
    @InjectRepository(Exercise) private readonly exercises: Repository<Exercise>,
    @InjectRepository(ExerciseMuscleGroup)
    private readonly muscleGroupLinks: Repository<ExerciseMuscleGroup>,
  ) {}

  async findByNameKeys(keys: string[]): Promise<Map<string, ExerciseRef>> {
    const rows = await this.exercises.find({
      select: { id: true, displayName: true, nameKey: true },
      where: { nameKey: In(keys) },
    });
    return new Map(rows.map((row) => [row.nameKey, { id: row.id, displayName: row.displayName }]));
  }

  async findIdsByNameLike(term: string): Promise<number[]> {
    const qb = this.exercises.createQueryBuilder('e').select('e.id');
    whereNameKeyContains(qb, term);
    const rows = await qb.getMany();
    return rows.map((row) => row.id);
  }

  async findIdsByMuscleGroup(code: string): Promise<number[]> {
    const rows = await this.muscleGroupLinks.find({
      select: { exerciseId: true },
      where: { muscleGroup: { code } },
    });
    return rows.map((row) => row.exerciseId);
  }

  async list(filter: CatalogListFilter): Promise<ExerciseWithGroups[]> {
    const qb = this.exercises
      .createQueryBuilder('e')
      .leftJoinAndSelect('e.muscleGroupLinks', 'link')
      .leftJoinAndSelect('link.muscleGroup', 'mg')
      .orderBy('e.nameKey')
      .addOrderBy('e.id')
      .addOrderBy('mg.code');
    if (filter.search !== undefined) {
      whereNameKeyContains(qb, filter.search);
    }
    if (filter.muscleGroup !== undefined) {
      // EXISTS rather than filtering the join, so muscleGroups still lists every group of a match.
      qb.andWhere(
        (outer) =>
          `EXISTS ${outer
            .subQuery()
            .select('1')
            .from(ExerciseMuscleGroup, 'f')
            .innerJoin('f.muscleGroup', 'fmg')
            .where('f.exerciseId = e.id')
            .andWhere('fmg.code = :muscleGroup')
            .getQuery()}`,
        { muscleGroup: filter.muscleGroup },
      );
    }
    const rows = await qb.getMany();
    return rows.map((exercise) => ({
      id: exercise.id,
      name: exercise.displayName,
      muscleGroups: exercise.muscleGroupLinks.map((link) => link.muscleGroup.code),
    }));
  }
}

import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

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

@Injectable()
export class CatalogRepository {
  constructor(private readonly dataSource: DataSource) {}

  async findByNameKeys(keys: string[]): Promise<Map<string, ExerciseRef>> {
    const rows: { id: number; display_name: string; name_key: string }[] =
      await this.dataSource.query(
        `SELECT id, display_name, name_key FROM exercises WHERE name_key = ANY($1::text[])`,
        [keys],
      );
    return new Map(
      rows.map((row) => [row.name_key, { id: row.id, displayName: row.display_name }]),
    );
  }

  async findIdsByNameLike(term: string): Promise<number[]> {
    const rows: { id: number }[] = await this.dataSource.query(
      `SELECT id FROM exercises WHERE name_key LIKE '%' || $1 || '%' ESCAPE '\\'`,
      [term],
    );
    return rows.map((row) => row.id);
  }

  async findIdsByMuscleGroup(code: string): Promise<number[]> {
    const rows: { id: number }[] = await this.dataSource.query(
      `SELECT emg.exercise_id AS id
       FROM exercise_muscle_groups emg
       JOIN muscle_groups mg ON mg.id = emg.muscle_group_id
       WHERE mg.code = $1`,
      [code],
    );
    return rows.map((row) => row.id);
  }

  // The muscle-group filter is an EXISTS so that muscleGroups still lists every group of a match.
  list(filter: CatalogListFilter): Promise<ExerciseWithGroups[]> {
    return this.dataSource.query(
      `SELECT e.id,
              e.display_name AS name,
              COALESCE(
                array_agg(mg.code ORDER BY mg.code) FILTER (WHERE mg.code IS NOT NULL),
                '{}'
              ) AS "muscleGroups"
       FROM exercises e
       LEFT JOIN exercise_muscle_groups emg ON emg.exercise_id = e.id
       LEFT JOIN muscle_groups mg ON mg.id = emg.muscle_group_id
       WHERE ($1::text IS NULL OR e.name_key LIKE '%' || $1 || '%' ESCAPE '\\')
         AND ($2::text IS NULL OR EXISTS (
               SELECT 1
               FROM exercise_muscle_groups f
               JOIN muscle_groups fmg ON fmg.id = f.muscle_group_id
               WHERE f.exercise_id = e.id AND fmg.code = $2
             ))
       GROUP BY e.id
       ORDER BY e.name_key, e.id`,
      [filter.search ?? null, filter.muscleGroup ?? null],
    );
  }
}

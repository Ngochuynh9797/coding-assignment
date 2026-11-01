import { readFile } from 'node:fs/promises';
import type { DataSource } from 'typeorm';
import { runInTransaction } from '@infra/database/transaction';
import { type CatalogMetadata, parseCatalogMetadata } from './catalog-metadata.schema';
import { normalizeExerciseName } from './domain/normalize-exercise-name';

export interface CatalogSeedResult {
  muscleGroups: number;
  exercises: number;
  mappings: number;
}

export async function readCatalogMetadata(filePath: string): Promise<CatalogMetadata> {
  const raw: unknown = JSON.parse(await readFile(filePath, 'utf8'));
  return parseCatalogMetadata(raw);
}

// Exercises missing from the file are kept: they may already have workout history (FK RESTRICT).
export function seedCatalog(
  dataSource: DataSource,
  metadata: CatalogMetadata,
): Promise<CatalogSeedResult> {
  const exercises = metadata.exercises.map((exercise) => ({
    displayName: exercise.name,
    nameKey: normalizeExerciseName(exercise.name),
    muscleGroups: exercise.muscleGroups,
  }));
  const nameKeys = exercises.map((exercise) => exercise.nameKey);
  const mappingKeys = exercises.flatMap((e) => e.muscleGroups.map(() => e.nameKey));
  const mappingCodes = exercises.flatMap((e) => e.muscleGroups);

  return runInTransaction(dataSource, async (manager) => {
    await manager.query(
      `INSERT INTO muscle_groups (code, name)
       SELECT * FROM unnest($1::text[], $2::text[])
       ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name`,
      [metadata.muscleGroups.map((g) => g.code), metadata.muscleGroups.map((g) => g.name)],
    );

    // The WHERE keeps updated_at unchanged when a re-run changes nothing.
    await manager.query(
      `INSERT INTO exercises (display_name, name_key)
       SELECT * FROM unnest($1::text[], $2::text[])
       ON CONFLICT ON CONSTRAINT exercises_name_key_uq DO UPDATE
         SET display_name = EXCLUDED.display_name, updated_at = now()
         WHERE exercises.display_name IS DISTINCT FROM EXCLUDED.display_name`,
      [exercises.map((e) => e.displayName), nameKeys],
    );

    await manager.query(
      `DELETE FROM exercise_muscle_groups emg
       USING exercises e
       WHERE e.id = emg.exercise_id AND e.name_key = ANY($1::text[])`,
      [nameKeys],
    );

    const inserted: unknown[] = await manager.query(
      `INSERT INTO exercise_muscle_groups (exercise_id, muscle_group_id)
       SELECT e.id, mg.id
       FROM unnest($1::text[], $2::text[]) AS m(name_key, code)
       JOIN exercises e ON e.name_key = m.name_key
       JOIN muscle_groups mg ON mg.code = m.code
       RETURNING exercise_id`,
      [mappingKeys, mappingCodes],
    );

    return {
      muscleGroups: metadata.muscleGroups.length,
      exercises: exercises.length,
      mappings: inserted.length,
    };
  });
}

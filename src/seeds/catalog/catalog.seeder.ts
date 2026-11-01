import { readFile } from 'node:fs/promises';
import { type DataSource, In } from 'typeorm';
import { runInTransaction } from '@infra/database/transaction';
import { normalizeExerciseName } from '@modules/catalog/domain/normalize-exercise-name';
import { Exercise } from '@modules/catalog/entities/exercise.entity';
import { ExerciseMuscleGroup } from '@modules/catalog/entities/exercise-muscle-group.entity';
import { MuscleGroup } from '@modules/catalog/entities/muscle-group.entity';
import { type CatalogMetadata, parseCatalogMetadata } from './catalog-metadata.schema';

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

  return runInTransaction(dataSource, async (manager) => {
    // skipUpdateIfNoValuesChanged adds `WHERE ... IS DISTINCT FROM EXCLUDED ...`, so a re-run that
    // changes nothing leaves updated_at untouched.
    if (metadata.muscleGroups.length > 0) {
      await manager.upsert(
        MuscleGroup,
        metadata.muscleGroups.map(({ code, name }) => ({ code, name })),
        { conflictPaths: ['code'], skipUpdateIfNoValuesChanged: true },
      );
    }
    if (exercises.length === 0) {
      return { muscleGroups: metadata.muscleGroups.length, exercises: 0, mappings: 0 };
    }
    await manager.upsert(
      Exercise,
      exercises.map(({ displayName, nameKey }) => ({ displayName, nameKey })),
      { conflictPaths: ['nameKey'], skipUpdateIfNoValuesChanged: true },
    );

    const groups = await manager.find(MuscleGroup, { select: { id: true, code: true } });
    const savedExercises = await manager.find(Exercise, {
      select: { id: true, nameKey: true },
      where: { nameKey: In(exercises.map((e) => e.nameKey)) },
    });
    const groupIds = new Map(groups.map((g) => [g.code, g.id]));
    const exerciseIds = new Map(savedExercises.map((e) => [e.nameKey, e.id]));

    await manager.delete(ExerciseMuscleGroup, { exerciseId: In([...exerciseIds.values()]) });
    const links = exercises.flatMap((exercise) =>
      exercise.muscleGroups.map((code) => ({
        exerciseId: exerciseIds.get(exercise.nameKey)!,
        muscleGroupId: groupIds.get(code)!,
      })),
    );
    if (links.length > 0) {
      await manager.insert(ExerciseMuscleGroup, links);
    }

    return {
      muscleGroups: metadata.muscleGroups.length,
      exercises: exercises.length,
      mappings: links.length,
    };
  });
}

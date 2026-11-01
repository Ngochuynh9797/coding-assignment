import { z } from 'zod';
import { normalizeExerciseName } from './domain/normalize-exercise-name';

const muscleGroupCode = z.string().regex(/^[a-z_]+$/, 'must match ^[a-z_]+$');

const catalogMetadataSchema = z
  .strictObject({
    muscleGroups: z.array(
      z.strictObject({
        code: muscleGroupCode,
        name: z.string().trim().min(1),
      }),
    ),
    exercises: z.array(
      z.strictObject({
        // Matches the exerciseName limit of the log request: a longer name could never be logged.
        name: z.string().trim().min(1).max(100),
        muscleGroups: z.array(muscleGroupCode),
      }),
    ),
  })
  .superRefine((metadata, ctx) => {
    const codes = new Set<string>();
    metadata.muscleGroups.forEach(({ code }, index) => {
      if (codes.has(code)) {
        ctx.addIssue({
          code: 'custom',
          path: ['muscleGroups', index, 'code'],
          message: `duplicate muscle group code '${code}'`,
        });
      }
      codes.add(code);
    });

    const namesByKey = new Map<string, string>();
    metadata.exercises.forEach((exercise, index) => {
      const key = normalizeExerciseName(exercise.name);
      const existing = namesByKey.get(key);
      if (existing !== undefined) {
        ctx.addIssue({
          code: 'custom',
          path: ['exercises', index, 'name'],
          message: `'${exercise.name}' duplicates '${existing}' after normalization`,
        });
      } else {
        namesByKey.set(key, exercise.name);
      }

      const seen = new Set<string>();
      exercise.muscleGroups.forEach((code, codeIndex) => {
        const path = ['exercises', index, 'muscleGroups', codeIndex];
        if (!codes.has(code)) {
          ctx.addIssue({
            code: 'custom',
            path,
            message: `'${exercise.name}' references unknown muscle group '${code}'`,
          });
        } else if (seen.has(code)) {
          ctx.addIssue({
            code: 'custom',
            path,
            message: `'${exercise.name}': muscle group '${code}' is listed more than once`,
          });
        }
        seen.add(code);
      });
    });
  });

export type CatalogMetadata = z.infer<typeof catalogMetadataSchema>;

export function parseCatalogMetadata(raw: unknown): CatalogMetadata {
  const result = catalogMetadataSchema.safeParse(raw);
  if (result.success) {
    return result.data;
  }
  const lines = result.error.issues.map((issue) => `  ${issue.path.join('.')}: ${issue.message}`);
  throw new Error(`Invalid exercise catalog metadata:\n${lines.join('\n')}`);
}

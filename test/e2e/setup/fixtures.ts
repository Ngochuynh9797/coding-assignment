import type { Decimal } from 'decimal.js';
import type { Response } from 'supertest';
import type { DataSource } from 'typeorm';
import { IdempotencyKey } from '@infra/idempotency/idempotency-key.entity';
import { DailyExerciseBest } from '@modules/personal-records/entities/daily-exercise-best.entity';
import { WorkoutEntry } from '@modules/workouts/entities/workout-entry.entity';
import { WorkoutSet } from '@modules/workouts/entities/workout-set.entity';
import type { HttpClient } from './test-app';

export interface SetInput {
  reps: number;
  weight: number;
  unit: string;
}

export interface EntryInput {
  date: string;
  exerciseName: string;
  sets: SetInput[];
}

export interface ErrorBody {
  error: { code: string; message: string; details: { field: string; issue: string }[] };
  requestId: string;
}

// supertest types the body as any; these keep the assertions typed.
export function bodyOf<T>(res: Response): T {
  return res.body as T;
}

export function errorOf(res: Response): ErrorBody['error'] {
  return bodyOf<ErrorBody>(res).error;
}

export function errorFields(res: Response): string[] {
  return errorOf(res).details.map((d) => d.field);
}

export function set(reps: number, weight: number, unit = 'kg'): SetInput {
  return { reps, weight, unit };
}

export function entry(input: EntryInput): EntryInput {
  return input;
}

export function logWorkouts(
  http: () => HttpClient,
  userId: string,
  entries: unknown[],
  headers: Record<string, string> = {},
) {
  return http().post(`/api/v1/users/${userId}/workouts`).set(headers).send({ entries });
}

export interface RowCounts {
  entries: number;
  sets: number;
  bests: number;
  idempotencyKeys: number;
}

export async function countRows(dataSource: DataSource): Promise<RowCounts> {
  const [entries, sets, bests, idempotencyKeys] = await Promise.all([
    dataSource.getRepository(WorkoutEntry).count(),
    dataSource.getRepository(WorkoutSet).count(),
    dataSource.getRepository(DailyExerciseBest).count(),
    dataSource.getRepository(IdempotencyKey).count(),
  ]);
  return { entries, sets, bests, idempotencyKeys };
}

export const NO_ROWS: RowCounts = { entries: 0, sets: 0, bests: 0, idempotencyKeys: 0 };

export function findSets(dataSource: DataSource): Promise<WorkoutSet[]> {
  return dataSource.getRepository(WorkoutSet).find({ order: { id: 'ASC' } });
}

export interface BestRow {
  userId: string;
  exerciseId: number;
  performedOn: string;
  bestWeightKg: string;
  bestWeightSetId: string;
  bestVolumeKg: string;
  bestVolumeSetId: string;
  bestE1rmKg: string;
  bestE1rmSetId: string;
}

// NUMERIC columns arrive as Decimal (decimalTransformer); fixed-scale strings make rows comparable
// with toEqual without depending on how pg formatted the value.
const fixed = (value: Decimal): string => value.toFixed(4);

export async function findBests(dataSource: DataSource): Promise<BestRow[]> {
  const rows = await dataSource.getRepository(DailyExerciseBest).find({
    order: { userId: 'ASC', exerciseId: 'ASC', performedOn: 'ASC' },
  });
  return rows.map((row) => ({
    userId: row.userId,
    exerciseId: row.exerciseId,
    performedOn: row.performedOn,
    bestWeightKg: fixed(row.bestWeightKg),
    bestWeightSetId: row.bestWeightSetId,
    bestVolumeKg: fixed(row.bestVolumeKg),
    bestVolumeSetId: row.bestVolumeSetId,
    bestE1rmKg: fixed(row.bestE1rmKg),
    bestE1rmSetId: row.bestE1rmSetId,
  }));
}

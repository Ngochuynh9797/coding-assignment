import { Decimal } from 'decimal.js';
import type { DataSource } from 'typeorm';
import { runInTransaction } from '@infra/database/transaction';
import type { DailyBestsWriter } from './daily-bests.writer';
import { bestsByGroup } from '../domain/pr-calculator';
import { DailyExerciseBest } from '../entities/daily-exercise-best.entity';

export interface RebuildResult {
  users: number;
  rows: number;
  durationMs: number;
}

interface SetRow {
  set_id: string;
  exercise_id: number;
  performed_on: string;
  reps: number;
  weight_kg: string;
}

// Workout tables are read by name: personal-records must not import from the workouts module.
// Not safe to run while the same user is logging: a request committed between the read and the
// DELETE would lose its bests until the next rebuild.
export class DailyBestsRebuilder {
  constructor(
    private readonly dataSource: DataSource,
    private readonly writer: DailyBestsWriter,
  ) {}

  async rebuild(userId?: string): Promise<RebuildResult> {
    const startedAt = performance.now();
    const userIds = userId === undefined ? await this.loggedUserIds() : [userId];
    let rows = 0;
    for (const id of userIds) {
      rows += await this.rebuildUser(id);
    }
    return { users: userIds.length, rows, durationMs: Math.round(performance.now() - startedAt) };
  }

  private async loggedUserIds(): Promise<string[]> {
    const rows = await this.dataSource
      .createQueryBuilder()
      .select('e.user_id', 'user_id')
      .distinct(true)
      .from('workout_entries', 'e')
      .orderBy('e.user_id')
      .getRawMany<{ user_id: string }>();
    return rows.map((row) => row.user_id);
  }

  private rebuildUser(userId: string): Promise<number> {
    return runInTransaction(this.dataSource, async (tx) => {
      // Same order the incremental flow processed the sets in: request by request (created_at), then
      // request order (UUIDv7 ids increase within a request), then set order. Ties keep the earlier set.
      // to_char: pg would otherwise parse DATE into a JS Date in the server's timezone.
      const rows = await tx
        .createQueryBuilder()
        .select('s.id', 'set_id')
        .addSelect('e.exercise_id', 'exercise_id')
        .addSelect(`to_char(e.performed_on, 'YYYY-MM-DD')`, 'performed_on')
        .addSelect('s.reps', 'reps')
        .addSelect('s.weight_kg', 'weight_kg')
        .from('workout_sets', 's')
        .innerJoin('workout_entries', 'e', 'e.id = s.entry_id')
        .where('e.user_id = :userId', { userId })
        .orderBy('e.created_at')
        .addOrderBy('e.id')
        .addOrderBy('s.set_index')
        .getRawMany<SetRow>();

      const bests = bestsByGroup(
        rows.map((row) => ({
          setId: row.set_id,
          exerciseId: row.exercise_id,
          performedOn: row.performed_on,
          reps: row.reps,
          weightKg: new Decimal(row.weight_kg),
        })),
      );
      await tx.delete(DailyExerciseBest, { userId });
      // The user's rows were just deleted, so the upsert's ON CONFLICT never fires: a plain insert.
      await this.writer.upsertBests(tx, userId, bests);
      return bests.length;
    });
  }
}

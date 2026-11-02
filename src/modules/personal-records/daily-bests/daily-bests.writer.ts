import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { bestsByGroup, type DailyBest, type PrSetInput } from '../domain/pr-calculator';

// The only raw SQL outside migrations and /health: TypeORM's orUpdate can only emit
// `col = EXCLUDED.col`, not a per-metric GREATEST with a conditional set id.
// unnest keeps the parameter count fixed whatever the bulk size. ORDER BY makes concurrent requests
// lock rows in the same order (no deadlock). In SET, `d.*` is always the old row, so the order of the
// assignments does not matter.
const UPSERT_DAILY_BESTS = `
  INSERT INTO daily_exercise_bests AS d (user_id, exercise_id, performed_on,
    best_weight_kg, best_weight_set_id, best_volume_kg, best_volume_set_id, best_e1rm_kg, best_e1rm_set_id)
  SELECT $1, t.*
  FROM unnest($2::int[], $3::date[], $4::numeric[], $5::uuid[], $6::numeric[], $7::uuid[], $8::numeric[], $9::uuid[])
    AS t(exercise_id, performed_on, w, w_id, v, v_id, e, e_id)
  ORDER BY t.exercise_id, t.performed_on
  ON CONFLICT (user_id, exercise_id, performed_on) DO UPDATE SET
    best_weight_set_id = CASE WHEN EXCLUDED.best_weight_kg > d.best_weight_kg THEN EXCLUDED.best_weight_set_id ELSE d.best_weight_set_id END,
    best_weight_kg     = GREATEST(d.best_weight_kg, EXCLUDED.best_weight_kg),
    best_volume_set_id = CASE WHEN EXCLUDED.best_volume_kg > d.best_volume_kg THEN EXCLUDED.best_volume_set_id ELSE d.best_volume_set_id END,
    best_volume_kg     = GREATEST(d.best_volume_kg, EXCLUDED.best_volume_kg),
    best_e1rm_set_id   = CASE WHEN EXCLUDED.best_e1rm_kg > d.best_e1rm_kg THEN EXCLUDED.best_e1rm_set_id ELSE d.best_e1rm_set_id END,
    best_e1rm_kg       = GREATEST(d.best_e1rm_kg, EXCLUDED.best_e1rm_kg)
`;

// Column scale of every best_* column.
const SCALE = 4;

@Injectable()
export class DailyBestsWriter {
  // Grouping in the application is required: one INSERT ... ON CONFLICT cannot update the same row
  // twice, which would happen when a request logs the same exercise twice on one day.
  async applySets(tx: EntityManager, userId: string, sets: readonly PrSetInput[]): Promise<void> {
    await this.upsertBests(tx, userId, bestsByGroup(sets));
  }

  async upsertBests(tx: EntityManager, userId: string, bests: readonly DailyBest[]): Promise<void> {
    if (bests.length === 0) {
      return;
    }
    await tx.query(UPSERT_DAILY_BESTS, [
      userId,
      bests.map((b) => b.exerciseId),
      bests.map((b) => b.performedOn),
      bests.map((b) => b.bestWeightKg.toFixed(SCALE)),
      bests.map((b) => b.bestWeightSetId),
      bests.map((b) => b.bestVolumeKg.toFixed(SCALE)),
      bests.map((b) => b.bestVolumeSetId),
      bests.map((b) => b.bestE1rmKg.toFixed(SCALE)),
      bests.map((b) => b.bestE1rmSetId),
    ]);
  }
}

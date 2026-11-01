import { Decimal } from 'decimal.js';

export interface PrSetInput {
  setId: string;
  exerciseId: number;
  performedOn: string;
  reps: number;
  weightKg: Decimal;
}

export interface SetMetrics {
  weightKg: Decimal;
  volumeKg: Decimal;
  e1rmKg: Decimal;
}

export interface DailyBest {
  exerciseId: number;
  performedOn: string;
  bestWeightKg: Decimal;
  bestWeightSetId: string;
  bestVolumeKg: Decimal;
  bestVolumeSetId: string;
  bestE1rmKg: Decimal;
  bestE1rmSetId: string;
}

// Same scale as best_volume_kg / best_e1rm_kg, so incremental upserts and the rebuild store identical values.
const COLUMN_SCALE = 4;

const roundToColumn = (value: Decimal): Decimal =>
  value.toDecimalPlaces(COLUMN_SCALE, Decimal.ROUND_HALF_UP);

export function metricsOf(reps: number, weightKg: Decimal): SetMetrics {
  return {
    weightKg,
    volumeKg: roundToColumn(weightKg.times(reps)),
    // Epley: weight × (1 + reps/30), written as × (30 + reps) / 30 so 1/30 is never truncated first.
    e1rmKg: roundToColumn(weightKg.times(30 + reps).div(30)),
  };
}

export function bestsByGroup(sets: readonly PrSetInput[]): DailyBest[] {
  const groups = new Map<string, DailyBest>();

  for (const set of sets) {
    const { weightKg, volumeKg, e1rmKg } = metricsOf(set.reps, set.weightKg);
    const key = `${set.exerciseId}|${set.performedOn}`;
    const best = groups.get(key);

    if (!best) {
      groups.set(key, {
        exerciseId: set.exerciseId,
        performedOn: set.performedOn,
        bestWeightKg: weightKg,
        bestWeightSetId: set.setId,
        bestVolumeKg: volumeKg,
        bestVolumeSetId: set.setId,
        bestE1rmKg: e1rmKg,
        bestE1rmSetId: set.setId,
      });
      continue;
    }

    // Strictly greater: on a tie the earlier set keeps the record, as the DB upsert does.
    if (weightKg.gt(best.bestWeightKg)) {
      best.bestWeightKg = weightKg;
      best.bestWeightSetId = set.setId;
    }
    if (volumeKg.gt(best.bestVolumeKg)) {
      best.bestVolumeKg = volumeKg;
      best.bestVolumeSetId = set.setId;
    }
    if (e1rmKg.gt(best.bestE1rmKg)) {
      best.bestE1rmKg = e1rmKg;
      best.bestE1rmSetId = set.setId;
    }
  }

  // Upserts run in this order so concurrent requests lock daily_exercise_bests rows consistently.
  return [...groups.values()].sort(
    (a, b) =>
      a.exerciseId - b.exerciseId ||
      (a.performedOn < b.performedOn ? -1 : a.performedOn > b.performedOn ? 1 : 0),
  );
}

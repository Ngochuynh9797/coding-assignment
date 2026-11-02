import { Logger } from '@nestjs/common';
import { Decimal } from 'decimal.js';
import { DateTime } from 'luxon';
import { type DataSource, In } from 'typeorm';
import { v7 } from 'uuid';
import { parseEnv } from '@config/env.validation';
import { createDataSource } from '@infra/database/data-source';
import { runInTransaction } from '@infra/database/transaction';
import { normalizeExerciseName } from '@modules/catalog/domain/normalize-exercise-name';
import { Exercise } from '@modules/catalog/entities/exercise.entity';
import { DailyBestsRebuilder } from '@modules/personal-records/daily-bests/daily-bests-rebuilder.service';
import { DailyBestsWriter } from '@modules/personal-records/daily-bests/daily-bests.writer';
import { WorkoutEntry } from '@modules/workouts/entities/workout-entry.entity';
import { UnitConverter } from '@shared/units/unit-converter';
import { BASE_UNIT_CODE, SUPPORTED_UNIT_CODES, WEIGHT_UNITS } from '@shared/units/unit.registry';

export const PERF_USER = 'perf-user';
const PERF_USER_ENTRIES = 50_000;
const BACKGROUND_USERS = 200;
const BACKGROUND_USER_ENTRIES = 2_000;
const BATCH_ENTRIES = 5_000;
const FIRST_DAY = '2021-11-01';
export const LAST_DAY = '2026-10-31';
const SEED = 20261102;

// Ranked by popularity: exercise k is picked with weight 1/k, so the first few dominate. `kg` is a
// typical working weight (0 = bodyweight). Chest exercises are spread over the ranking so the
// muscle-group filter matches a large, realistic share of entries.
const EXERCISES: readonly { name: string; kg: number }[] = [
  { name: 'Bench Press', kg: 80 },
  { name: 'Back Squat', kg: 110 },
  { name: 'Deadlift', kg: 140 },
  { name: 'Overhead Press', kg: 50 },
  { name: 'Incline Bench Press', kg: 65 },
  { name: 'Barbell Row', kg: 70 },
  { name: 'Pull-Up', kg: 0 },
  { name: 'Romanian Deadlift', kg: 90 },
  { name: 'Dumbbell Bench Press', kg: 30 },
  { name: 'Lat Pulldown', kg: 60 },
  { name: 'Leg Press', kg: 160 },
  { name: 'Barbell Curl', kg: 35 },
  { name: 'Triceps Pushdown', kg: 30 },
  { name: 'Incline Dumbbell Press', kg: 26 },
  { name: 'Front Squat', kg: 80 },
  { name: 'Dumbbell Row', kg: 32 },
  { name: 'Hip Thrust', kg: 100 },
  { name: 'Lateral Raise', kg: 10 },
  { name: 'Seated Cable Row', kg: 60 },
  { name: 'Push-Up', kg: 0 },
  { name: 'Skull Crusher', kg: 30 },
  { name: 'Dumbbell Fly', kg: 14 },
  { name: 'Hammer Curl', kg: 16 },
  { name: 'Leg Extension', kg: 50 },
  { name: 'Lying Leg Curl', kg: 40 },
  { name: 'Standing Calf Raise', kg: 80 },
  { name: 'Face Pull', kg: 25 },
  { name: 'Bulgarian Split Squat', kg: 24 },
  { name: 'Arnold Press', kg: 18 },
  { name: 'Cable Crossover', kg: 15 },
  { name: 'Chin-Up', kg: 0 },
  { name: 'Preacher Curl', kg: 25 },
  { name: 'Goblet Squat', kg: 28 },
  { name: 'Walking Lunge', kg: 20 },
  { name: 'Sumo Deadlift', kg: 130 },
  { name: 'Push Press', kg: 60 },
  { name: 'Plank', kg: 0 },
  { name: 'Hanging Leg Raise', kg: 0 },
  { name: 'Kettlebell Swing', kg: 24 },
  { name: "Farmer's Walk", kg: 40 },
];

const logger = new Logger('SeedLarge');

// mulberry32: a fixed seed makes every run produce the same data, so measurements are comparable.
function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface GeneratedEntry {
  id: string;
  userId: string;
  exerciseId: number;
  performedOn: string;
}

interface GeneratedSet {
  id: string;
  entryId: string;
  setIndex: number;
  reps: number;
  weight: string;
  unit: string;
  weightKg: string;
}

interface Exercises {
  ids: number[];
  kg: number[];
  cumulative: number[];
}

class Generator {
  private readonly random = createRandom(SEED);
  private readonly converter = new UnitConverter(WEIGHT_UNITS);
  private readonly otherUnits = SUPPORTED_UNIT_CODES.filter((code) => code !== BASE_UNIT_CODE);
  private readonly days: string[];
  private readonly dayIndex: Map<string, number>;

  constructor(private readonly exercises: Exercises) {
    const first = DateTime.fromISO(FIRST_DAY, { zone: 'utc' });
    const count = DateTime.fromISO(LAST_DAY, { zone: 'utc' }).diff(first, 'days').days + 1;
    this.days = Array.from({ length: count }, (_, i) => first.plus({ days: i }).toISODate()!);
    this.dayIndex = new Map(this.days.map((day, i) => [day, i]));
  }

  // Every day is a training day: 50 000 entries over 5 years is ~27 entries per day.
  perfUserDays(): string[] {
    return Array.from(
      { length: PERF_USER_ENTRIES },
      () => this.days[Math.floor(this.random() * this.days.length)]!,
    ).sort();
  }

  // 1-4 entries on roughly every other day, stopping at the entry budget.
  backgroundUserDays(): string[] {
    const result: string[] = [];
    for (const day of this.days) {
      if (this.random() < 0.5) {
        const count = 1 + Math.floor(this.random() * 4);
        for (let i = 0; i < count && result.length < BACKGROUND_USER_ENTRIES; i++) {
          result.push(day);
        }
      }
    }
    return result;
  }

  // Ordered by date, so UUIDv7 ids grow with the date as they would for a real user.
  entries(userId: string, days: string[]): { entries: GeneratedEntry[]; sets: GeneratedSet[] } {
    const entries: GeneratedEntry[] = [];
    const sets: GeneratedSet[] = [];
    for (const performedOn of days) {
      const rank = this.pickExercise();
      const entry = { id: v7(), userId, exerciseId: this.exercises.ids[rank]!, performedOn };
      entries.push(entry);
      const progress = this.dayIndex.get(performedOn)! / this.days.length;
      const setCount = 3 + Math.floor(this.random() * 3);
      for (let setIndex = 1; setIndex <= setCount; setIndex++) {
        sets.push(this.set(entry.id, setIndex, this.exercises.kg[rank]!, progress));
      }
    }
    return { entries, sets };
  }

  private pickExercise(): number {
    const { cumulative } = this.exercises;
    const target = this.random() * cumulative.at(-1)!;
    const index = cumulative.findIndex((c) => c >= target);
    return index === -1 ? cumulative.length - 1 : index;
  }

  private set(
    entryId: string,
    setIndex: number,
    typicalKg: number,
    progress: number,
  ): GeneratedSet {
    const unit =
      this.otherUnits.length > 0 && this.random() < 0.2
        ? this.otherUnits[Math.floor(this.random() * this.otherUnits.length)]!
        : BASE_UNIT_CODE;
    const kg = typicalKg * (0.8 + 0.4 * progress) * (0.85 + 0.25 * this.random());
    // Rounded to 2.5 in the entered unit, the way plates are loaded.
    const weight =
      typicalKg === 0
        ? new Decimal(0)
        : this.converter.fromKg(new Decimal(kg), unit).div(2.5).round().times(2.5);
    return {
      id: v7(),
      entryId,
      setIndex,
      reps:
        typicalKg === 0 ? 5 + Math.floor(this.random() * 16) : 1 + Math.floor(this.random() * 12),
      weight: weight.toFixed(4),
      unit,
      weightKg: this.converter.toStoredKg(weight, unit).toFixed(4),
    };
  }
}

async function loadExercises(dataSource: DataSource): Promise<Exercises> {
  const keys = EXERCISES.map((e) => normalizeExerciseName(e.name));
  const rows = await dataSource.getRepository(Exercise).find({ where: { nameKey: In(keys) } });
  const idByKey = new Map(rows.map((row) => [row.nameKey, row.id]));
  const missing = EXERCISES.filter((_, i) => !idByKey.has(keys[i]!)).map((e) => e.name);
  if (missing.length > 0) {
    throw new Error(
      `Exercises missing from the catalog (run seed:catalog first): ${missing.join(', ')}`,
    );
  }
  let total = 0;
  return {
    ids: keys.map((key) => idByKey.get(key)!),
    kg: EXERCISES.map((e) => e.kg),
    cumulative: EXERCISES.map((_, rank) => (total += 1 / (rank + 1))),
  };
}

// unnest binds one array per column: a fixed 4 or 7 parameters whatever the batch size, where a
// multi-row VALUES would exceed PostgreSQL's 65 535 bind parameters.
async function insertBatch(
  dataSource: DataSource,
  entries: GeneratedEntry[],
  sets: GeneratedSet[],
): Promise<void> {
  await runInTransaction(dataSource, async (tx) => {
    await tx.query(
      `INSERT INTO workout_entries (id, user_id, exercise_id, performed_on)
       SELECT * FROM unnest($1::uuid[], $2::text[], $3::int[], $4::date[])`,
      [
        entries.map((e) => e.id),
        entries.map((e) => e.userId),
        entries.map((e) => e.exerciseId),
        entries.map((e) => e.performedOn),
      ],
    );
    await tx.query(
      `INSERT INTO workout_sets (id, entry_id, set_index, reps, weight, unit, weight_kg)
       SELECT * FROM unnest($1::uuid[], $2::uuid[], $3::smallint[], $4::int[], $5::numeric[], $6::text[], $7::numeric[])`,
      [
        sets.map((s) => s.id),
        sets.map((s) => s.entryId),
        sets.map((s) => s.setIndex),
        sets.map((s) => s.reps),
        sets.map((s) => s.weight),
        sets.map((s) => s.unit),
        sets.map((s) => s.weightKg),
      ],
    );
  });
}

async function seedUser(
  dataSource: DataSource,
  generator: Generator,
  userId: string,
  days: string[],
): Promise<number> {
  const { entries, sets } = generator.entries(userId, days);
  const setsByEntry = new Map<string, GeneratedSet[]>();
  for (const set of sets) {
    const list = setsByEntry.get(set.entryId) ?? [];
    list.push(set);
    setsByEntry.set(set.entryId, list);
  }
  for (let start = 0; start < entries.length; start += BATCH_ENTRIES) {
    const batch = entries.slice(start, start + BATCH_ENTRIES);
    await insertBatch(
      dataSource,
      batch,
      batch.flatMap((e) => setsByEntry.get(e.id)!),
    );
  }
  return sets.length;
}

async function main(): Promise<void> {
  const startedAt = performance.now();
  const dataSource = await createDataSource(parseEnv(process.env)).initialize();
  try {
    const generator = new Generator(await loadExercises(dataSource));
    const backgroundUsers = Array.from(
      { length: BACKGROUND_USERS },
      (_, i) => `perf-bg-${String(i + 1).padStart(3, '0')}`,
    );
    const users = [PERF_USER, ...backgroundUsers];

    // Re-runnable: drop this script's previous data (sets cascade). Daily bests are replaced by the
    // rebuild below, which deletes each user's rows first.
    const deleted = await dataSource
      .createQueryBuilder()
      .delete()
      .from(WorkoutEntry)
      .where('user_id IN (:...users)', { users })
      .execute();
    logger.log(`Deleted ${deleted.affected ?? 0} previous entries`);

    let sets = await seedUser(dataSource, generator, PERF_USER, generator.perfUserDays());
    logger.log(`${PERF_USER}: ${PERF_USER_ENTRIES} entries, ${sets} sets`);
    for (const userId of backgroundUsers) {
      sets += await seedUser(dataSource, generator, userId, generator.backgroundUserDays());
    }
    logger.log(`${users.length} users, ${sets} sets inserted`);

    const rebuilder = new DailyBestsRebuilder(dataSource, new DailyBestsWriter());
    let bestRows = 0;
    for (const userId of users) {
      bestRows += (await rebuilder.rebuild(userId)).rows;
    }
    logger.log(`Rebuilt ${bestRows} daily best rows`);

    // Fresh statistics and visibility map, otherwise the planner works from defaults and index-only
    // scans fall back to the heap: measurements would not reflect a settled table.
    await dataSource.query('VACUUM (ANALYZE) workout_entries, workout_sets, daily_exercise_bests');
    logger.log(`Done in ${Math.round((performance.now() - startedAt) / 1000)} s`);
  } finally {
    await dataSource.destroy();
  }
}

if (require.main === module) {
  main().catch((error: unknown) => {
    logger.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
    process.exitCode = 1;
  });
}

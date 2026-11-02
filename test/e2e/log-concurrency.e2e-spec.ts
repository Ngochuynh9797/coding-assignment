import { DailyBestsRebuilder } from '@modules/personal-records/daily-bests-rebuilder.service';
import { DailyBestsWriter } from '@modules/personal-records/daily-bests.writer';
import { bodyOf, countRows, entry, findBests, logWorkouts, set } from './setup/fixtures';
import { createTestApp, resetDatabase, type TestApp } from './setup/test-app';

const USER = 'user_concurrent';
const DAY_1 = '2026-10-20';

interface LoggedBody {
  data: { entries: { date: string; exercise: { id: number }; sets: { id: string }[] }[] };
}

// Every request below is started before any is awaited (Promise.all); the app listens on a real port,
// so each one has its own HTTP connection and its own pooled database connection.
describe('POST /users/:userId/workouts under concurrency', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });

  beforeEach(() => resetDatabase(t.dataSource));

  afterAll(() => t.close());

  const bench = (date: string, weight: number) =>
    entry({ date, exerciseName: 'Bench Press', sets: [set(5, weight)] });

  async function expectBestsMatchRebuild(): Promise<void> {
    const incremental = await findBests(t.dataSource);
    await new DailyBestsRebuilder(t.dataSource, new DailyBestsWriter()).rebuild();
    expect(await findBests(t.dataSource)).toEqual(incremental);
  }

  it('writes once when two requests with the same key arrive together', async () => {
    const key = { 'Idempotency-Key': 'concurrent-same-key' };

    const responses = await Promise.all([
      logWorkouts(t.http, USER, [bench(DAY_1, 100)], key),
      logWorkouts(t.http, USER, [bench(DAY_1, 100)], key),
    ]);

    expect(responses.map((r) => r.status)).toEqual([201, 201]);
    expect(responses[0].body).toEqual(responses[1].body);
    expect(responses.filter((r) => r.headers['idempotent-replayed'] === 'true')).toHaveLength(1);
    expect(await countRows(t.dataSource)).toEqual({
      entries: 1,
      sets: 1,
      bests: 1,
      idempotencyKeys: 1,
    });
  });

  // Probabilistic: with the lock ordering removed, a deadlock (40P01 → 500) was measured in roughly
  // 2-5% of iterations at 10 days, and almost never at 2 days, so a 2-day / 20-iteration loop would not
  // catch a regression.
  it('does not deadlock when two bulk requests touch the same days in opposite order', async () => {
    const ITERATIONS = 50;
    const days = Array.from({ length: 10 }, (_, d) => `2026-09-${String(d + 1).padStart(2, '0')}`);
    const heaviest = new Map<string, { weight: number; setId: string }>();
    // Built from integer grams, so the JSON number has at most 3 decimals (no float noise).
    const weightFor = (date: string, i: number, offset: number): number =>
      (100_000 + days.indexOf(date) * 10_000 + i * 10 + offset) / 1000;

    for (let i = 0; i < ITERATIONS; i++) {
      // Distinct weights everywhere, so each day has a single heaviest set and no tie-break is involved.
      const aSent = days.map((date) => ({ date, weight: weightFor(date, i, 0) }));
      const bSent = [...days].reverse().map((date) => ({ date, weight: weightFor(date, i, 5) }));
      const [a, b] = await Promise.all([
        logWorkouts(
          t.http,
          USER,
          aSent.map((s) => bench(s.date, s.weight)),
        ),
        logWorkouts(
          t.http,
          USER,
          bSent.map((s) => bench(s.date, s.weight)),
        ),
      ]);

      expect([a.status, b.status]).toEqual([201, 201]);
      for (const [sent, res] of [
        [aSent, a],
        [bSent, b],
      ] as const) {
        sent.forEach(({ date, weight }, k) => {
          const setId = bodyOf<LoggedBody>(res).data.entries[k]!.sets[0]!.id;
          if (weight > (heaviest.get(date)?.weight ?? -1)) {
            heaviest.set(date, { weight, setId });
          }
        });
      }
    }

    expect((await countRows(t.dataSource)).entries).toBe(ITERATIONS * days.length * 2);
    const bests = await findBests(t.dataSource);
    expect(bests.map((b) => [b.performedOn, b.bestWeightKg, b.bestWeightSetId])).toEqual(
      days.map((date) => [
        date,
        weightFor(date, ITERATIONS - 1, 5).toFixed(4),
        heaviest.get(date)!.setId,
      ]),
    );
    await expectBestsMatchRebuild();
  });

  it('keeps both entries when two requests without a key log the same exercise and day', async () => {
    const responses = await Promise.all([
      logWorkouts(t.http, USER, [bench(DAY_1, 100)]),
      logWorkouts(t.http, USER, [bench(DAY_1, 110)]),
    ]);

    expect(responses.map((r) => r.status)).toEqual([201, 201]);
    expect(await countRows(t.dataSource)).toEqual({
      entries: 2,
      sets: 2,
      bests: 1,
      idempotencyKeys: 0,
    });
    const [best] = await findBests(t.dataSource);
    expect(best).toMatchObject({
      bestWeightKg: '110.0000',
      bestWeightSetId: bodyOf<LoggedBody>(responses[1]).data.entries[0]!.sets[0]!.id,
    });
    await expectBestsMatchRebuild();
  });
});

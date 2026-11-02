import { DailyBestsRebuilder } from '@modules/personal-records/daily-bests-rebuilder.service';
import { DailyBestsWriter } from '@modules/personal-records/daily-bests.writer';
import { entry, findBests, logWorkouts, set, type EntryInput } from './setup/fixtures';
import { createTestApp, resetDatabase, type TestApp } from './setup/test-app';

// Requests are sent one after another, in this order: the incremental tie-break (keep the set logged
// first) depends on request order, and the rebuild must reproduce it.
const REQUESTS: [string, EntryInput[]][] = [
  [
    'alice',
    [
      // Same-request ties: two identical sets, and two sets with equal volume (10 × 50 vs 5 × 100).
      entry({
        date: '2026-10-10',
        exerciseName: 'Bench Press',
        sets: [set(5, 100), set(5, 100), set(10, 50)],
      }),
      entry({ date: '2026-10-10', exerciseName: 'Bench Press', sets: [set(3, 100)] }),
      entry({ date: '2026-10-11', exerciseName: 'Back Squat', sets: [set(5, 140), set(3, 150)] }),
    ],
  ],
  [
    'alice',
    [
      // Cross-request ties on the same day, one of them entered in pounds (225 lb = 102.0583 kg).
      entry({ date: '2026-10-12', exerciseName: 'Bench Press', sets: [set(1, 102.0583)] }),
    ],
  ],
  [
    'alice',
    [
      entry({ date: '2026-10-12', exerciseName: 'Bench Press', sets: [set(1, 225, 'lb')] }),
      entry({ date: '2026-10-10', exerciseName: 'Bench Press', sets: [set(5, 100)] }),
    ],
  ],
  [
    'alice',
    [
      // Backdated, heavier than everything logged so far.
      entry({ date: '2026-09-01', exerciseName: 'Bench Press', sets: [set(2, 110)] }),
      entry({ date: '2026-10-11', exerciseName: 'Back Squat', sets: [set(3, 150), set(1, 160)] }),
    ],
  ],
  [
    'bob',
    [
      entry({
        date: '2026-10-10',
        exerciseName: 'Bench Press',
        sets: [set(8, 185, 'lb'), set(8, 84, 'kg')],
      }),
      entry({ date: '2026-10-10', exerciseName: 'Deadlift', sets: [set(5, 180), set(5, 180)] }),
      entry({ date: '2026-10-10', exerciseName: 'Push-Up', sets: [set(20, 0), set(15, 0)] }),
    ],
  ],
  [
    'bob',
    [
      entry({ date: '2026-10-10', exerciseName: 'Deadlift', sets: [set(5, 180), set(4, 190)] }),
      entry({ date: '2026-10-10', exerciseName: 'Push-Up', sets: [set(20, 0), set(10, 10)] }),
    ],
  ],
  [
    'carol',
    [
      entry({
        date: '2026-10-01',
        exerciseName: 'Overhead Press',
        sets: [set(5, 135, 'LBS'), set(5, 135, 'lb')],
      }),
      entry({ date: '2026-10-02', exerciseName: 'Overhead Press', sets: [set(5, 61.235, 'kg')] }),
    ],
  ],
];

describe('daily_exercise_bests rebuild', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
    await resetDatabase(t.dataSource);
  });

  afterAll(() => t.close());

  it('rebuilds exactly the rows written incrementally, including the winning set ids', async () => {
    for (const [userId, entries] of REQUESTS) {
      const res = await logWorkouts(t.http, userId, entries);
      expect(res.status).toBe(201);
    }
    const incremental = await findBests(t.dataSource);
    expect(incremental.length).toBeGreaterThanOrEqual(8);

    const result = await new DailyBestsRebuilder(t.dataSource, new DailyBestsWriter()).rebuild();

    expect(result).toMatchObject({ users: 3, rows: incremental.length });
    expect(await findBests(t.dataSource)).toEqual(incremental);
  });

  it('rebuilds a single user without touching the others', async () => {
    const before = await findBests(t.dataSource);

    const result = await new DailyBestsRebuilder(t.dataSource, new DailyBestsWriter()).rebuild(
      'bob',
    );

    expect(result.users).toBe(1);
    expect(await findBests(t.dataSource)).toEqual(before);
  });
});

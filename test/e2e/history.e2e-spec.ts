import { bodyOf, entry, errorFields, errorOf, logWorkouts, set } from './setup/fixtures';
import { createTestApp, resetDatabase, type TestApp } from './setup/test-app';

const USER = 'user_history';
const OTHER_USER = 'user_history_other';

interface HistoryBody {
  data: {
    id: string;
    date: string;
    exercise: { id: number; name: string };
    sets: {
      setIndex: number;
      reps: number;
      weight: number;
      unit: string;
      converted?: { weight: number; unit: string };
    }[];
    loggedAt: string;
  }[];
  pageInfo: { nextCursor: string | null; hasMore: boolean };
  meta: { message?: string };
}

interface LoggedBody {
  data: { entries: { id: string; date: string }[] };
}

const day = (month: number, dayOfMonth: number): string =>
  `2026-${String(month).padStart(2, '0')}-${String(dayOfMonth).padStart(2, '0')}`;

describe('GET /users/:userId/workouts', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(() => t.close());

  const history = (query: Record<string, string | number> = {}, userId = USER) =>
    t.http().get(`/api/v1/users/${userId}/workouts`).query(query);

  async function okHistory(query: Record<string, string | number> = {}): Promise<HistoryBody> {
    const res = await history(query);
    expect(res.status).toBe(200);
    return bodyOf<HistoryBody>(res);
  }

  const names = (body: HistoryBody): string[] => body.data.map((e) => e.exercise.name);

  describe('filters', () => {
    let otherUserEntryId: string;

    beforeAll(async () => {
      await resetDatabase(t.dataSource);
      const res = await logWorkouts(t.http, USER, [
        entry({ date: day(10, 1), exerciseName: 'Bench Press', sets: [set(5, 100)] }),
        entry({ date: day(10, 2), exerciseName: 'Incline Bench Press', sets: [set(8, 70)] }),
        entry({ date: day(10, 3), exerciseName: 'Back Squat', sets: [set(5, 140)] }),
        // Farmer's Walk has no muscle groups in the catalog.
        entry({ date: day(10, 4), exerciseName: "Farmer's Walk", sets: [set(1, 60)] }),
        entry({ date: day(10, 5), exerciseName: 'Dumbbell Fly', sets: [set(12, 16)] }),
        entry({ date: day(10, 6), exerciseName: 'Overhead Press', sets: [set(5, 60)] }),
      ]);
      expect(res.status).toBe(201);
      const other = await logWorkouts(t.http, OTHER_USER, [
        entry({ date: day(10, 1), exerciseName: 'Bench Press', sets: [set(5, 80)] }),
      ]);
      otherUserEntryId = (other.body as LoggedBody).data.entries[0]!.id;
    });

    it('matches a partial exercise name', async () => {
      const body = await okHistory({ exercise: 'bench' });

      expect(names(body)).toEqual(['Incline Bench Press', 'Bench Press']);
    });

    it('treats _ literally', async () => {
      const body = await okHistory({ exercise: '_' });

      expect(body.data).toEqual([]);
    });

    it('normalizes repeated whitespace in the exercise term', async () => {
      const body = await okHistory({ exercise: 'Bench  Press' });

      expect(names(body)).toEqual(['Incline Bench Press', 'Bench Press']);
    });

    it('filters by muscle group, leaving out exercises without one', async () => {
      const body = await okHistory({ muscleGroup: 'chest' });

      expect(names(body)).toEqual(['Dumbbell Fly', 'Incline Bench Press', 'Bench Press']);
    });

    it('intersects the exercise and muscle-group filters', async () => {
      const press = await okHistory({ exercise: 'press' });
      const pressAndChest = await okHistory({ exercise: 'press', muscleGroup: 'chest' });

      expect(names(press)).toEqual(['Overhead Press', 'Incline Bench Press', 'Bench Press']);
      expect(names(pressAndChest)).toEqual(['Incline Bench Press', 'Bench Press']);
    });

    it('includes both ends of the date range', async () => {
      const body = await okHistory({ from: day(10, 2), to: day(10, 4) });

      expect(body.data.map((e) => e.date)).toEqual([day(10, 4), day(10, 3), day(10, 2)]);
    });

    it("never returns another user's entries", async () => {
      const body = await okHistory();

      expect(body.data).toHaveLength(6);
      expect(body.data.map((e) => e.id)).not.toContain(otherUserEntryId);
    });

    it('returns 200 with a message for a date range without data', async () => {
      const body = await okHistory({ from: day(1, 1), to: day(1, 31) });

      expect(body).toEqual({
        data: [],
        pageInfo: { nextCursor: null, hasMore: false },
        meta: { message: 'No workouts found for the given filters' },
      });
    });

    it('returns 200, not 404, for an exercise term that matches nothing', async () => {
      const body = await okHistory({ exercise: 'xyz' });

      expect(body.data).toEqual([]);
      expect(body.pageInfo.hasMore).toBe(false);
      expect(body.meta.message).toEqual(expect.any(String));
    });

    it('rejects from after to', async () => {
      const res = await history({ from: day(10, 5), to: day(10, 1) });

      expect(res.status).toBe(400);
      expect(errorOf(res).code).toBe('VALIDATION_ERROR');
      expect(errorFields(res)).toEqual(['from']);
    });
  });

  describe('pagination', () => {
    const SAME_DAY = day(9, 10);
    let logged: { id: string; date: string }[];

    beforeAll(async () => {
      await resetDatabase(t.dataSource);
      const distinctDays = [
        ...Array.from({ length: 31 }, (_, i) => day(8, i + 1)),
        ...Array.from({ length: 4 }, (_, i) => day(9, i + 1)),
      ];
      const entries = [
        ...distinctDays.map((date) =>
          entry({ date, exerciseName: 'Back Squat', sets: [set(5, 100)] }),
        ),
        ...Array.from({ length: 10 }, (_, i) =>
          entry({ date: SAME_DAY, exerciseName: 'Bench Press', sets: [set(5, 60 + i)] }),
        ),
      ];
      const res = await logWorkouts(t.http, USER, entries);
      expect(res.status).toBe(201);
      logged = bodyOf<LoggedBody>(res).data.entries;
      expect(logged).toHaveLength(45);
    });

    async function walk(
      limit: number,
      onPage?: (page: number) => Promise<void>,
    ): Promise<HistoryBody['data']> {
      const seen: HistoryBody['data'] = [];
      let cursor: string | null = null;
      for (let page = 1; ; page++) {
        const body = await okHistory(cursor === null ? { limit } : { limit, cursor });
        expect(body.data.length).toBeLessThanOrEqual(limit);
        seen.push(...body.data);
        await onPage?.(page);
        if (!body.pageInfo.hasMore) {
          expect(body.pageInfo.nextCursor).toBeNull();
          return seen;
        }
        cursor = body.pageInfo.nextCursor;
        expect(cursor).toEqual(expect.any(String));
        expect(page).toBeLessThan(100);
      }
    }

    it('visits every entry exactly once, ordered by date then newest-logged first', async () => {
      const seen = await walk(7);
      const ids = seen.map((e) => e.id);

      expect(ids).toHaveLength(45);
      expect(new Set(ids)).toEqual(new Set(logged.map((e) => e.id)));
      for (let i = 1; i < seen.length; i++) {
        const [prev, cur] = [seen[i - 1]!, seen[i]!];
        expect(prev.date > cur.date || (prev.date === cur.date && prev.id > cur.id)).toBe(true);
      }
      // Entries of one request are logged in array order, so the last one is the newest.
      const sameDayLogged = logged.filter((e) => e.date === SAME_DAY).map((e) => e.id);
      expect(seen.filter((e) => e.date === SAME_DAY).map((e) => e.id)).toEqual(
        sameDayLogged.reverse(),
      );
    });

    it('does not repeat entries when an older entry is logged mid-walk', async () => {
      let added: string | undefined;
      const seen = await walk(7, async (page) => {
        if (page === 2) {
          const res = await logWorkouts(t.http, USER, [
            entry({ date: day(7, 1), exerciseName: 'Back Squat', sets: [set(5, 100)] }),
          ]);
          added = bodyOf<LoggedBody>(res).data.entries[0]!.id;
        }
      });
      const ids = seen.map((e) => e.id);

      expect(new Set(ids).size).toBe(ids.length);
      expect(new Set(ids)).toEqual(new Set([...logged.map((e) => e.id), added]));
    });

    it('rejects a tampered cursor', async () => {
      const res = await history({ cursor: 'not-a-real-cursor' });

      expect(res.status).toBe(400);
      expect(errorOf(res).code).toBe('INVALID_CURSOR');
    });

    it.each([0, 101, 'abc'])('rejects limit=%s', async (limit) => {
      const res = await history({ limit });

      expect(res.status).toBe(400);
      expect(errorOf(res).code).toBe('VALIDATION_ERROR');
      expect(errorFields(res)).toContain('limit');
    });
  });

  describe('units', () => {
    beforeAll(async () => {
      await resetDatabase(t.dataSource);
      const res = await logWorkouts(t.http, USER, [
        entry({
          date: day(10, 1),
          exerciseName: 'Bench Press',
          sets: [set(5, 225, 'lb'), set(5, 100, 'kg')],
        }),
      ]);
      expect(res.status).toBe(201);
    });

    it('returns original weights without converted when unit is omitted', async () => {
      const body = await okHistory();

      expect(body.data[0]!.sets).toEqual([
        { setIndex: 1, reps: 5, weight: 225, unit: 'lb' },
        { setIndex: 2, reps: 5, weight: 100, unit: 'kg' },
      ]);
    });

    it.each(['lb', 'LBS'])('adds converted weights for unit=%s', async (unit) => {
      const body = await okHistory({ unit });

      expect(body.data[0]!.sets.map((s) => s.converted)).toEqual([
        { weight: 225, unit: 'lb' },
        { weight: 220.46, unit: 'lb' },
      ]);
    });

    it('rejects an unsupported unit', async () => {
      const res = await history({ unit: 'stn' });

      expect(res.status).toBe(400);
      expect(errorOf(res).details).toEqual([
        { field: 'unit', issue: "Unsupported unit 'stn'. Supported units: kg, lb" },
      ]);
    });
  });
});

import {
  bodyOf,
  entry,
  errorFields,
  errorOf,
  logWorkouts,
  set,
  type SetInput,
} from './setup/fixtures';
import { createTestApp, resetDatabase, type TestApp } from './setup/test-app';

const USER = 'user_pr';
const NO_RECORDS = { maxWeight: null, maxVolume: null, bestEstimated1RM: null };

interface PrRecordBody {
  value: number;
  unit: string;
  weight: number;
  reps: number;
  achievedOn: string;
  setId: string;
}

type Records = Record<'maxWeight' | 'maxVolume' | 'bestEstimated1RM', PrRecordBody | null>;

interface Delta {
  absolute: number | null;
  percent: number | null;
  improved: boolean | null;
}

interface RecordsBody {
  data: {
    exercise: { id: number; name: string };
    range: { from: string | null; to: string | null };
    records: Records;
  };
  meta: { message?: string };
}

interface Period {
  range: { from: string; to: string };
  records: Records;
}

interface CompareBody {
  data: { unit: string; current: Period; previous: Period; delta: Record<keyof Records, Delta> };
  meta: { message?: string };
}

interface LoggedBody {
  data: { entries: { sets: { id: string }[] }[] };
}

describe('personal records', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });

  beforeEach(() => resetDatabase(t.dataSource));

  afterAll(() => t.close());

  async function logBench(
    date: string,
    sets: SetInput[],
    exerciseName = 'Bench Press',
  ): Promise<string[]> {
    const res = await logWorkouts(t.http, USER, [entry({ date, exerciseName, sets })]);
    expect(res.status).toBe(201);
    return bodyOf<LoggedBody>(res).data.entries[0]!.sets.map((s) => s.id);
  }

  const records = (query: Record<string, string>) =>
    t
      .http()
      .get(`/api/v1/users/${USER}/personal-records`)
      .query({ exercise: 'Bench Press', ...query });

  async function okRecords(query: Record<string, string> = {}): Promise<Records> {
    const res = await records(query);
    expect(res.status).toBe(200);
    return bodyOf<RecordsBody>(res).data.records;
  }

  describe('GET /personal-records', () => {
    it('finds each record on the set and day that achieved it', async () => {
      const [heaviest] = await logBench('2026-10-01', [set(1, 120)]);
      const [mostVolume] = await logBench('2026-10-05', [set(10, 90)]);
      const [best1RM] = await logBench('2026-10-08', [set(5, 110)]);

      const res = await records({});

      expect(res.status).toBe(200);
      const benchId = bodyOf<RecordsBody>(res).data.exercise.id;
      expect(res.body).toEqual({
        data: {
          exercise: { id: benchId, name: 'Bench Press' },
          range: { from: null, to: null },
          records: {
            maxWeight: {
              value: 120,
              unit: 'kg',
              weight: 120,
              reps: 1,
              achievedOn: '2026-10-01',
              setId: heaviest,
            },
            maxVolume: {
              value: 900,
              unit: 'kg',
              weight: 90,
              reps: 10,
              achievedOn: '2026-10-05',
              setId: mostVolume,
            },
            bestEstimated1RM: {
              value: 128.33,
              unit: 'kg',
              weight: 110,
              reps: 5,
              achievedOn: '2026-10-08',
              setId: best1RM,
            },
          },
        },
        meta: {},
      });
    });

    it('returns the earliest day on a tie, whatever the logging order', async () => {
      await logBench('2026-10-10', [set(3, 100)]);
      const [earlier] = await logBench('2026-10-03', [set(3, 100)]);

      const { maxWeight } = await okRecords();

      expect(maxWeight).toMatchObject({ achievedOn: '2026-10-03', setId: earlier });
    });

    it('moves the record to an older day when a heavier set is backdated', async () => {
      await logBench('2026-10-10', [set(3, 100)]);
      expect((await okRecords()).maxWeight?.achievedOn).toBe('2026-10-10');

      const [backdated] = await logBench('2026-10-02', [set(3, 105)]);

      expect((await okRecords()).maxWeight).toMatchObject({
        value: 105,
        achievedOn: '2026-10-02',
        setId: backdated,
      });
    });

    it('treats 225 lb and 102.0583 kg as a tie and keeps the earlier day', async () => {
      const [pounds] = await logBench('2026-10-01', [set(1, 225, 'lb')]);
      await logBench('2026-10-02', [set(1, 102.0583, 'kg')]);

      const original = await okRecords();
      const inKg = await okRecords({ unit: 'kg' });

      expect(original.maxWeight).toEqual({
        value: 225,
        unit: 'lb',
        weight: 225,
        reps: 1,
        achievedOn: '2026-10-01',
        setId: pounds,
      });
      expect(inKg.maxWeight).toEqual({
        value: 102.06,
        unit: 'kg',
        weight: 102.06,
        reps: 1,
        achievedOn: '2026-10-01',
        setId: pounds,
      });
    });

    it('returns null records with a message for bodyweight-only sets', async () => {
      await logBench('2026-10-01', [set(20, 0), set(15, 0)], 'Push-Up');

      const res = await t
        .http()
        .get(`/api/v1/users/${USER}/personal-records`)
        .query({ exercise: 'push-up' });

      expect(res.status).toBe(200);
      expect(bodyOf<RecordsBody>(res).data.records).toEqual(NO_RECORDS);
      expect(bodyOf<RecordsBody>(res).meta.message).toBe(
        'No weighted sets for this exercise in the given range',
      );
    });

    it('returns 200 with null records for a range without data', async () => {
      await logBench('2026-10-01', [set(5, 100)]);

      const res = await records({ from: '2026-09-01', to: '2026-09-30' });

      expect(res.status).toBe(200);
      expect(bodyOf<RecordsBody>(res).data.range).toEqual({ from: '2026-09-01', to: '2026-09-30' });
      expect(bodyOf<RecordsBody>(res).data.records).toEqual(NO_RECORDS);
      expect(bodyOf<RecordsBody>(res).meta.message).toEqual(expect.any(String));
    });

    it('only considers sets inside the range', async () => {
      await logBench('2026-09-15', [set(1, 150)]);
      const [inRange] = await logBench('2026-10-15', [set(1, 120)]);

      const { maxWeight } = await okRecords({ from: '2026-10-01', to: '2026-10-31' });

      expect(maxWeight).toMatchObject({ value: 120, setId: inRange });
    });

    it('returns 404 for an exercise that is not in the catalog', async () => {
      const res = await records({ exercise: 'Moon Press' });

      expect(res.status).toBe(404);
      expect(errorOf(res).code).toBe('EXERCISE_NOT_FOUND');
    });
  });

  describe('GET /personal-records/compare', () => {
    const compare = (query: Record<string, string>) =>
      t
        .http()
        .get(`/api/v1/users/${USER}/personal-records/compare`)
        .query({ exercise: 'Bench Press', ...query });

    const MONTH_IN_HCM = { period: 'month', tz: 'Asia/Ho_Chi_Minh', anchor: '2026-11-15' };

    it('compares the month containing the anchor with the month before it', async () => {
      const [october] = await logBench('2026-10-31', [set(5, 100)]);
      const [november] = await logBench('2026-11-01', [set(5, 105)]);

      const res = await compare(MONTH_IN_HCM);

      expect(res.status).toBe(200);
      const { data } = bodyOf<CompareBody>(res);
      expect(data.unit).toBe('kg');
      expect(data.current.range).toEqual({ from: '2026-11-01', to: '2026-11-30' });
      expect(data.previous.range).toEqual({ from: '2026-10-01', to: '2026-10-31' });
      expect(data.current.records.maxWeight).toMatchObject({
        value: 105,
        achievedOn: '2026-11-01',
        setId: november,
      });
      expect(data.previous.records.maxWeight).toMatchObject({
        value: 100,
        achievedOn: '2026-10-31',
        setId: october,
      });
      expect(data.delta.maxWeight).toEqual({ absolute: 5, percent: 5, improved: true });
      expect(data.delta.maxVolume).toEqual({ absolute: 25, percent: 5, improved: true });
      expect(bodyOf<CompareBody>(res).meta).toEqual({});
    });

    it('reports an improvement without a percentage when the previous period is empty', async () => {
      await logBench('2026-11-01', [set(5, 105)]);

      const res = await compare(MONTH_IN_HCM);

      expect(res.status).toBe(200);
      expect(bodyOf<CompareBody>(res).data.previous.records).toEqual(NO_RECORDS);
      expect(bodyOf<CompareBody>(res).data.delta.maxWeight).toEqual({
        absolute: null,
        percent: null,
        improved: true,
      });
    });

    it('accepts the custom form with four dates', async () => {
      await logBench('2026-10-31', [set(5, 100)]);
      await logBench('2026-11-01', [set(5, 105)]);

      const res = await compare({
        baseFrom: '2026-11-01',
        baseTo: '2026-11-30',
        compareFrom: '2026-10-01',
        compareTo: '2026-10-31',
        unit: 'lb',
      });

      expect(res.status).toBe(200);
      expect(bodyOf<CompareBody>(res).data.unit).toBe('lb');
      expect(bodyOf<CompareBody>(res).data.current.range).toEqual({
        from: '2026-11-01',
        to: '2026-11-30',
      });
      expect(bodyOf<CompareBody>(res).data.previous.range).toEqual({
        from: '2026-10-01',
        to: '2026-10-31',
      });
      expect(bodyOf<CompareBody>(res).data.delta.maxWeight).toEqual({
        absolute: 11.02,
        percent: 5,
        improved: true,
      });
    });

    it('rejects mixing the preset and custom forms', async () => {
      const res = await compare({
        period: 'month',
        baseFrom: '2026-11-01',
        baseTo: '2026-11-30',
        compareFrom: '2026-10-01',
        compareTo: '2026-10-31',
      });

      expect(res.status).toBe(400);
      expect(errorOf(res).code).toBe('VALIDATION_ERROR');
      expect(errorFields(res)).toContain('period');
    });

    it('rejects an incomplete custom form', async () => {
      const res = await compare({ baseFrom: '2026-11-01', baseTo: '2026-11-30' });

      expect(res.status).toBe(400);
      expect(errorFields(res)).toEqual(['compareFrom', 'compareTo']);
    });
  });
});

import { Decimal } from 'decimal.js';
import {
  bodyOf,
  countRows,
  errorFields,
  errorOf,
  entry,
  findBests,
  findSets,
  logWorkouts,
  NO_ROWS,
  set,
  type ErrorBody,
} from './setup/fixtures';
import { createTestApp, resetDatabase, type TestApp } from './setup/test-app';

const USER = 'user_log';
const DAY = '2026-10-30';

interface LoggedBody {
  data: {
    entries: {
      id: string;
      date: string;
      exercise: { id: number; name: string };
      sets: {
        id: string;
        setIndex: number;
        reps: number;
        weight: number;
        unit: string;
        weightKg: number;
      }[];
    }[];
  };
}

describe('POST /users/:userId/workouts', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });

  beforeEach(() => resetDatabase(t.dataSource));

  afterAll(() => t.close());

  const log = (entries: unknown[], headers?: Record<string, string>) =>
    logWorkouts(t.http, USER, entries, headers);

  const benchSet = (weight = 100) =>
    entry({ date: DAY, exerciseName: 'Bench Press', sets: [set(5, weight)] });

  describe('happy path', () => {
    it('saves a bulk request with mixed units and the same exercise twice on one day', async () => {
      const res = await log([
        entry({ date: DAY, exerciseName: 'Bench Press', sets: [set(5, 100), set(8, 90)] }),
        entry({ date: DAY, exerciseName: 'bench press', sets: [set(3, 225, 'lb')] }),
        entry({ date: DAY, exerciseName: 'Back Squat', sets: [set(5, 140)] }),
      ]);

      expect(res.status).toBe(201);
      const body = bodyOf<LoggedBody>(res);
      expect(body.data.entries).toHaveLength(3);
      expect(body.data.entries[1]).toMatchObject({
        date: DAY,
        exercise: { name: 'Bench Press' },
        sets: [{ setIndex: 1, reps: 3, weight: 225, unit: 'lb', weightKg: 102.06 }],
      });

      expect(await countRows(t.dataSource)).toEqual({
        entries: 3,
        sets: 4,
        bests: 2,
        idempotencyKeys: 0,
      });

      const lbSetId = body.data.entries[1]!.sets[0]!.id;
      const lbSet = (await findSets(t.dataSource)).find((s) => s.id === lbSetId)!;
      expect(lbSet.unit).toBe('lb');
      expect(lbSet.weight.equals(225)).toBe(true);
      expect(lbSet.weightKg.equals(new Decimal('102.0583'))).toBe(true);

      // One row for Bench Press although it was logged twice that day; the 225 lb set is the heaviest.
      const benchId = body.data.entries[0]!.exercise.id;
      const benchBests = (await findBests(t.dataSource)).filter((b) => b.exerciseId === benchId);
      expect(benchBests).toHaveLength(1);
      expect(benchBests[0]).toMatchObject({
        performedOn: DAY,
        bestWeightKg: '102.0583',
        bestWeightSetId: lbSetId,
        bestVolumeKg: '720.0000',
        bestVolumeSetId: body.data.entries[0]!.sets[1]!.id,
      });
    });

    it('stores a unit alias as its code', async () => {
      const res = await log([
        entry({ date: DAY, exerciseName: 'Bench Press', sets: [set(5, 135, 'LBS')] }),
      ]);

      expect(res.status).toBe(201);
      expect(bodyOf<LoggedBody>(res).data.entries[0]!.sets[0]!.unit).toBe('lb');
      expect((await findSets(t.dataSource))[0]!.unit).toBe('lb');
    });
  });

  describe('validation', () => {
    const withEntry = (patch: Record<string, unknown>) => [{ ...benchSet(), ...patch }];
    const withSet = (patch: Record<string, unknown>) =>
      withEntry({ sets: [{ ...set(5, 100), ...patch }] });

    it.each([
      ['date is null', withEntry({ date: null }), 'entries[0].date'],
      ['date does not exist', withEntry({ date: '2026-02-30' }), 'entries[0].date'],
      ['date has the wrong format', withEntry({ date: '30/10/2026' }), 'entries[0].date'],
      ['date is too far in the future', withEntry({ date: '2999-01-01' }), 'entries[0].date'],
      ['reps is negative', withSet({ reps: -1 }), 'entries[0].sets[0].reps'],
      ['reps is 0', withSet({ reps: 0 }), 'entries[0].sets[0].reps'],
      ['weight is negative', withSet({ weight: -5 }), 'entries[0].sets[0].weight'],
      ['weight is a string', withSet({ weight: '100' }), 'entries[0].sets[0].weight'],
      ['sets is empty', withEntry({ sets: [] }), 'entries[0].sets'],
      ['entries is empty', [], 'entries'],
      ['an entry has an unknown field', withEntry({ notes: 'heavy' }), 'entries[0].notes'],
    ])('rejects a body where %s', async (_, entries, field) => {
      const res = await log(entries);

      expect(res.status).toBe(400);
      expect(errorOf(res).code).toBe('VALIDATION_ERROR');
      expect(errorFields(res)).toContain(field);
      expect(await countRows(t.dataSource)).toEqual(NO_ROWS);
    });

    it('lists the supported units when the unit is unknown', async () => {
      const res = await log(withSet({ unit: 'stn' }));

      expect(res.status).toBe(400);
      expect(errorOf(res).details).toEqual([
        {
          field: 'entries[0].sets[0].unit',
          issue: "Unsupported unit 'stn'. Supported units: kg, lb",
        },
      ]);
    });

    it('rejects a weight above 1000 kg after conversion', async () => {
      const res = await log(withSet({ weight: 2300, unit: 'lb' }));

      expect(res.status).toBe(400);
      expect(errorOf(res)).toEqual({
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        details: [{ field: 'entries[0].sets[0].weight', issue: 'exceeds maximum of 1000 kg' }],
      });
    });

    it('rejects an unknown top-level field', async () => {
      const res = await t
        .http()
        .post(`/api/v1/users/${USER}/workouts`)
        .send({ entries: [benchSet()], userId: USER });

      expect(res.status).toBe(400);
      expect(errorFields(res)).toEqual(['userId']);
    });

    it('rejects a malformed userId in the path', async () => {
      const res = await logWorkouts(t.http, 'bad user!', [benchSet()]);

      expect(res.status).toBe(400);
      expect(errorOf(res).code).toBe('VALIDATION_ERROR');
      expect(errorFields(res)).toEqual(['userId']);
    });

    it('rejects a body that is not valid JSON', async () => {
      const res = await t
        .http()
        .post(`/api/v1/users/${USER}/workouts`)
        .set('Content-Type', 'application/json')
        .send('{"entries": [');

      expect(res.status).toBe(400);
      expect(errorOf(res).code).toBe('VALIDATION_ERROR');
      expect(errorOf(res).details).toEqual([]);
      expect(bodyOf<ErrorBody>(res).requestId).toBe(res.get('x-request-id'));
    });

    it('rejects a malformed Idempotency-Key header', async () => {
      const res = await log([benchSet()], { 'Idempotency-Key': 'has space' });

      expect(res.status).toBe(400);
      expect(errorFields(res)).toEqual(['headers.idempotency-key']);
    });
  });

  describe('catalog', () => {
    it('reports every unknown exercise at once and saves nothing', async () => {
      const res = await log([
        entry({ date: DAY, exerciseName: 'Bech Press', sets: [set(5, 100)] }),
        benchSet(),
        entry({ date: DAY, exerciseName: 'Moon Squat', sets: [set(5, 100)] }),
      ]);

      expect(res.status).toBe(400);
      expect(errorOf(res).code).toBe('UNKNOWN_EXERCISE');
      expect(errorOf(res).details).toEqual([
        { field: 'entries[0].exerciseName', issue: "Unknown exercise 'Bech Press'" },
        { field: 'entries[2].exerciseName', issue: "Unknown exercise 'Moon Squat'" },
      ]);
      expect(await countRows(t.dataSource)).toEqual(NO_ROWS);
    });

    it('resolves names regardless of case and whitespace', async () => {
      const res = await log([
        entry({ date: DAY, exerciseName: ' BENCH   press ', sets: [set(5, 100)] }),
      ]);

      expect(res.status).toBe(201);
      expect(bodyOf<LoggedBody>(res).data.entries[0]!.exercise.name).toBe('Bench Press');
    });
  });

  describe('atomicity', () => {
    it('saves nothing, including daily bests, when one entry is invalid', async () => {
      const res = await log([
        benchSet(),
        entry({ date: DAY, exerciseName: 'Back Squat', sets: [set(1, 1001)] }),
      ]);

      expect(res.status).toBe(400);
      expect(errorFields(res)).toEqual(['entries[1].sets[0].weight']);
      expect(await countRows(t.dataSource)).toEqual(NO_ROWS);
    });
  });

  describe('idempotency', () => {
    const KEY = { 'Idempotency-Key': 'log-2026-10-30-a' };

    it('replays the stored response for the same key and body without writing again', async () => {
      const first = await log([benchSet()], KEY);
      const after = await countRows(t.dataSource);

      const retry = await log([benchSet()], KEY);

      expect(first.status).toBe(201);
      expect(first.headers['idempotent-replayed']).toBeUndefined();
      expect(retry.status).toBe(201);
      expect(retry.headers['idempotent-replayed']).toBe('true');
      expect(retry.body).toEqual(first.body);
      expect(await countRows(t.dataSource)).toEqual(after);
      expect(after).toEqual({ entries: 1, sets: 1, bests: 1, idempotencyKeys: 1 });
    });

    it('treats a different JSON key order and a unit alias as the same body', async () => {
      const first = await log(
        [entry({ date: DAY, exerciseName: 'Bench Press', sets: [set(5, 225, 'lb')] })],
        KEY,
      );

      const retry = await t
        .http()
        .post(`/api/v1/users/${USER}/workouts`)
        .set(KEY)
        .set('Content-Type', 'application/json')
        .send(
          `{"entries":[{"sets":[{"unit":"LBS","weight":225,"reps":5}],"exerciseName":"Bench Press","date":"${DAY}"}]}`,
        );

      expect(retry.status).toBe(201);
      expect(retry.headers['idempotent-replayed']).toBe('true');
      expect(retry.body).toEqual(first.body);
      expect((await countRows(t.dataSource)).entries).toBe(1);
    });

    it('rejects the same key with a different body', async () => {
      await log([benchSet(100)], KEY);

      const res = await log([benchSet(105)], KEY);

      expect(res.status).toBe(422);
      expect(errorOf(res).code).toBe('IDEMPOTENCY_KEY_REUSED');
      expect((await countRows(t.dataSource)).entries).toBe(1);
    });

    it('lets the client retry the key after a failed first request', async () => {
      const failed = await log(
        [entry({ date: DAY, exerciseName: 'Bech Press', sets: [set(5, 100)] })],
        KEY,
      );
      expect(failed.status).toBe(400);
      expect(await countRows(t.dataSource)).toEqual(NO_ROWS);

      const fixed = await log([benchSet()], KEY);

      expect(fixed.status).toBe(201);
      expect(fixed.headers['idempotent-replayed']).toBeUndefined();
      expect(await countRows(t.dataSource)).toEqual({
        entries: 1,
        sets: 1,
        bests: 1,
        idempotencyKeys: 1,
      });
    });

    it('scopes keys per user', async () => {
      await log([benchSet()], KEY);

      const other = await logWorkouts(t.http, 'user_other', [benchSet()], KEY);

      expect(other.status).toBe(201);
      expect(other.headers['idempotent-replayed']).toBeUndefined();
      expect((await countRows(t.dataSource)).entries).toBe(2);
    });
  });
});

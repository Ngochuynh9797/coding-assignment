import { bodyOf, type ErrorBody } from './setup/fixtures';
import { createTestApp, type TestApp } from './setup/test-app';

interface ExerciseBody {
  id: number;
  name: string;
  muscleGroups: string[];
}

describe('GET /exercises', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(() => t.close());

  async function list(query: Record<string, string> = {}): Promise<ExerciseBody[]> {
    const res = await t.http().get('/api/v1/exercises').query(query);
    expect(res.status).toBe(200);
    return (res.body as { data: ExerciseBody[] }).data;
  }

  const names = (exercises: ExerciseBody[]): string[] => exercises.map((e) => e.name);

  // The full order is not compared with a JS sort: the database collation (en_US.utf8) ignores spaces
  // at the first level ('Lateral Raise' < 'Lat Pulldown'), which localeCompare does not.
  it('returns the seeded catalog sorted by name', async () => {
    const exercises = await list();

    expect(exercises.length).toBeGreaterThan(50);
    expect(exercises[0]?.name).toBe('Ab Wheel Rollout');
    expect(exercises.find((e) => e.name === 'Bench Press')?.muscleGroups).toEqual([
      'chest',
      'shoulders',
      'triceps',
    ]);
  });

  it('matches a partial name, including longer names that contain it', async () => {
    const result = names(await list({ search: 'bench' }));

    expect(result).toEqual(expect.arrayContaining(['Bench Press', 'Incline Bench Press']));
    expect(result).not.toContain('Back Squat');
  });

  it('treats _ and % literally instead of matching everything', async () => {
    expect(await list({ search: '_' })).toEqual([]);
    expect(await list({ search: '%' })).toEqual([]);
  });

  it('normalizes case and repeated whitespace in the search term', async () => {
    expect(names(await list({ search: 'Bench  Press' }))).toContain('Bench Press');
    expect(names(await list({ search: ' INCLINE bench ' }))).toEqual(['Incline Bench Press']);
  });

  it('filters by muscle group and keeps every group of a match', async () => {
    const chest = await list({ muscleGroup: 'chest' });

    expect(chest.length).toBeGreaterThan(0);
    expect(chest.every((e) => e.muscleGroups.includes('chest'))).toBe(true);
    expect(chest.find((e) => e.name === 'Bench Press')?.muscleGroups).toHaveLength(3);
    expect(names(chest)).not.toContain('Back Squat');
  });

  it('returns an empty list for an unknown muscle group', async () => {
    expect(await list({ muscleGroup: 'unknown' })).toEqual([]);
  });

  it('rejects an invalid query with the shared error format', async () => {
    const res = await t.http().get('/api/v1/exercises').query({ search: ' ', extra: '1' });

    expect(res.status).toBe(400);
    const body = bodyOf<ErrorBody>(res);
    expect(Object.keys(body)).toEqual(['error', 'requestId']);
    expect(body.requestId).toBe(res.get('x-request-id'));
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.message).toBe('Request validation failed');
    expect(body.error.details.map((d) => d.field).sort()).toEqual(['extra', 'search']);
  });
});

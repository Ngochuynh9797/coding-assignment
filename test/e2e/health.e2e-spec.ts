import { errorOf } from './setup/fixtures';
import { createTestApp, type TestApp } from './setup/test-app';

describe('GET /health', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(() => t.close());

  it('reports the database as up', async () => {
    const res = await t.http().get('/api/v1/health');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', db: 'up' });
    expect(res.headers['x-request-id']).toEqual(expect.any(String));
  });

  it('is only served under the global prefix', async () => {
    const res = await t.http().get('/health');

    expect(res.status).toBe(404);
    expect(errorOf(res).code).toBe('NOT_FOUND');
  });
});

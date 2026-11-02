import { DataSource } from 'typeorm';
import { buildHistoryPageQuery, type HistoryPageParams } from './history-query.builder';

// Never initialized: the SQL is rendered without connecting.
const dataSource = new DataSource({ type: 'postgres' });

function render(overrides: Partial<HistoryPageParams> = {}): [string, unknown[]] {
  const params: HistoryPageParams = {
    userId: 'user_1',
    exerciseIds: null,
    limit: 20,
    ...overrides,
  };
  return buildHistoryPageQuery(dataSource.createQueryBuilder(), params).getQueryAndParameters();
}

const cursor = { performedOn: '2026-10-31', id: '019a3f2e-7c41-7d3a-9b2e-5f1c8a6d4e21' };

describe('buildHistoryPageQuery', () => {
  it('without filters reads only by user, newest first, one row past the limit', () => {
    const [sql, params] = render();

    expect(sql).toMatch(
      /FROM "workout_entries" "e" INNER JOIN "exercises" "x" ON x\.id = e\.exercise_id/,
    );
    expect(sql).toMatch(
      /WHERE e\.user_id = \$1 ORDER BY e\.performed_on DESC, e\.id DESC LIMIT 21$/,
    );
    expect(params).toEqual(['user_1']);
  });

  it('selects the entry columns and the current display name', () => {
    const [sql] = render();

    for (const column of [
      'e.id',
      'e.exercise_id',
      'x.display_name',
      'e.performed_on',
      'e.created_at',
    ]) {
      expect(sql).toContain(`${column} AS`);
    }
  });

  it('filters by exercise ids with ANY', () => {
    const [sql, params] = render({ exerciseIds: [1, 3] });

    expect(sql).toMatch(
      /WHERE e\.user_id = \$1 AND e\.exercise_id = ANY\(CAST\(\$2 AS int\[\]\)\) ORDER BY/,
    );
    expect(params).toEqual(['user_1', [1, 3]]);
  });

  it('adds only the lower bound when only from is given', () => {
    const [sql, params] = render({ from: '2026-10-01' });

    expect(sql).toMatch(/AND e\.performed_on >= \$2 ORDER BY/);
    expect(sql).not.toMatch(/e\.performed_on <=/);
    expect(params).toEqual(['user_1', '2026-10-01']);
  });

  it('adds only the upper bound when only to is given', () => {
    const [sql, params] = render({ to: '2026-10-31' });

    expect(sql).toMatch(/AND e\.performed_on <= \$2 ORDER BY/);
    expect(sql).not.toMatch(/e\.performed_on >=/);
    expect(params).toEqual(['user_1', '2026-10-31']);
  });

  it('adds both bounds for a range', () => {
    const [sql, params] = render({ from: '2026-10-01', to: '2026-10-31' });

    expect(sql).toMatch(/AND e\.performed_on >= \$2 AND e\.performed_on <= \$3 ORDER BY/);
    expect(params).toEqual(['user_1', '2026-10-01', '2026-10-31']);
  });

  it('continues after the cursor with a single row comparison', () => {
    const [sql, params] = render({ cursor });

    expect(sql).toMatch(
      /AND \(e\.performed_on, e\.id\) < \(CAST\(\$2 AS date\), CAST\(\$3 AS uuid\)\) ORDER BY/,
    );
    expect(sql).not.toMatch(/e\.id </);
    expect(params).toEqual(['user_1', cursor.performedOn, cursor.id]);
  });

  it('binds every filter in order when all are given', () => {
    const [sql, params] = render({
      exerciseIds: [1],
      from: '2026-10-01',
      to: '2026-10-31',
      cursor,
      limit: 5,
    });

    expect(sql).toMatch(
      /WHERE e\.user_id = \$1 AND e\.exercise_id = ANY\(CAST\(\$2 AS int\[\]\)\) AND e\.performed_on >= \$3 AND e\.performed_on <= \$4 AND \(e\.performed_on, e\.id\) < \(CAST\(\$5 AS date\), CAST\(\$6 AS uuid\)\) ORDER BY e\.performed_on DESC, e\.id DESC LIMIT 6$/,
    );
    expect(params).toEqual([
      'user_1',
      [1],
      '2026-10-01',
      '2026-10-31',
      cursor.performedOn,
      cursor.id,
    ]);
  });

  it('never uses OFFSET or COUNT', () => {
    const [sql] = render({ exerciseIds: [1], from: '2026-10-01', to: '2026-10-31', cursor });

    expect(sql).not.toMatch(/OFFSET|COUNT/i);
  });
});

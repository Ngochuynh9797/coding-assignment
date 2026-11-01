import { Decimal } from 'decimal.js';
import type { EntityManager } from 'typeorm';
import { DailyBestsWriter } from './daily-bests.writer';
import type { PrSetInput } from './domain/pr-calculator';

function set(
  setId: string,
  exerciseId: number,
  performedOn: string,
  reps: number,
  kg: string,
): PrSetInput {
  return { setId, exerciseId, performedOn, reps, weightKg: new Decimal(kg) };
}

describe('DailyBestsWriter', () => {
  let query: jest.Mock;
  let tx: EntityManager;
  const writer = new DailyBestsWriter();

  beforeEach(() => {
    query = jest.fn().mockResolvedValue([]);
    tx = { query } as unknown as EntityManager;
  });

  it('upserts one row per (exercise, day) sorted by exercise then date, in one query', async () => {
    await writer.applySets(tx, 'user_1', [
      set('s1', 7, '2026-10-31', 5, '140'),
      set('s2', 1, '2026-10-31', 5, '102.0583'),
      set('s3', 1, '2026-10-30', 3, '100'),
      set('s4', 7, '2026-10-31', 1, '150'),
    ]);

    expect(query).toHaveBeenCalledTimes(1);
    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/ORDER BY t\.exercise_id, t\.performed_on/);
    expect(sql).toMatch(/ON CONFLICT \(user_id, exercise_id, performed_on\) DO UPDATE/);
    expect(params).toEqual([
      'user_1',
      [1, 1, 7],
      ['2026-10-30', '2026-10-31', '2026-10-31'],
      ['100.0000', '102.0583', '150.0000'],
      ['s3', 's2', 's4'],
      ['300.0000', '510.2915', '700.0000'],
      ['s3', 's2', 's1'],
      ['110.0000', '119.0680', '163.3333'],
      ['s3', 's2', 's1'],
    ]);
  });

  it('does not query when there are no bests', async () => {
    await writer.upsertBests(tx, 'user_1', []);

    expect(query).not.toHaveBeenCalled();
  });
});

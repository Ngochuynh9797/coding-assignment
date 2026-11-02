import { Decimal } from 'decimal.js';
import { UnitConverter } from '@shared/units/unit-converter';
import { WEIGHT_UNITS } from '@shared/units/unit.registry';
import { emptyHistoryResponse, toHistoryResponse } from './history.mapper';
import type { HistoryEntryRow, HistoryPage, HistorySetRow } from './workout-history.repository';

const converter = new UnitConverter(WEIGHT_UNITS);

const bench: HistoryEntryRow = {
  id: 'entry-1',
  exerciseId: 1,
  exerciseName: 'Bench Press',
  performedOn: '2026-10-31',
  createdAt: new Date('2026-10-31T10:15:00.000Z'),
};
const squat: HistoryEntryRow = {
  id: 'entry-2',
  exerciseId: 7,
  exerciseName: 'Back Squat',
  performedOn: '2026-10-30',
  createdAt: new Date('2026-10-30T09:00:00.000Z'),
};

function set(
  entryId: string,
  setIndex: number,
  weight: string,
  unit: string,
  weightKg: string,
): HistorySetRow {
  return {
    entryId,
    setIndex,
    reps: 5,
    weight: new Decimal(weight),
    unit,
    weightKg: new Decimal(weightKg),
  };
}

const page = (entries: HistoryEntryRow[], nextCursor: string | null = null): HistoryPage => ({
  entries,
  hasMore: nextCursor !== null,
  nextCursor,
});

const sets = [
  set('entry-2', 1, '100', 'kg', '100'),
  set('entry-1', 1, '225', 'lb', '102.0583'),
  set('entry-1', 2, '102.5625', 'kg', '102.5625'),
];

describe('toHistoryResponse', () => {
  it('without a unit returns the original weights and no converted field', () => {
    const response = toHistoryResponse(page([bench, squat]), sets, undefined, converter);

    expect(response).toEqual({
      data: [
        {
          id: 'entry-1',
          date: '2026-10-31',
          exercise: { id: 1, name: 'Bench Press' },
          sets: [
            { setIndex: 1, reps: 5, weight: 225, unit: 'lb' },
            { setIndex: 2, reps: 5, weight: 102.5625, unit: 'kg' },
          ],
          loggedAt: '2026-10-31T10:15:00.000Z',
        },
        {
          id: 'entry-2',
          date: '2026-10-30',
          exercise: { id: 7, name: 'Back Squat' },
          sets: [{ setIndex: 1, reps: 5, weight: 100, unit: 'kg' }],
          loggedAt: '2026-10-30T09:00:00.000Z',
        },
      ],
      pageInfo: { nextCursor: null, hasMore: false },
      meta: {},
    });
    expect(response.data[0]!.sets[0]).not.toHaveProperty('converted');
  });

  it('with unit=lb keeps a lb set exactly and converts a kg set from its original weight', () => {
    const response = toHistoryResponse(page([bench, squat]), sets, 'lb', converter);

    expect(response.data[0]!.sets[0]).toEqual({
      setIndex: 1,
      reps: 5,
      weight: 225,
      unit: 'lb',
      converted: { weight: 225, unit: 'lb' },
    });
    expect(response.data[1]!.sets[0]).toEqual({
      setIndex: 1,
      reps: 5,
      weight: 100,
      unit: 'kg',
      converted: { weight: 220.46, unit: 'lb' },
    });
  });

  it('rounds converted weights to 2 decimals but keeps the original precision', () => {
    const response = toHistoryResponse(page([bench]), sets, 'kg', converter);

    expect(response.data[0]!.sets).toEqual([
      { setIndex: 1, reps: 5, weight: 225, unit: 'lb', converted: { weight: 102.06, unit: 'kg' } },
      {
        setIndex: 2,
        reps: 5,
        weight: 102.5625,
        unit: 'kg',
        converted: { weight: 102.56, unit: 'kg' },
      },
    ]);
  });

  it('passes the page info through', () => {
    const response = toHistoryResponse(page([bench], 'cursor-abc'), sets, undefined, converter);

    expect(response.pageInfo).toEqual({ nextCursor: 'cursor-abc', hasMore: true });
  });

  it('returns the empty response with a message when the page has no entries', () => {
    expect(toHistoryResponse(page([]), [], 'kg', converter)).toEqual(emptyHistoryResponse());
  });
});

describe('emptyHistoryResponse', () => {
  it('has no data, no next page and a message', () => {
    expect(emptyHistoryResponse()).toEqual({
      data: [],
      pageInfo: { nextCursor: null, hasMore: false },
      meta: { message: 'No workouts found for the given filters' },
    });
  });
});

import { Decimal } from 'decimal.js';
import { UnitConverter } from '@shared/units/unit-converter';
import { WEIGHT_UNITS } from '@shared/units/unit.registry';
import type { PrMetric, RecordRow } from './daily-bests.repository';
import { recordValueKg, toRecords, toRecordsResponse } from './pr.mapper';

const converter = new UnitConverter(WEIGHT_UNITS);
const exercise = { id: 1, displayName: 'Bench Press' };
const noRange = { from: null, to: null };

function row(
  performedOn: string,
  valueKg: string,
  setId: string,
  reps: number,
  weight: string,
  unit: string,
  weightKg: string,
): RecordRow {
  return {
    performedOn,
    valueKg: new Decimal(valueKg),
    setId,
    reps,
    weight: new Decimal(weight),
    unit,
    weightKg: new Decimal(weightKg),
  };
}

// 225 lb × 3 on 10-12; 200 lb × 10 on 10-20 (weight_kg 90.7185, volume 907.185, e1rm 120.958).
const heavy = row('2026-10-12', '102.0583', 'set-heavy', 3, '225', 'lb', '102.0583');
const volume = row('2026-10-20', '907.1850', 'set-volume', 10, '200', 'lb', '90.7185');
const e1rm = row('2026-10-20', '120.9580', 'set-volume', 10, '200', 'lb', '90.7185');

function rows(
  entries: Partial<Record<PrMetric, RecordRow | null>>,
): Map<PrMetric, RecordRow | null> {
  return new Map<PrMetric, RecordRow | null>([
    ['maxWeight', entries.maxWeight ?? null],
    ['maxVolume', entries.maxVolume ?? null],
    ['bestEstimated1RM', entries.bestEstimated1RM ?? null],
  ]);
}

const allRecords = rows({ maxWeight: heavy, maxVolume: volume, bestEstimated1RM: e1rm });

describe('toRecordsResponse', () => {
  it('without a unit uses the unit of each winning set and keeps 225 lb exact', () => {
    expect(toRecordsResponse(exercise, noRange, allRecords, undefined, converter)).toEqual({
      data: {
        exercise: { id: 1, name: 'Bench Press' },
        range: { from: null, to: null },
        records: {
          maxWeight: {
            value: 225,
            unit: 'lb',
            weight: 225,
            reps: 3,
            achievedOn: '2026-10-12',
            setId: 'set-heavy',
          },
          maxVolume: {
            value: 2000,
            unit: 'lb',
            weight: 200,
            reps: 10,
            achievedOn: '2026-10-20',
            setId: 'set-volume',
          },
          bestEstimated1RM: {
            value: 266.67,
            unit: 'lb',
            weight: 200,
            reps: 10,
            achievedOn: '2026-10-20',
            setId: 'set-volume',
          },
        },
      },
      meta: {},
    });
  });

  it('with unit=kg converts lb sets: weight from the original value, derived values from kg', () => {
    const { records } = toRecordsResponse(exercise, noRange, allRecords, 'kg', converter).data;

    expect(records.maxWeight).toMatchObject({ value: 102.06, unit: 'kg', weight: 102.06, reps: 3 });
    expect(records.maxVolume).toMatchObject({ value: 907.19, unit: 'kg', weight: 90.72, reps: 10 });
    expect(records.bestEstimated1RM).toMatchObject({ value: 120.96, unit: 'kg', weight: 90.72 });
  });

  it('turns a bodyweight record (best value 0) into null', () => {
    const bodyweight = row('2026-10-05', '0', 'set-bw', 12, '0', 'kg', '0');
    const { records } = toRecordsResponse(
      exercise,
      noRange,
      rows({ maxWeight: bodyweight, maxVolume: volume, bestEstimated1RM: bodyweight }),
      undefined,
      converter,
    ).data;

    expect(records.maxWeight).toBeNull();
    expect(records.bestEstimated1RM).toBeNull();
    expect(records.maxVolume).not.toBeNull();
  });

  it('returns null records and a message when nothing was found, echoing the range', () => {
    const range = { from: '2026-09-01', to: '2026-09-30' };

    expect(toRecordsResponse(exercise, range, rows({}), undefined, converter)).toEqual({
      data: {
        exercise: { id: 1, name: 'Bench Press' },
        range,
        records: { maxWeight: null, maxVolume: null, bestEstimated1RM: null },
      },
      meta: { message: 'No weighted sets for this exercise in the given range' },
    });
  });

  it('gives the message when every record is bodyweight', () => {
    const bodyweight = row('2026-10-05', '0', 'set-bw', 12, '0', 'kg', '0');
    const response = toRecordsResponse(
      exercise,
      noRange,
      rows({ maxWeight: bodyweight, maxVolume: bodyweight, bestEstimated1RM: bodyweight }),
      undefined,
      converter,
    );

    expect(response.meta).toEqual({
      message: 'No weighted sets for this exercise in the given range',
    });
  });
});

describe('toRecords', () => {
  it('maps every metric in the requested unit', () => {
    const records = toRecords(allRecords, 'lb', converter);

    expect(Object.keys(records)).toEqual(['maxWeight', 'maxVolume', 'bestEstimated1RM']);
    expect(records.maxWeight?.value).toBe(225);
  });
});

describe('recordValueKg', () => {
  it('returns the stored kg value, or null for a missing or bodyweight record', () => {
    expect(recordValueKg(heavy)?.toFixed()).toBe('102.0583');
    expect(recordValueKg(null)).toBeNull();
    expect(recordValueKg(row('2026-10-05', '0', 'set-bw', 12, '0', 'kg', '0'))).toBeNull();
  });
});

import type { Decimal } from 'decimal.js';
import { roundForOutput, type UnitConverter } from '@shared/units/unit-converter';
import {
  PR_METRICS,
  type PrMetric,
  type RecordRow,
  type RecordRows,
} from './daily-bests.repository';

export interface PrRecord {
  value: number;
  unit: string;
  weight: number;
  reps: number;
  achievedOn: string;
  setId: string;
}

export type PrRecords = Record<PrMetric, PrRecord | null>;

export interface EchoedRange {
  from: string | null;
  to: string | null;
}

export interface PersonalRecordsResponse {
  data: {
    exercise: { id: number; name: string };
    range: EchoedRange;
    records: PrRecords;
  };
  meta: { message?: string };
}

export const NO_RECORDS_MESSAGE = 'No weighted sets for this exercise in the given range';

// A best of 0 kg means only bodyweight sets were logged: there is no weighted record to report.
export function recordValueKg(row: RecordRow | null): Decimal | null {
  return row === null || row.valueKg.isZero() ? null : row.valueKg;
}

export function hasAnyRecord(records: PrRecords): boolean {
  return PR_METRICS.some((metric) => records[metric] !== null);
}

export function toRecords(
  rows: RecordRows,
  unit: string | undefined,
  converter: UnitConverter,
): PrRecords {
  const records = {} as PrRecords;
  for (const metric of PR_METRICS) {
    records[metric] = toRecord(metric, rows.get(metric) ?? null, unit, converter);
  }
  return records;
}

export function toRecordsResponse(
  exercise: { id: number; displayName: string },
  range: EchoedRange,
  rows: RecordRows,
  unit: string | undefined,
  converter: UnitConverter,
): PersonalRecordsResponse {
  const records = toRecords(rows, unit, converter);
  return {
    data: { exercise: { id: exercise.id, name: exercise.displayName }, range, records },
    meta: hasAnyRecord(records) ? {} : { message: NO_RECORDS_MESSAGE },
  };
}

// Values are read as stored, never recomputed: PR formulas live only in PrCalculator.
function toRecord(
  metric: PrMetric,
  row: RecordRow | null,
  unit: string | undefined,
  converter: UnitConverter,
): PrRecord | null {
  const valueKg = recordValueKg(row);
  if (row === null || valueKg === null) {
    return null;
  }
  const target = unit ?? row.unit;
  // From the original weight, so 225 lb stays exactly 225 lb.
  const weight = converter.convertForOutput(row, target);
  const value = metric === 'maxWeight' ? weight : converter.fromKg(valueKg, target);
  return {
    value: roundForOutput(value),
    unit: target,
    weight: roundForOutput(weight),
    reps: row.reps,
    achievedOn: row.performedOn,
    setId: row.setId,
  };
}

import { roundForOutput, type UnitConverter } from '@shared/units/unit-converter';
import type { HistoryPage, HistorySetRow } from './workouts.repository';

export interface HistorySet {
  setIndex: number;
  reps: number;
  weight: number;
  unit: string;
  converted?: { weight: number; unit: string };
}

export interface HistoryEntry {
  id: string;
  date: string;
  exercise: { id: number; name: string };
  sets: HistorySet[];
  loggedAt: string;
}

export interface HistoryResponse {
  data: HistoryEntry[];
  pageInfo: { nextCursor: string | null; hasMore: boolean };
  meta: { message?: string };
}

export function emptyHistoryResponse(): HistoryResponse {
  return {
    data: [],
    pageInfo: { nextCursor: null, hasMore: false },
    meta: { message: 'No workouts found for the given filters' },
  };
}

export function toHistoryResponse(
  page: HistoryPage,
  sets: HistorySetRow[],
  unit: string | undefined,
  converter: UnitConverter,
): HistoryResponse {
  if (page.entries.length === 0) {
    return emptyHistoryResponse();
  }
  const setsByEntry = new Map<string, HistorySet[]>();
  for (const set of sets) {
    const mapped = toHistorySet(set, unit, converter);
    const list = setsByEntry.get(set.entryId);
    if (list) {
      list.push(mapped);
    } else {
      setsByEntry.set(set.entryId, [mapped]);
    }
  }
  return {
    data: page.entries.map((entry) => ({
      id: entry.id,
      date: entry.performedOn,
      exercise: { id: entry.exerciseId, name: entry.exerciseName },
      sets: setsByEntry.get(entry.id) ?? [],
      loggedAt: entry.createdAt.toISOString(),
    })),
    pageInfo: { nextCursor: page.nextCursor, hasMore: page.hasMore },
    meta: {},
  };
}

function toHistorySet(
  set: HistorySetRow,
  unit: string | undefined,
  converter: UnitConverter,
): HistorySet {
  const mapped: HistorySet = {
    setIndex: set.setIndex,
    reps: set.reps,
    weight: set.weight.toNumber(),
    unit: set.unit,
  };
  if (unit !== undefined) {
    // Stays Decimal until this single rounding; converted from the original weight, not weight_kg.
    mapped.converted = { weight: roundForOutput(converter.convertForOutput(set, unit)), unit };
  }
  return mapped;
}

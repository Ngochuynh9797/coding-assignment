import { Injectable } from '@nestjs/common';
import { CatalogService } from '@modules/catalog/catalog.service';
import { type DateRange, periodRanges } from '@shared/date/period';
import { UnitConverter } from '@shared/units/unit-converter';
import { DailyBestsRepository, PR_METRICS, type PrMetric } from './daily-bests.repository';
import type { CompareQuery } from './dto/compare.query';
import type { PersonalRecordsQuery } from './dto/personal-records.query';
import { type PrDelta, prDelta } from './pr-delta';
import {
  hasAnyRecord,
  type PersonalRecordsResponse,
  type PrRecords,
  recordValueKg,
  toRecords,
  toRecordsResponse,
} from './pr.mapper';

const DEFAULT_TZ = 'UTC';

export const NO_RECORDS_IN_EITHER_PERIOD_MESSAGE =
  'No weighted sets for this exercise in either period';

export interface CompareResponse {
  data: {
    exercise: { id: number; name: string };
    unit: string;
    current: { range: DateRange; records: PrRecords };
    previous: { range: DateRange; records: PrRecords };
    delta: Record<PrMetric, PrDelta>;
  };
  meta: { message?: string };
}

@Injectable()
export class PersonalRecordsService {
  constructor(
    private readonly catalog: CatalogService,
    private readonly repository: DailyBestsRepository,
    private readonly converter: UnitConverter,
  ) {}

  // An exercise missing from the catalog is a 404; one the user never trained is 200 with null records.
  async getRecords(userId: string, query: PersonalRecordsQuery): Promise<PersonalRecordsResponse> {
    const exercise = await this.catalog.getByNameOrThrow(query.exercise);
    const range: { from?: string; to?: string } = {};
    if (query.from !== undefined) {
      range.from = query.from;
    }
    if (query.to !== undefined) {
      range.to = query.to;
    }
    const rows = await this.repository.findRecords(userId, exercise.id, range);
    return toRecordsResponse(
      exercise,
      { from: query.from ?? null, to: query.to ?? null },
      rows,
      query.unit,
      this.converter,
    );
  }

  async compare(userId: string, query: CompareQuery): Promise<CompareResponse> {
    const exercise = await this.catalog.getByNameOrThrow(query.exercise);
    const { current, previous } = rangesOf(query);
    const [currentRows, previousRows] = await Promise.all([
      this.repository.findRecords(userId, exercise.id, current),
      this.repository.findRecords(userId, exercise.id, previous),
    ]);

    const delta = {} as Record<PrMetric, PrDelta>;
    for (const metric of PR_METRICS) {
      delta[metric] = prDelta(
        recordValueKg(currentRows.get(metric) ?? null),
        recordValueKg(previousRows.get(metric) ?? null),
        query.unit,
        this.converter,
      );
    }
    const currentRecords = toRecords(currentRows, query.unit, this.converter);
    const previousRecords = toRecords(previousRows, query.unit, this.converter);

    return {
      data: {
        exercise: { id: exercise.id, name: exercise.displayName },
        unit: query.unit,
        current: { range: current, records: currentRecords },
        previous: { range: previous, records: previousRecords },
        delta,
      },
      meta:
        hasAnyRecord(currentRecords) || hasAnyRecord(previousRecords)
          ? {}
          : { message: NO_RECORDS_IN_EITHER_PERIOD_MESSAGE },
    };
  }
}

// The DTO guarantees exactly one complete form.
function rangesOf(query: CompareQuery): { current: DateRange; previous: DateRange } {
  if (query.period !== undefined) {
    return periodRanges(query.period, query.tz ?? DEFAULT_TZ, query.anchor);
  }
  return {
    current: { from: query.baseFrom!, to: query.baseTo! },
    previous: { from: query.compareFrom!, to: query.compareTo! },
  };
}
